const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { publicFetch } = require('./lib/outbound');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const sharp = require('sharp');
const { validate, validateSite, validateSubscriptions, safeUrl } = require('./lib/content');
const { createStorage, writeAtomic, CONTENT_SECTIONS } = require('./lib/admin-storage');
require('dotenv').config();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3003;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SITE_FILE = path.join(DATA_DIR, 'site.json');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(PUBLIC_DIR, 'assets', 'uploads'));
function containsPath(parent, child) {
    const relative = path.relative(parent, child);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
if (containsPath(PUBLIC_DIR, DATA_DIR) || containsPath(UPLOADS_DIR, DATA_DIR)) {
    throw new Error('DATA_DIR must not be inside a publicly served directory.');
}
const storage = createStorage(DATA_DIR);
const AUTOMATION_FILE = path.join(DATA_DIR, 'automation.json');
let reminderScanRunning = false;

const DEFAULT_SETTINGS = {
    email: {
        host: 'derrickml.com',
        port: 465,
        secure: true,
        user: '',
        from: '',
        to: 'd.maiku@derrickml.com',
    },
    images: {
        backgroundImage: 'assets/img/bg.png',
        profileImage: 'assets/img/me-0.png',
    },
    analytics: {
        googleMeasurementId: 'G-MZHZHHQKGZ',
    },
};

const DEFAULT_SITE = {
    navigation: [
        { id: 'home', label: 'Home', href: '#header', enabled: true },
        { id: 'about', label: 'About', href: '#about', enabled: true },
        { id: 'resume', label: 'Resume', href: '#resume', enabled: true },
        { id: 'projects', label: 'Projects', href: '#projects', enabled: true },
        { id: 'contact', label: 'Contact', href: '#contact', enabled: true },
    ],
    sections: {
        about: { enabled: true, title: 'About', subtitle: 'Learn more about me' },
        skills: { enabled: true, title: 'Skills', subtitle: '' },
        interests: { enabled: true, title: 'Interests', subtitle: '' },
        testimonials: { enabled: true, title: 'Testimonials', subtitle: '' },
        resume: { enabled: true, title: 'Resume', subtitle: 'Check My Resume' },
        projects: { enabled: true, title: 'Projects', subtitle: 'My Work' },
        contact: { enabled: true, title: 'Contact', subtitle: 'Contact Me' },
    },
    contactBoxes: {
        addressTitle: 'My Address',
        socialTitle: 'Social Profiles',
        emailTitle: 'Email Me',
        phoneTitle: 'Call Me',
    },
    contactForm: {
        namePlaceholder: 'Your Name',
        emailPlaceholder: 'Your Email',
        subjectPlaceholder: 'Subject',
        messagePlaceholder: 'Message',
        submitLabel: 'Send Message',
        sendingLabel: 'Sending...',
        loadingLabel: 'Loading',
        sentMessage: 'Your message has been sent. Thank you!',
        successFallback: 'Message sent successfully!',
        errorFallback: 'Unable to send your message.',
        captchaTitle: 'Security Check',
        captchaIntro: 'Please answer the following question to submit the form:',
        captchaQuestion: 'What is 1 + 1?',
        captchaIncorrectMessage: 'Incorrect answer. Please try again.',
        captchaCloseLabel: 'Close',
        captchaSubmitLabel: 'Submit Answer',
    },
    projects: {
        allFilterLabel: 'All',
        viewDetailsLabel: 'View Details',
        technologiesTitle: 'Technologies',
        highlightsTitle: 'Key Highlights',
        liveDemoLabel: 'Live Demo',
        sourceCodeLabel: 'Source Code',
    },
    testimonials: {
        sourceUrl: 'https://script.google.com/macros/s/AKfycbyNpfflHQUWQ1TzMOEu5S28L23X-KogevFd1K201jzjD_pHUeTIqm0kjegRyACGq-FreA/exec',
        placeholderImage: 'assets/img/testimonials/placeholder.png',
    },
};

const DEFAULT_SECRETS = {
    emailPassword: '',
    adminPasswordHash: '',
    cronSecret: '',
};

const DEFAULT_SUBSCRIPTIONS_DATA = {
    settings: {
        enabled: true,
        recipientEmail: '',
        timezone: 'Africa/Kampala',
        defaultReminderTime: '09:00',
        digest: true,
    },
    subscriptions: [],
    reminderHistory: [],
};

const IMAGE_MIME_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
};

const UPLOAD_GROUPS = new Set(['background', 'profile', 'project', 'general']);

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeDefaults(defaults, value) {
    if (Array.isArray(defaults)) {
        return Array.isArray(value) ? value : defaults.slice();
    }
    if (!isPlainObject(defaults)) {
        return value === undefined ? defaults : value;
    }
    const merged = { ...defaults };
    if (!isPlainObject(value)) {
        return merged;
    }
    for (const [key, item] of Object.entries(value)) {
        merged[key] = key in defaults ? mergeDefaults(defaults[key], item) : item;
    }
    return merged;
}

function readJsonFile(filePath, fallback) {
    try {
        return mergeDefaults(fallback, JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`Error reading ${path.basename(filePath)}:`, err.message);
        }
        return mergeDefaults(fallback, {});
    }
}

function writeJsonAtomic(filePath, data) {
    writeAtomic(filePath, data);
}

function getSettings() {
    return readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
}

function saveSettings(settings) {
    writeJsonAtomic(SETTINGS_FILE, mergeDefaults(DEFAULT_SETTINGS, settings));
}

function getSite() {
    return readJsonFile(SITE_FILE, DEFAULT_SITE);
}

function saveSite(site) {
    writeJsonAtomic(SITE_FILE, mergeDefaults(DEFAULT_SITE, site));
}

function getSecrets() {
    return readJsonFile(SECRETS_FILE, DEFAULT_SECRETS);
}

function saveSecrets(secrets) {
    writeJsonAtomic(SECRETS_FILE, mergeDefaults(DEFAULT_SECRETS, secrets));
}

function cleanString(value, maxLength = 500) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().slice(0, maxLength);
}

function cleanBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    return fallback;
}

