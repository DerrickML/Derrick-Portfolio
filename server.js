const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const session = require('express-session');
require('dotenv').config();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3003;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SITE_FILE = path.join(DATA_DIR, 'site.json');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'assets', 'uploads');

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
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
        fs.renameSync(tmpPath, filePath);
    } catch (err) {
        if (fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
        }
        throw err;
    }
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

function getAdminPasswordHash() {
    const secrets = getSecrets();
    return secrets.adminPasswordHash || process.env.ADMIN_PASSWORD_HASH || '';
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

if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set in production.');
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
                "'unsafe-inline'",
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
        },
    },
}));

// Serve static files from the 'public' folder
app.use(express.static(PUBLIC_DIR));

app.use(express.json({ limit: '100kb' }));

// Session middleware for admin auth
app.use(session({
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

        const response = await fetch(sourceUrl.href);
        if (!response.ok) {
            throw new Error(`Testimonials source returned ${response.status}`);
        }
        const data = await response.json();

        // Map the data to match your frontend structure
        // Normalize keys by trimming whitespace (Google Sheets headers have trailing spaces)
        const testimonials = data.map(item => {
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
app.post('/send-email', emailLimiter, (req, res) => {
    // Input validation
    const { name, email, subject, message } = req.body;
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
    if (req.session && req.session.isAdmin) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

// Login
app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (username !== process.env.ADMIN_USERNAME) {
        return res.status(401).json({ error: 'Invalid credentials.' });
    }
    try {
        const passwordHash = getAdminPasswordHash();
        if (!passwordHash) {
            return res.status(500).json({ error: 'Admin password is not configured.' });
        }

        const match = await bcrypt.compare(password, passwordHash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        req.session.isAdmin = true;
        res.json({ success: true, message: 'Logged in successfully.' });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// Logout
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: 'Logged out.' });
    });
});

// Session check
app.get('/api/admin/check', (req, res) => {
    res.json({ authenticated: !!(req.session && req.session.isAdmin) });
});

app.get('/api/admin/settings', requireAuth, (req, res) => {
    res.json(getAdminSettingsResponse());
});

app.put('/api/admin/settings', requireAuth, (req, res) => {
    try {
        const currentSettings = getSettings();
        const nextSettings = sanitizeSettings(req.body || {}, currentSettings);
        saveSettings(nextSettings);

        const password = cleanString(req.body?.email?.password, 1000);
        if (password) {
            const secrets = getSecrets();
            secrets.emailPassword = password;
            saveSecrets(secrets);
        }

        res.json({
            success: true,
            message: 'Settings updated successfully.',
            settings: getAdminSettingsResponse(),
        });
    } catch (err) {
        console.error('Error saving settings:', err.message);
        res.status(500).json({ error: 'Error saving settings.' });
    }
});

app.get('/api/admin/site', requireAuth, (req, res) => {
    res.json(getSite());
});

app.put('/api/admin/site', requireAuth, (req, res) => {
    try {
        const site = sanitizeSite(req.body || {});
        saveSite(site);
        res.json({
            success: true,
            message: 'Public site configuration updated successfully.',
            site,
        });
    } catch (err) {
        console.error('Error saving site configuration:', err.message);
        res.status(500).json({ error: 'Error saving site configuration.' });
    }
});

app.post('/api/admin/password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({ error: 'Password fields must be strings.' });
    }
    if (newPassword.length < 12) {
        return res.status(400).json({ error: 'New password must be at least 12 characters.' });
    }

    try {
        const passwordHash = getAdminPasswordHash();
        if (!passwordHash) {
            return res.status(500).json({ error: 'Admin password is not configured.' });
        }

        const match = await bcrypt.compare(currentPassword, passwordHash);
        if (!match) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        const secrets = getSecrets();
        secrets.adminPasswordHash = await bcrypt.hash(newPassword, 12);
        saveSecrets(secrets);
        res.json({ success: true, message: 'Admin password updated successfully.' });
    } catch (err) {
        console.error('Password reset error:', err.message);
        res.status(500).json({ error: 'Error updating password.' });
    }
});

app.post('/api/admin/uploads/:type', requireAuth, express.raw({
    type: Object.keys(IMAGE_MIME_TYPES),
    limit: '8mb',
}), (req, res) => {
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
        const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
        const fullPath = path.join(uploadDir, fileName);
        fs.writeFileSync(fullPath, req.body);

        const publicPath = `assets/uploads/${group}/${fileName}`;
        res.json({ success: true, path: publicPath });
    } catch (err) {
        console.error('Image upload error:', err.message);
        res.status(500).json({ error: 'Error saving uploaded image.' });
    }
});

// Update portfolio section (protected)
app.put('/api/admin/portfolio/:section', requireAuth, (req, res) => {
    const section = req.params.section;
    if (!PORTFOLIO_SECTIONS.includes(section)) {
        return res.status(404).json({ error: 'Section not found.' });
    }
    const filePath = path.join(DATA_DIR, `${section}.json`);
    try {
        writeJsonAtomic(filePath, req.body);
        res.json({ success: true, message: `${section} updated successfully.` });
    } catch (err) {
        console.error(`Error writing ${section}.json:`, err.message);
        res.status(500).json({ error: 'Error saving data.' });
    }
});
/*======= END ADMIN PANEL =======*/

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