function cleanPort(value, fallback) {
    const port = Number.parseInt(value, 10);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function sanitizeSettings(input, currentSettings = getSettings()) {
    const email = input?.email || {};
    const images = input?.images || {};
    const analytics = input?.analytics || {};
    const currentEmail = currentSettings.email || DEFAULT_SETTINGS.email;
    const currentImages = currentSettings.images || DEFAULT_SETTINGS.images;
    const currentAnalytics = currentSettings.analytics || DEFAULT_SETTINGS.analytics;

    return mergeDefaults(DEFAULT_SETTINGS, {
        email: {
            host: cleanString(email.host, 255) || currentEmail.host,
            port: cleanPort(email.port, currentEmail.port),
            secure: cleanBoolean(email.secure, currentEmail.secure),
            user: cleanString(email.user, 320),
            from: cleanString(email.from, 320),
            to: cleanString(email.to, 320) || currentEmail.to,
        },
        images: {
            backgroundImage: cleanString(images.backgroundImage, 2048) || currentImages.backgroundImage,
            profileImage: cleanString(images.profileImage, 2048) || currentImages.profileImage,
        },
        analytics: {
            googleMeasurementId: cleanString(analytics.googleMeasurementId ?? currentAnalytics.googleMeasurementId, 64),
        },
    });
}

function sanitizeSite(input) {
    const source = mergeDefaults(DEFAULT_SITE, input || {});
    const sectionKeys = Object.keys(DEFAULT_SITE.sections);
    const sections = {};

    sectionKeys.forEach(key => {
        const section = source.sections?.[key] || {};
        sections[key] = {
            enabled: cleanBoolean(section.enabled, DEFAULT_SITE.sections[key].enabled),
            title: cleanString(section.title, 80) || DEFAULT_SITE.sections[key].title,
            subtitle: cleanString(section.subtitle, 160),
        };
    });

    const navigation = (Array.isArray(source.navigation) ? source.navigation : DEFAULT_SITE.navigation)
        .slice(0, 10)
        .map(item => ({
            id: cleanString(item.id, 40).toLowerCase(),
            label: cleanString(item.label, 40),
            href: cleanString(item.href, 80),
            enabled: cleanBoolean(item.enabled, true),
        }))
        .filter(item => item.id && item.label && item.href.startsWith('#'));

    return mergeDefaults(DEFAULT_SITE, {
        navigation: navigation.length ? navigation : DEFAULT_SITE.navigation,
        sections,
        contactBoxes: {
            addressTitle: cleanString(source.contactBoxes?.addressTitle, 80) || DEFAULT_SITE.contactBoxes.addressTitle,
            socialTitle: cleanString(source.contactBoxes?.socialTitle, 80) || DEFAULT_SITE.contactBoxes.socialTitle,
            emailTitle: cleanString(source.contactBoxes?.emailTitle, 80) || DEFAULT_SITE.contactBoxes.emailTitle,
            phoneTitle: cleanString(source.contactBoxes?.phoneTitle, 80) || DEFAULT_SITE.contactBoxes.phoneTitle,
        },
        contactForm: {
            namePlaceholder: cleanString(source.contactForm?.namePlaceholder, 80) || DEFAULT_SITE.contactForm.namePlaceholder,
            emailPlaceholder: cleanString(source.contactForm?.emailPlaceholder, 80) || DEFAULT_SITE.contactForm.emailPlaceholder,
            subjectPlaceholder: cleanString(source.contactForm?.subjectPlaceholder, 80) || DEFAULT_SITE.contactForm.subjectPlaceholder,
            messagePlaceholder: cleanString(source.contactForm?.messagePlaceholder, 80) || DEFAULT_SITE.contactForm.messagePlaceholder,
            submitLabel: cleanString(source.contactForm?.submitLabel, 80) || DEFAULT_SITE.contactForm.submitLabel,
            sendingLabel: cleanString(source.contactForm?.sendingLabel, 80) || DEFAULT_SITE.contactForm.sendingLabel,
            loadingLabel: cleanString(source.contactForm?.loadingLabel, 80) || DEFAULT_SITE.contactForm.loadingLabel,
            sentMessage: cleanString(source.contactForm?.sentMessage, 160) || DEFAULT_SITE.contactForm.sentMessage,
            successFallback: cleanString(source.contactForm?.successFallback, 160) || DEFAULT_SITE.contactForm.successFallback,
            errorFallback: cleanString(source.contactForm?.errorFallback, 160) || DEFAULT_SITE.contactForm.errorFallback,
            captchaTitle: cleanString(source.contactForm?.captchaTitle, 80) || DEFAULT_SITE.contactForm.captchaTitle,
            captchaIntro: cleanString(source.contactForm?.captchaIntro, 160) || DEFAULT_SITE.contactForm.captchaIntro,
            captchaQuestion: cleanString(source.contactForm?.captchaQuestion, 160) || DEFAULT_SITE.contactForm.captchaQuestion,
            captchaIncorrectMessage: cleanString(source.contactForm?.captchaIncorrectMessage, 160) || DEFAULT_SITE.contactForm.captchaIncorrectMessage,
            captchaCloseLabel: cleanString(source.contactForm?.captchaCloseLabel, 80) || DEFAULT_SITE.contactForm.captchaCloseLabel,
            captchaSubmitLabel: cleanString(source.contactForm?.captchaSubmitLabel, 80) || DEFAULT_SITE.contactForm.captchaSubmitLabel,
        },
        projects: {
            allFilterLabel: cleanString(source.projects?.allFilterLabel, 50) || DEFAULT_SITE.projects.allFilterLabel,
            viewDetailsLabel: cleanString(source.projects?.viewDetailsLabel, 80) || DEFAULT_SITE.projects.viewDetailsLabel,
            technologiesTitle: cleanString(source.projects?.technologiesTitle, 80) || DEFAULT_SITE.projects.technologiesTitle,
            highlightsTitle: cleanString(source.projects?.highlightsTitle, 80) || DEFAULT_SITE.projects.highlightsTitle,
            liveDemoLabel: cleanString(source.projects?.liveDemoLabel, 80) || DEFAULT_SITE.projects.liveDemoLabel,
            sourceCodeLabel: cleanString(source.projects?.sourceCodeLabel, 80) || DEFAULT_SITE.projects.sourceCodeLabel,
        },
        testimonials: {
            sourceUrl: cleanString(source.testimonials?.sourceUrl, 2048),
            placeholderImage: cleanString(source.testimonials?.placeholderImage, 2048) || DEFAULT_SITE.testimonials.placeholderImage,
        },
    });
}

function getAdminSettingsResponse() {
    const settings = getSettings();
    const secrets = getSecrets();
    const emailConfig = getEmailConfig(settings, secrets);
    return {
        ...settings,
        email: {
            ...settings.email,
            user: settings.email.user || process.env.EMAIL_USERNAME || '',
            from: settings.email.from || process.env.EMAIL_USERNAME || '',
            to: settings.email.to || process.env.EMAIL_TO || DEFAULT_SETTINGS.email.to,
            passwordSet: Boolean(emailConfig.pass),
        },
    };
}

function getEmailConfig(settings = getSettings(), secrets = getSecrets()) {
    const host = settings.email.host || process.env.EMAIL_HOST || DEFAULT_SETTINGS.email.host;
    const port = cleanPort(settings.email.port || process.env.EMAIL_PORT, DEFAULT_SETTINGS.email.port);
    const secure = typeof settings.email.secure === 'boolean' ? settings.email.secure : port === 465;
    const user = settings.email.user || process.env.EMAIL_USERNAME || '';
    const pass = secrets.emailPassword || process.env.EMAIL_PASSWORD || '';
    const from = settings.email.from || user;
    const to = settings.email.to || process.env.EMAIL_TO || DEFAULT_SETTINGS.email.to;
    return { host, port, secure, user, pass, from, to };
}

function emailConfigVersion(config) {
    return crypto.createHmac('sha256', process.env.SESSION_SECRET || 'dev-session-secret-change-me')
        .update(JSON.stringify(config)).digest('hex');
}

function getAdminPasswordHash() {
    const secrets = getSecrets();
    return secrets.adminPasswordHash || process.env.ADMIN_PASSWORD_HASH || '';
}

function getCronSecret() {
    const secrets = getSecrets();
    return process.env.CRON_SECRET || secrets.cronSecret || '';
}

function getSubscriptionsData() {
    return readJsonFile(SUBSCRIPTIONS_FILE, DEFAULT_SUBSCRIPTIONS_DATA);
}

function saveSubscriptionsData(data) {
    writeJsonAtomic(SUBSCRIPTIONS_FILE, mergeDefaults(DEFAULT_SUBSCRIPTIONS_DATA, data));
}

function cleanNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function cleanDateOnly(value) {
    const date = cleanString(value, 20);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function cleanTime(value, fallback = '09:00') {
    const time = cleanString(value, 5);
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
}

function sanitizeSubscriptionReminder(reminder) {
    const offsetDays = Math.max(0, Math.min(3650, Math.round(cleanNumber(reminder?.offsetDays, 0))));
    return {
        id: cleanString(reminder?.id, 80) || crypto.randomUUID(),
        offsetDays,
        time: cleanTime(reminder?.time, DEFAULT_SUBSCRIPTIONS_DATA.settings.defaultReminderTime),
        enabled: cleanBoolean(reminder?.enabled, true),
    };
}

function sanitizeSubscription(subscription) {
    const allowedStatuses = new Set(['active', 'paused', 'cancelled', 'archived']);
    const allowedCycles = new Set(['monthly', 'quarterly', 'semiannual', 'yearly', 'biennial', 'custom']);
    const reminders = Array.isArray(subscription?.reminders)
        ? subscription.reminders.slice(0, 20).map(sanitizeSubscriptionReminder)
        : [];
    const status = cleanString(subscription?.status, 20).toLowerCase();
    const billingCycle = cleanString(subscription?.billingCycle, 20).toLowerCase();

    return {
        id: cleanString(subscription?.id, 120) || crypto.randomUUID(),
        name: cleanString(subscription?.name, 160),
        category: cleanString(subscription?.category, 80),
        provider: cleanString(subscription?.provider, 120),
        client: cleanString(subscription?.client, 120),
        serviceUrl: safeUrl(subscription?.serviceUrl),
        renewalUrl: safeUrl(subscription?.renewalUrl),
        accountEmail: cleanString(subscription?.accountEmail, 320),
        renewalDate: cleanDateOnly(subscription?.renewalDate),
        billingCycle: allowedCycles.has(billingCycle) ? billingCycle : 'yearly',
        cost: Math.max(0, cleanNumber(subscription?.cost, 0)),
        currency: cleanString(subscription?.currency, 12).toUpperCase() || 'USD',
        autoRenew: cleanBoolean(subscription?.autoRenew, false),
        status: allowedStatuses.has(status) ? status : 'active',
        reminders,
        notes: cleanString(subscription?.notes, 5000),
        createdAt: cleanString(subscription?.createdAt, 40) || new Date().toISOString(),
        updatedAt: cleanString(subscription?.updatedAt, 40) || new Date().toISOString(),
    };
}

function sanitizeSubscriptionsData(input) {
    const source = mergeDefaults(DEFAULT_SUBSCRIPTIONS_DATA, input || {});
    const settings = source.settings || {};
    const subscriptions = Array.isArray(source.subscriptions)
        ? source.subscriptions.map(sanitizeSubscription).filter(item => item.name && item.renewalDate)
        : [];
    const reminderHistory = Array.isArray(source.reminderHistory)
        ? source.reminderHistory.slice(-20000).map(item => ({
            key: cleanString(item.key, 300),
            subscriptionId: cleanString(item.subscriptionId, 120),
            subscriptionName: cleanString(item.subscriptionName, 160),
            renewalDate: cleanDateOnly(item.renewalDate),
            offsetDays: Math.max(0, Math.min(3650, Math.round(cleanNumber(item.offsetDays, 0)))),
            sentAt: cleanString(item.sentAt, 40),
            recipientEmail: cleanString(item.recipientEmail, 320),
        })).filter(item => item.key)
        : [];

    return {
        settings: {
            enabled: cleanBoolean(settings.enabled, true),
            recipientEmail: cleanString(settings.recipientEmail, 320),
            timezone: cleanString(settings.timezone, 80) || DEFAULT_SUBSCRIPTIONS_DATA.settings.timezone,
            defaultReminderTime: cleanTime(settings.defaultReminderTime, DEFAULT_SUBSCRIPTIONS_DATA.settings.defaultReminderTime),
            digest: cleanBoolean(settings.digest, true),
        },
        subscriptions,
        reminderHistory,
    };
}

function getZonedParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const parts = {};
    formatter.formatToParts(date).forEach(part => {
        if (part.type !== 'literal') {
            parts[part.type] = part.value;
        }
    });
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${parts.hour}:${parts.minute}`,
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
    };
}

function parseDateAsUtc(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
}

function daysUntilDate(targetDate, currentDate) {
    if (!targetDate || !currentDate) {
        return null;
    }
    return Math.round((parseDateAsUtc(targetDate) - parseDateAsUtc(currentDate)) / 86400000);
}

function getSubscriptionComputedStatus(subscription, currentDate) {
    if (subscription.status === 'archived' || subscription.status === 'cancelled') {
        return subscription.status;
    }
    if (subscription.status === 'paused') {
        return 'paused';
    }
    const daysLeft = daysUntilDate(subscription.renewalDate, currentDate);
    if (daysLeft === null) {
        return 'unknown';
    }
    if (daysLeft < 0) {
        return 'expired';
    }
    if (daysLeft <= 7) {
        return 'due-week';
    }
    if (daysLeft <= 30) {
        return 'due-soon';
    }
    return 'active';
}

function decorateSubscriptionsData(data, now = new Date()) {
    const timezone = data.settings.timezone || DEFAULT_SUBSCRIPTIONS_DATA.settings.timezone;
    const zoned = getZonedParts(now, timezone);
    const decoratedSubscriptions = data.subscriptions.map(subscription => {
        const daysLeft = daysUntilDate(subscription.renewalDate, zoned.date);
        return {
            ...subscription,
            daysLeft,
            computedStatus: getSubscriptionComputedStatus(subscription, zoned.date),
        };
    });
    const summary = decoratedSubscriptions.reduce((acc, item) => {
        acc.total += 1;
        if (item.status === 'archived') acc.archived += 1;
        if (item.status === 'active') acc.active += 1;
        if (item.computedStatus === 'expired') acc.expired += 1;
        if (item.status === 'active' && typeof item.daysLeft === 'number' && item.daysLeft >= 0 && item.daysLeft <= 7) acc.due7 += 1;
        if (item.status === 'active' && typeof item.daysLeft === 'number' && item.daysLeft >= 0 && item.daysLeft <= 30) acc.due30 += 1;
        return acc;
    }, { total: 0, active: 0, due7: 0, due30: 0, expired: 0, archived: 0 });

    return {
        ...data,
        subscriptions: decoratedSubscriptions,
        summary,
        now: {
            iso: now.toISOString(),
            timezone,
            date: zoned.date,
            time: zoned.time,
        },
    };
}

function getDueSubscriptionReminders(data, now = new Date()) {
    const timezone = data.settings.timezone || DEFAULT_SUBSCRIPTIONS_DATA.settings.timezone;
    const defaultReminderTime = cleanTime(data.settings.defaultReminderTime, DEFAULT_SUBSCRIPTIONS_DATA.settings.defaultReminderTime);
    const zoned = getZonedParts(now, timezone);
    const sentKeys = new Set((data.reminderHistory || []).map(item => item.key));
    const due = [];

    if (!data.settings.enabled) {
        return { due, zoned: { ...zoned, timezone } };
    }

    data.subscriptions.forEach(subscription => {
        if (subscription.status !== 'active') {
            return;
        }
        const daysLeft = daysUntilDate(subscription.renewalDate, zoned.date);
        if (daysLeft === null || daysLeft < 0) {
            return;
        }
        const reminders = subscription.reminders?.length
            ? subscription.reminders
            : [{ id: 'default-30', offsetDays: 30, time: defaultReminderTime, enabled: true }];

        reminders.forEach(reminder => {
            if (!reminder.enabled || reminder.offsetDays !== daysLeft) {
                return;
            }
            const reminderTime = cleanTime(reminder.time, defaultReminderTime);
            if (zoned.time < reminderTime) {
                return;
            }
            const key = `${subscription.id}|${subscription.renewalDate}|${reminder.offsetDays}|${reminderTime}`;
            if (sentKeys.has(key)) {
                return;
            }
            sentKeys.add(key);
            due.push({
                key,
                subscriptionId: subscription.id,
                subscriptionName: subscription.name,
                provider: subscription.provider,
                client: subscription.client,
                category: subscription.category,
                renewalDate: subscription.renewalDate,
                daysLeft,
                offsetDays: reminder.offsetDays,
                reminderTime,
                cost: subscription.cost,
                currency: subscription.currency,
                autoRenew: subscription.autoRenew,
                renewalUrl: subscription.renewalUrl,
                serviceUrl: subscription.serviceUrl,
                notes: subscription.notes,
            });
        });
    });

    return { due, zoned: { ...zoned, timezone } };
}

async function sendConfiguredEmail({ to, subject, text, html }) {
    const emailConfig = getEmailConfig();
    if (!emailConfig.user || !emailConfig.pass) {
        throw new Error('Email service is not configured.');
    }

    const transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        connectionTimeout: 10000,
        socketTimeout: 20000,
        disableFileAccess: true,
        disableUrlAccess: true,
        auth: {
            user: emailConfig.user,
            pass: emailConfig.pass,
        },
    });

    return transporter.sendMail({
        from: emailConfig.from,
        to: to || emailConfig.to,
        subject,
        text,
        html,
    });
}

function formatReminderEmail(due, zoned) {
    const subject = due.length === 1
        ? `Subscription reminder: ${due[0].subscriptionName} renews in ${due[0].daysLeft} day${due[0].daysLeft === 1 ? '' : 's'}`
        : `Subscription reminders: ${due.length} services need attention`;
    const lines = [
        `Subscription reminders for ${zoned.date} ${zoned.time} (${zoned.timezone || ''})`,
        '',
        ...due.flatMap(item => [
            `${item.subscriptionName} (${item.provider || 'No provider'})`,
            `Renewal date: ${item.renewalDate} (${item.daysLeft} day${item.daysLeft === 1 ? '' : 's'} left)`,
            item.client ? `Client: ${item.client}` : '',
            item.category ? `Category: ${item.category}` : '',
            item.cost ? `Cost: ${item.currency} ${item.cost}` : '',
            item.autoRenew ? 'Auto-renew: Yes' : 'Auto-renew: No',
            item.renewalUrl ? `Renewal URL: ${item.renewalUrl}` : '',
            item.serviceUrl ? `Service URL: ${item.serviceUrl}` : '',
            '',
        ].filter(Boolean)),
    ];
    const htmlItems = due.map(item => `
        <li>
            <strong>${escapeHtml(item.subscriptionName)}</strong>
            ${item.provider ? ` via ${escapeHtml(item.provider)}` : ''}<br>
            Renews on <strong>${escapeHtml(item.renewalDate)}</strong>
            (${item.daysLeft} day${item.daysLeft === 1 ? '' : 's'} left).<br>
            ${item.client ? `Client: ${escapeHtml(item.client)}<br>` : ''}
            ${item.category ? `Category: ${escapeHtml(item.category)}<br>` : ''}
            ${item.cost ? `Cost: ${escapeHtml(item.currency)} ${escapeHtml(String(item.cost))}<br>` : ''}
            Auto-renew: ${item.autoRenew ? 'Yes' : 'No'}<br>
            ${item.renewalUrl ? `<a href="${escapeHtml(item.renewalUrl)}">Renewal link</a><br>` : ''}
            ${item.serviceUrl ? `<a href="${escapeHtml(item.serviceUrl)}">Service link</a>` : ''}
        </li>
    `).join('');
    return {
        subject,
        text: lines.join('\n'),
        html: `<p>Subscription reminders for ${escapeHtml(zoned.date)} ${escapeHtml(zoned.time)}.</p><ul>${htmlItems}</ul>`,
    };
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function runSubscriptionReminderScan({ dryRun = false } = {}) {
    if (reminderScanRunning) throw Object.assign(new Error('A reminder check is already running.'), { status: 409 });
    reminderScanRunning = true;
    try {
        const result = await scanSubscriptionReminders({ dryRun });
        if (!dryRun) {
            writeAtomic(AUTOMATION_FILE, { lastRun: new Date().toISOString(), status: 'success', count: result.count, sent: result.sent });
            storage.record('Reminders checked', `${result.count} due; ${result.sent ? 'email sent' : 'nothing sent'}`);
        }
        return result;
    } catch (error) {
        if (!dryRun) writeAtomic(AUTOMATION_FILE, { lastRun: new Date().toISOString(), status: 'failed', message: 'Reminder check failed. Check SMTP configuration and server logs.' });
        throw error;
    } finally {
        reminderScanRunning = false;
    }
}

async function scanSubscriptionReminders({ dryRun = false } = {}) {
    const data = sanitizeSubscriptionsData(getSubscriptionsData());
    const { due, zoned } = getDueSubscriptionReminders(data, new Date());
    const recipientEmail = data.settings.recipientEmail || getEmailConfig().to;

    if (!due.length || dryRun) {
        return {
            sent: false,
            due,
            count: due.length,
            recipientEmail,
            now: zoned,
            message: due.length ? 'Reminders are due but dry run was requested.' : 'No reminders due.',
        };
    }
    if (!recipientEmail) {
        throw new Error('No reminder recipient email is configured.');
    }

    const groups = data.settings.digest ? [due] : due.map(item => [item]);
    for (const group of groups) {
    const email = formatReminderEmail(group, zoned);
    await sendConfiguredEmail({
        to: recipientEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
    });

    const sentAt = new Date().toISOString();
    data.reminderHistory = [
        ...(data.reminderHistory || []),
        ...group.map(item => ({
            key: item.key,
            subscriptionId: item.subscriptionId,
            subscriptionName: item.subscriptionName,
            renewalDate: item.renewalDate,
            offsetDays: item.offsetDays,
            sentAt,
            recipientEmail,
        })),
    ].slice(-20000);
    saveSubscriptionsData(data);
    }

    return {
        sent: true,
        due,
        count: due.length,
        recipientEmail,
        now: zoned,
        message: `Sent ${due.length} subscription reminder${due.length === 1 ? '' : 's'}.`,
    };
}

function imageMagicMatches(buffer, mimeType) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
        return false;
    }
    if (mimeType === 'image/png') {
        return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimeType === 'image/jpeg') {
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/gif') {
        return buffer.subarray(0, 4).toString('ascii') === 'GIF8';
    }
    if (mimeType === 'image/webp') {
        return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
            && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
}

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET.startsWith('replace_'))) {
    throw new Error('SESSION_SECRET must be a random value of at least 32 characters in production.');
}

if (isProduction) {
    app.set('trust proxy', 1);
}

// Security: Set secure HTTP headers with CSP whitelist for trusted CDNs
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "https://cdn.jsdelivr.net",
                "https://www.googletagmanager.com",
                "https://www.google-analytics.com",
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://cdn.jsdelivr.net",
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdn.jsdelivr.net",
                "data:",
            ],
            imgSrc: ["'self'", "data:", "blob:", "https:", "https://www.google-analytics.com"],
            connectSrc: [
                "'self'",
                "https://script.google.com",
                "https://www.google-analytics.com",
                "https://region1.google-analytics.com",
                "https://www.google.com",
            ],
            upgradeInsecureRequests: isProduction ? [] : null,
        },
    },
}));

// Serve static files from the 'public' folder
app.use('/assets/uploads', express.static(UPLOADS_DIR, { dotfiles: 'deny', maxAge: '7d', immutable: true }));
app.use('/admin.html', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.static(PUBLIC_DIR));

app.use(express.json({ limit: '1mb' }));

// Session middleware for admin auth
fs.mkdirSync(path.join(DATA_DIR, 'sessions'), { recursive: true, mode: 0o700 });
const sessionStore = new FileStore({
    path: path.join(DATA_DIR, 'sessions'), ttl: 86400, retries: 0,
    reapInterval: process.env.NODE_ENV === 'test' ? -1 : 3600,
    logFn: () => {},
});
app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    name: 'portfolio.sid',
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
}));

app.use('/api/admin/check', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, skip: isAuthenticated, standardHeaders: true, legacyHeaders: false }));
app.use('/api/admin', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session.csrfToken && req.path === '/check') req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    const expectedOrigin = `${req.protocol}://${req.get('host')}`;
    if ((origin && origin !== expectedOrigin) || req.get('sec-fetch-site') === 'cross-site') {
        return res.status(403).json({ error: 'This request must come from your admin page.' });
    }
    const token = Buffer.from(req.get('x-csrf-token') || '');
    const expectedToken = Buffer.from(req.session.csrfToken || '');
    if (!expectedToken.length || token.length !== expectedToken.length || !crypto.timingSafeEqual(token, expectedToken)) {
        return res.status(403).json({ error: 'Session verification failed. Reload the admin page.', code: 'CSRF' });
    }
    next();
});

// Rate limiter for the email endpoint (5 requests per 15 minutes per IP)
const emailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many email requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Allowed portfolio data sections (whitelist to prevent path traversal)
const PORTFOLIO_SECTIONS = ['profile', 'skills', 'interests', 'resume', 'contact', 'projects'];

// Generic endpoint to serve portfolio data from JSON files
app.get('/api/portfolio/:section', (req, res) => {
    const section = req.params.section;
    if (!PORTFOLIO_SECTIONS.includes(section)) {
        return res.status(404).json({ error: 'Section not found' });
    }
    const filePath = path.join(DATA_DIR, `${section}.json`);
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        console.error(`Error reading ${section}.json:`, err.message);
        res.status(500).json({ error: 'Error loading data' });
    }
});

app.get('/api/settings/public', (req, res) => {
    const settings = getSettings();
    res.json({
        images: settings.images,
        analytics: settings.analytics,
    });
});

app.get('/api/site', (req, res) => {
    res.json(getSite());
});

/**
 * ROUTES
 */
//===== PORTFOLIO
// Add this route to serve the testimonials data
app.get('/api/testimonials', async (req, res) => {
    try {
        const site = getSite();
        if (!site.sections.testimonials?.enabled || !site.testimonials.sourceUrl) {
            return res.json([]);
        }

        const sourceUrl = new URL(site.testimonials.sourceUrl);
        if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
            return res.status(500).json({ error: 'Testimonials source is not a valid URL.' });
        }

        const response = await publicFetch(sourceUrl.href);
        if (!response.ok) {
            throw new Error(`Testimonials source returned ${response.status}`);
        }
        const data = response.data;
        if (!Array.isArray(data)) throw new Error('Testimonials source must return an array.');

        // Map the data to match your frontend structure
        // Normalize keys by trimming whitespace (Google Sheets headers have trailing spaces)
        const testimonials = data.filter(isPlainObject).slice(0, 100).map(item => {
            const trimmed = {};
            for (const key of Object.keys(item)) {
                trimmed[key.trim()] = item[key];
            }
            return {
                quote: trimmed['Testimonial Quote'] || '',
                name: trimmed['Full Name'] || '',
                title: trimmed['Position/Title'] || '',
                image: site.testimonials.placeholderImage || DEFAULT_SITE.testimonials.placeholderImage,
            };
        });

        res.json(testimonials);
    } catch (error) {
        console.error('Error fetching testimonials:', error);
        res.status(500).json({ error: 'Error fetching testimonials' });
    }
});


// Define the route for the email sending functionality
app.get('/api/contact/challenge', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), (req, res) => {
    const left = crypto.randomInt(1, 10);
    const right = crypto.randomInt(1, 10);
    req.session.contactChallenge = { answer: String(left + right), expires: Date.now() + 5 * 60 * 1000 };
    res.set('Cache-Control', 'no-store').json({ question: `What is ${left} + ${right}?` });
});

app.post('/send-email', emailLimiter, (req, res) => {
    const challenge = req.session.contactChallenge;
    delete req.session.contactChallenge;
    if (!challenge || challenge.expires < Date.now() || String(req.body?.answer || '').trim() !== challenge.answer) {
        return res.status(400).json({ error: 'The security answer is incorrect or expired. Please submit the form again.' });
    }
    // Input validation
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: 'All fields (name, email, subject, message) are required.' });
    }
    if (typeof name !== 'string' || typeof email !== 'string' || typeof subject !== 'string' || typeof message !== 'string') {
        return res.status(400).json({ error: 'All fields must be strings.' });
    }
    if (name.length > 200 || email.length > 254 || subject.length > 500 || message.length > 5000) {
        return res.status(400).json({ error: 'One or more fields exceed the maximum allowed length.' });
    }
    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email address format.' });
    }
    const emailConfig = getEmailConfig();
    if (!emailConfig.user || !emailConfig.pass) {
        return res.status(500).json({ error: 'Email service is not configured.' });
    }

    let transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        connectionTimeout: 10000,
        socketTimeout: 20000,
        disableFileAccess: true,
        disableUrlAccess: true,
        auth: {
            user: emailConfig.user,
            pass: emailConfig.pass
        }
    });

    let mailOptions = {
        from: emailConfig.from,
        to: emailConfig.to,
        replyTo: email,
        subject: subject.substring(0, 500),
        text: `Message from ${name.substring(0, 200)} (${email}): ${message.substring(0, 5000)}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Email send error:', error);
            res.status(500).json({ error: 'Error sending email' });
        } else {
            console.log('Message sent: %s', info.messageId);
            res.json({ message: 'Email sent successfully!' });
        }
    });
});
//==== END PORTFOLIO

/*======= ADMIN PANEL =======*/
// Auth middleware
function requireAuth(req, res, next) {
    if (isAuthenticated(req)) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

function authVersion() {
    return crypto.createHash('sha256').update(getAdminPasswordHash()).digest('hex');
}

function isAuthenticated(req) {
    return !!(req.session?.isAdmin && req.session.authVersion === authVersion());
}

function resourceVersion(section) {
    const metadata = storage.version(section);
    if (section === 'settings') {
        metadata.version = crypto.createHash('sha256').update(metadata.version).update(emailConfigVersion(getEmailConfig())).digest('hex');
    }
    return metadata;
}

function setVersion(res, section) {
    const metadata = resourceVersion(section);
    res.set('X-Data-Version', metadata.version);
    if (metadata.savedAt) res.set('X-Saved-At', metadata.savedAt);
    return metadata;
}

function requireVersion(req, res, section) {
    const metadata = setVersion(res, section);
    if (!req.get('if-match')) {
        res.status(428).json({ error: 'Reload this section before saving.', code: 'VERSION_REQUIRED' });
        return false;
    }
    if (req.get('if-match').replace(/^"|"$/g, '') !== metadata.version) {
        res.status(409).json({ error: 'This section changed in another session. Reload the latest version before saving your draft.', code: 'CONFLICT' });
        return false;
    }
    return true;
}

function adminError(res, error, fallback) {
    if (!error.status) console.error(fallback, error.message);
    return res.status(error.status || 500).json({ error: error.status ? error.message : fallback, fields: error.fields });
}

app.use('/api/admin', (req, res, next) => {
    if (req.method !== 'PUT') return next();
    const match = req.path.match(/^\/(?:portfolio\/)?(profile|skills|interests|resume|contact|projects|settings|site|subscriptions)$/);
    if (!match) return next();
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Please log in again.' });
    if (!requireVersion(req, res, match[1])) return;
    next();
});

function requireCronAuth(req, res, next) {
    const expected = getCronSecret();
    const authHeader = req.get('authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const provided = bearer || req.get('x-cron-secret') || '';

    if (!expected) {
        return res.status(503).json({ error: 'Cron secret is not configured.' });
    }
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (provided && providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized cron request.' });
}

app.post('/api/cron/subscription-reminders', requireCronAuth, async (req, res) => {
    try {
        const result = await runSubscriptionReminderScan({ dryRun: false });
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('Subscription reminder cron error:', err.message);
        adminError(res, err, 'Error running subscription reminders.');
    }
});

// Login
app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password || Buffer.byteLength(password) > 72) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (username !== process.env.ADMIN_USERNAME) {
        storage.record('Login failed');
        return res.status(401).json({ error: 'Invalid credentials.' });
    }
    try {
        const passwordHash = getAdminPasswordHash();
        if (!passwordHash) {
            return res.status(500).json({ error: 'Admin password is not configured.' });
        }

        const match = await bcrypt.compare(password, passwordHash);
        if (!match) {
            storage.record('Login failed');
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        req.session.isAdmin = true;
        req.session.authVersion = authVersion();
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
        storage.record('Signed in');
        res.json({ success: true, csrfToken: req.session.csrfToken, message: 'Logged in successfully.' });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// Logout
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy(error => {
        if (error) return adminError(res, error, 'Unable to log out.');
        res.clearCookie('portfolio.sid', { httpOnly: true, sameSite: 'lax', secure: isProduction });
        res.json({ success: true, message: 'Logged out.' });
    });
});

// Session check
app.get('/api/admin/check', (req, res) => {
    res.json({ authenticated: isAuthenticated(req), csrfToken: req.session.csrfToken });
});

app.get('/api/admin/subscriptions', requireAuth, (req, res) => {
    setVersion(res, 'subscriptions');
    const data = sanitizeSubscriptionsData(getSubscriptionsData());
    res.json(decorateSubscriptionsData(data));
});

app.put('/api/admin/subscriptions', requireAuth, (req, res) => {
    try {
        if (reminderScanRunning) throw Object.assign(new Error('A reminder check is running. Try saving again shortly.'), { status: 409 });
        const input = validateSubscriptions(req.body);
        const data = sanitizeSubscriptionsData({ ...input, reminderHistory: getSubscriptionsData().reminderHistory });
        storage.save('subscriptions', data);
        setVersion(res, 'subscriptions');
        storage.record('Saved subscriptions');
        res.json({
            success: true,
            message: 'Subscriptions updated successfully.',
            data: decorateSubscriptionsData(data),
        });
    } catch (err) {
        console.error('Error saving subscriptions:', err.message);
        adminError(res, err, 'Error saving subscriptions.');
    }
});

app.post('/api/admin/subscriptions/reminders/run', requireAuth, async (req, res) => {
    try {
        const result = await runSubscriptionReminderScan({ dryRun: cleanBoolean(req.body?.dryRun, false) });
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('Manual subscription reminder error:', err.message);
        adminError(res, err, 'Error running subscription reminder check.');
    }
});

app.post('/api/admin/subscriptions/test-email', requireAuth, async (req, res) => {
    try {
        const data = sanitizeSubscriptionsData(getSubscriptionsData());
        const recipientEmail = cleanString(req.body?.recipientEmail, 320) || data.settings.recipientEmail || getEmailConfig().to;
        if (!recipientEmail) {
            return res.status(400).json({ error: 'No reminder recipient email is configured.' });
        }

        await sendConfiguredEmail({
            to: recipientEmail,
            subject: 'Subscription reminder test',
            text: 'This is a test email from your portfolio subscription reminder system.',
            html: '<p>This is a test email from your portfolio subscription reminder system.</p>',
        });
        res.json({ success: true, message: `Test reminder email sent to ${recipientEmail}.` });
    } catch (err) {
        console.error('Subscription test email error:', err.message);
        res.status(500).json({ error: err.message || 'Error sending test reminder email.' });
    }
});

app.get('/api/admin/settings', requireAuth, (req, res) => {
    setVersion(res, 'settings');
    res.json(getAdminSettingsResponse());
});

app.put('/api/admin/settings', requireAuth, (req, res) => {
    try {
        const input = validate('settings', req.body);
        const currentSettings = getSettings();
        const nextSettings = sanitizeSettings(input, currentSettings);
        storage.save('settings', nextSettings);

        const password = input.email.password;
        if (password) {
            const secrets = getSecrets();
            secrets.emailPassword = password;
            saveSecrets(secrets);
        }
        setVersion(res, 'settings');
        storage.record('Saved settings');
        res.json({
            success: true,
            message: 'Settings updated successfully.',
            settings: getAdminSettingsResponse(),
        });
    } catch (err) {
        console.error('Error saving settings:', err.message);
        adminError(res, err, 'Error saving settings.');
    }
});

app.get('/api/admin/site', requireAuth, (req, res) => {
    setVersion(res, 'site');
    res.json(getSite());
});

app.put('/api/admin/site', requireAuth, (req, res) => {
    try {
        const site = sanitizeSite(validateSite(req.body));
        storage.save('site', site);
        setVersion(res, 'site');
        storage.record('Saved site configuration');
        res.json({
            success: true,
            message: 'Public site configuration updated successfully.',
            site,
        });
    } catch (err) {
        console.error('Error saving site configuration:', err.message);
        adminError(res, err, 'Error saving site configuration.');
    }
});

app.post('/api/admin/password', requireAuth, adminLoginLimiter, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({ error: 'Password fields must be strings.' });
    }
    if (newPassword.length < 12 || Buffer.byteLength(newPassword) > 72 || Buffer.byteLength(currentPassword) > 72) {
        return res.status(400).json({ error: 'New password must contain at least 12 characters and at most 72 bytes.' });
    }

    try {
        const passwordHash = getAdminPasswordHash();
        if (!passwordHash) {
            return res.status(500).json({ error: 'Admin password is not configured.' });
        }

        const match = await bcrypt.compare(currentPassword, passwordHash);
        if (!match) {
            return res.status(400).json({ error: 'Current password is incorrect.' });
        }

        const secrets = getSecrets();
        secrets.adminPasswordHash = await bcrypt.hash(newPassword, 12);
        saveSecrets(secrets);
        await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        req.session.isAdmin = true;
        req.session.authVersion = authVersion();
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
        storage.record('Password changed', 'Other sessions revoked');
        res.json({ success: true, csrfToken: req.session.csrfToken, message: 'Admin password updated successfully.' });
    } catch (err) {
        console.error('Password reset error:', err.message);
        res.status(500).json({ error: 'Error updating password.' });
    }
});

app.post('/api/admin/uploads/:type', requireAuth, express.raw({
    type: Object.keys(IMAGE_MIME_TYPES),
    limit: '8mb',
}), async (req, res) => {
    const group = req.params.type;
    const contentType = (req.get('content-type') || '').split(';')[0].toLowerCase();
    const extension = IMAGE_MIME_TYPES[contentType];

    if (!UPLOAD_GROUPS.has(group)) {
        return res.status(400).json({ error: 'Invalid upload type.' });
    }
    if (!extension) {
        return res.status(415).json({ error: 'Only JPG, PNG, WebP, and GIF images are supported.' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Image file is required.' });
    }
    if (!imageMagicMatches(req.body, contentType)) {
        return res.status(400).json({ error: 'Uploaded file does not match its image type.' });
    }

    try {
        const uploadDir = path.join(UPLOADS_DIR, group);
        fs.mkdirSync(uploadDir, { recursive: true });
        const pipeline = sharp(req.body, { limitInputPixels: 40000000, animated: true, failOn: 'warning' });
        const metadata = await pipeline.metadata();
        if ((metadata.pages || 1) * metadata.width * (metadata.pageHeight || metadata.height) > 40000000) throw new Error('Image is too large to process.');
        const { data: encoded, info } = await pipeline.rotate().resize({
            width: group === 'background' ? 2560 : 1600, height: group === 'background' ? 2560 : 1600,
            fit: 'inside', withoutEnlargement: true,
        }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
        const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.webp`;
        const fullPath = path.join(uploadDir, fileName);
        fs.writeFileSync(fullPath, encoded, { flag: 'wx' });

        const publicPath = `assets/uploads/${group}/${fileName}`;
        storage.record('Uploaded image', publicPath);
        res.json({ success: true, path: publicPath, width: info.width, height: info.height, bytes: encoded.length });
    } catch (err) {
        console.error('Image upload error:', err.message);
        res.status(400).json({ error: 'The image could not be processed. Use a valid image under 8 MB and 40 megapixels.' });
    }
});

// Update portfolio section (protected)
app.get('/api/admin/portfolio/:section', requireAuth, (req, res) => {
    try {
        const section = req.params.section;
        if (!PORTFOLIO_SECTIONS.includes(section)) return res.status(404).json({ error: 'Section not found.' });
        setVersion(res, section);
        res.json(JSON.parse(fs.readFileSync(storage.fileFor(section), 'utf8')));
    } catch (error) { adminError(res, error, 'Error loading this section.'); }
});

app.put('/api/admin/portfolio/:section', requireAuth, (req, res) => {
    const section = req.params.section;
    if (!PORTFOLIO_SECTIONS.includes(section)) {
        return res.status(404).json({ error: 'Section not found.' });
    }
    try {
        const data = validate(section, req.body);
        storage.save(section, data);
        setVersion(res, section);
        storage.record('Saved content', section);
        res.json({ success: true, data, message: `${section} updated successfully.` });
    } catch (err) {
        console.error(`Error writing ${section}.json:`, err.message);
        adminError(res, err, 'Error saving data.');
    }
});
/*======= END ADMIN PANEL =======*/

function imageReferences() {
    const references = new Map();
    function visit(value, owner) {
        if (typeof value === 'string') {
            let imagePath = value.replace(/^\//, '');
            try {
                if (/^https?:/.test(value)) {
                    new URL(value);
                    references.set(value, [...new Set([...(references.get(value) || []), owner])]);
                    return;
                }
            } catch { return; }
            if (imagePath.startsWith('assets/')) references.set(imagePath, [...new Set([...(references.get(imagePath) || []), owner])]);
        } else if (Array.isArray(value)) value.forEach(item => visit(item, owner));
        else if (isPlainObject(value)) Object.values(value).forEach(item => visit(item, owner));
    }
    for (const section of CONTENT_SECTIONS) {
        const file = storage.fileFor(section);
        if (fs.existsSync(file)) visit(JSON.parse(fs.readFileSync(file, 'utf8')), section);
    }
    for (const revision of storage.revisions()) visit(storage.readRevision(revision.id).data, 'revision history');
    return references;
}

function mediaFiles() {
    const references = imageReferences();
    const files = [];
    for (const group of UPLOAD_GROUPS) {
        const dir = path.join(UPLOADS_DIR, group);
        if (!fs.existsSync(dir) || fs.lstatSync(dir).isSymbolicLink()) continue;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isFile() || !/^[\w.-]+\.(jpg|jpeg|png|webp|gif)$/i.test(entry.name)) continue;
            const publicPath = `assets/uploads/${group}/${entry.name}`;
            const stat = fs.statSync(path.join(dir, entry.name));
            const usedBy = new Set(references.get(publicPath) || []);
            for (const [url, owners] of references) {
                if (/^https?:/.test(url) && new URL(url).pathname === `/${publicPath}`) owners.forEach(owner => usedBy.add(owner));
            }
            files.push({ name: entry.name, group, path: publicPath, bytes: stat.size, createdAt: stat.mtime.toISOString(), usedBy: [...usedBy] });
        }
    }
    return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

app.get('/api/admin/media', requireAuth, (req, res) => res.json({ files: mediaFiles() }));

app.delete('/api/admin/media/:group/:name', requireAuth, (req, res) => {
    const imagePath = `assets/uploads/${req.params.group}/${req.params.name}`;
    const item = mediaFiles().find(file => file.path === imagePath);
    if (!item) return res.status(404).json({ error: 'Image not found.' });
    if (item.usedBy.length) return res.status(409).json({ error: 'This image is used by saved content or recovery history.' });
    fs.unlinkSync(path.join(UPLOADS_DIR, item.group, item.name));
    storage.record('Deleted unused image', item.path);
    res.json({ success: true });
});

app.get('/api/admin/revisions', requireAuth, (req, res) => res.json({ revisions: storage.revisions() }));
app.get('/api/admin/revisions/:id', requireAuth, (req, res) => {
    try { res.json(storage.readRevision(req.params.id)); } catch (error) { adminError(res, error, 'Unable to load revision.'); }
});
app.post('/api/admin/revisions/:id/restore', requireAuth, (req, res) => {
    try {
        const revision = storage.readRevision(req.params.id);
        if (!requireVersion(req, res, revision.section)) return;
        if (revision.section === 'subscriptions' && reminderScanRunning) return res.status(409).json({ error: 'A reminder check is running. Try again shortly.' });
        let data;
        if (revision.section === 'site') data = sanitizeSite(validateSite(revision.data));
        else if (revision.section === 'subscriptions') data = sanitizeSubscriptionsData({ ...validateSubscriptions(revision.data), reminderHistory: getSubscriptionsData().reminderHistory });
        else data = validate(revision.section, revision.data);
        storage.save(revision.section, data, 'Before restore');
        storage.record('Restored revision', revision.section);
        setVersion(res, revision.section);
        res.json({ success: true, section: revision.section });
    } catch (error) { adminError(res, error, 'Unable to restore revision.'); }
});

app.post('/api/admin/backups', requireAuth, (req, res) => {
    const ids = CONTENT_SECTIONS.map(section => storage.snapshot(section, 'Manual snapshot')).filter(Boolean);
    storage.record('Created recovery snapshot', `${ids.length} sections`);
    res.json({ success: true, count: ids.length });
});

app.get('/api/admin/backup/export', requireAuth, (req, res) => {
    const data = {};
    for (const section of CONTENT_SECTIONS) {
        if (fs.existsSync(storage.fileFor(section))) data[`${section}.json`] = JSON.parse(fs.readFileSync(storage.fileFor(section), 'utf8'));
    }
    const files = mediaFiles();
    if (files.reduce((total, item) => total + item.bytes, 0) > 100 * 1024 * 1024) return res.status(413).json({ error: 'Media exceeds 100 MB. Back up the data and uploads directories on your server.' });
    const uploads = files.map(item => ({ path: item.path, base64: fs.readFileSync(path.join(UPLOADS_DIR, item.group, item.name)).toString('base64') }));
    res.attachment(`portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`).json({ format: 'portfolio-backup', version: 1, createdAt: new Date().toISOString(), data, uploads });
});

app.post('/api/admin/settings/verify-email', requireAuth, async (req, res) => {
    const config = getEmailConfig();
    const version = resourceVersion('settings').version;
    if (!config.user || !config.pass) return res.status(400).json({ error: 'Save your SMTP credentials first.' });
    const transporter = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: { user: config.user, pass: config.pass }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000 });
    try {
        await transporter.verify();
        writeAtomic(path.join(DATA_DIR, 'smtp-check.json'), { checkedAt: new Date().toISOString(), version, success: true });
        storage.record('Verified SMTP connection');
        res.json({ success: true, message: 'SMTP connection and authentication verified.' });
    } catch (error) {
        writeAtomic(path.join(DATA_DIR, 'smtp-check.json'), { checkedAt: new Date().toISOString(), success: false });
        adminError(res, error, 'SMTP verification failed. Check your saved host, port, username, and password.');
    } finally { transporter.close(); }
});

app.get('/api/admin/dashboard', requireAuth, (req, res) => {
    const issues = [];
    const counts = {};
    const sections = {};
    for (const section of CONTENT_SECTIONS) {
        sections[section] = resourceVersion(section);
        try {
            const value = JSON.parse(fs.readFileSync(storage.fileFor(section), 'utf8'));
            if (Array.isArray(value)) counts[section] = value.length;
            if (section === 'resume') counts.resume = ['experience', 'education', 'certifications', 'honors', 'research'].reduce((count, key) => count + (value[key]?.length || 0), 0);
            if (section === 'projects') value.filter(project => !project.image).forEach(project => issues.push({ section, message: `${project.title}: missing project image` }));
            if (section === 'profile' && !value.meta?.description) issues.push({ section, message: 'Add a search description for your portfolio.' });
        } catch { issues.push({ section, message: `${section}: content file is missing or invalid.` }); }
    }
    const email = getEmailConfig();
    const emailReady = !!(email.host && email.user && email.pass && email.to);
    const smtpCheck = readJsonFile(path.join(DATA_DIR, 'smtp-check.json'), {});
    const subscriptions = decorateSubscriptionsData(sanitizeSubscriptionsData(getSubscriptionsData()));
    if (!emailReady) issues.push({ section: 'settings', message: 'SMTP configuration is incomplete.' });
    if (subscriptions.summary.expired) issues.push({ section: 'subscriptions', message: `${subscriptions.summary.expired} subscription(s) past renewal.` });
    const images = imageReferences();
    for (const [imagePath, owners] of images) {
        if (!imagePath.startsWith('assets/')) continue;
        if (owners.every(owner => owner === 'revision history')) continue;
        const file = imagePath.startsWith('assets/uploads/') ? path.join(UPLOADS_DIR, imagePath.slice('assets/uploads/'.length)) : path.join(PUBLIC_DIR, imagePath);
        if (!fs.existsSync(file)) issues.push({ section: owners[0], message: `Missing image: ${imagePath}` });
    }
    const links = readJsonFile(path.join(DATA_DIR, 'link-check.json'), { results: [] });
    for (const result of links.results.filter(item => (item.status === 404 || item.status === 410) && links.versions?.[item.section] === sections[item.section]?.version)) {
        issues.push({ section: result.section, message: `${result.label}: link returned ${result.status}` });
    }
    res.json({ counts, sections, issues, subscriptions: subscriptions.summary,
        upcoming: subscriptions.subscriptions.filter(item => item.status === 'active').sort((a, b) => a.renewalDate.localeCompare(b.renewalDate)).slice(0, 6),
        email: { configured: emailReady, verified: Boolean(smtpCheck.success && smtpCheck.version === sections.settings.version), checkedAt: smtpCheck.checkedAt || null },
        automation: { ...readJsonFile(AUTOMATION_FILE, {}), configured: !!getCronSecret() },
        latestRevision: storage.revisions()[0] || null, activity: storage.activity().slice(0, 30), links,
    });
});

app.post('/api/admin/links/check', requireAuth, rateLimit({ windowMs: 60000, limit: 2, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    const links = new Map();
    const versions = {};
    function add(url, section, label) {
        const safe = safeUrl(url);
        if (safe && links.size < 24) links.set(safe, { url: safe, section, label });
    }
    for (const section of ['profile', 'contact', 'projects', 'resume']) {
        versions[section] = resourceVersion(section).version;
        const data = JSON.parse(fs.readFileSync(storage.fileFor(section), 'utf8'));
        for (const item of data.socialLinks || []) add(item.url, section, item.platform);
        if (section === 'projects') for (const item of data) { add(item.liveUrl, section, `${item.title} website`); add(item.repoUrl, section, `${item.title} source`); }
        for (const item of data.research || []) add(item.publicationUrl, section, item.publicationTitle || item.title);
    }
    const pending = [...links.values()];
    const results = [];
    for (let offset = 0; offset < pending.length; offset += 8) {
        results.push(...await Promise.all(pending.slice(offset, offset + 8).map(async item => {
            try { const response = await publicFetch(item.url, { method: 'HEAD' }); return { ...item, status: response.status }; }
            catch { return { ...item, status: null }; }
        })));
    }
    const report = { checkedAt: new Date().toISOString(), results, versions };
    writeAtomic(path.join(DATA_DIR, 'link-check.json'), report);
    storage.record('Checked public links', `${results.length} links checked`);
    res.json(report);
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large. Images must be under 8 MB.' });
    if (error instanceof SyntaxError && error.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request contains invalid JSON.' });
    adminError(res, error, 'The request could not be completed.');
});

// Passenger imports the startup file instead of running it as Node's main module.
if (require.main === module || globalThis.PhusionPassenger) app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = { app, sessionStore, getDueSubscriptionReminders, runSubscriptionReminderScan };

