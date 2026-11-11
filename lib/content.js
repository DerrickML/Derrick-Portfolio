const { z } = require('zod');
const sanitizeHtml = require('sanitize-html');

function safeUrl(value, asset = false) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const input = value.trim();
    if (/[\u0000-\u0020\\]/.test(input)) return '';
    if (asset && /^\/?assets\/[a-zA-Z0-9_./-]+$/.test(input)) {
        return input.split('/').includes('..') ? '' : input.replace(/^\//, '');
    }
    try {
        const url = new URL(input);
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch {
        return '';
    }
}

const text = (max = 500) => z.string().trim().max(max);
const optionalText = (max = 500) => text(max).default('');
const requiredText = (max = 200) => text(max).min(1, 'This field is required.');
const richText = (max = 10000) => optionalText(max).transform(value => sanitizeHtml(value, {
    allowedTags: ['a', 'br', 'em', 'span', 'strong', 'sup'],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
}));
const urlField = (asset = false) => optionalText(2048).refine(value => !value || !!safeUrl(value, asset), {
    message: asset ? 'Use an image URL or a path under assets/.' : 'Use a complete http:// or https:// URL.',
});
const email = optionalText(320).refine(value => !value || /^[^\s@<>\r\n,;]+@[^\s@<>\r\n,;]+\.[^\s@<>\r\n,;]+$/.test(value), 'Enter a valid email address.');
const icon = optionalText(100).refine(value => !value || /^(?:bi bi-[a-z0-9-]+|ri-[a-z0-9-]+|bx(?: bxl?-[a-z0-9-]+))$/.test(value), 'Select a supported icon.');
const items = schema => z.array(schema).max(200).default([]);
const socialLinks = items(z.object({ platform: requiredText(80), url: urlField(), icon }));
const bullets = z.array(requiredText(2000)).max(100).default([]);
const resumeEntry = z.object({
    title: requiredText(), period: optionalText(100), institution: optionalText(300), description: richText(),
});
const month = optionalText(10).refine(value => !value || /^\d{4}-(0[1-9]|1[0-2])$/.test(value), 'Use YYYY-MM.');
const project = z.object({
    id: requiredText(120), title: requiredText(), category: optionalText(100),
    status: z.enum(['Completed', 'Ongoing']).default('Ongoing'),
    startDate: month, endDate: month, description: optionalText(2000), fullDescription: optionalText(20000),
    technologies: z.array(requiredText(100)).max(80).default([]), image: urlField(true),
    liveUrl: urlField(), repoUrl: urlField(), highlights: bullets, client: optionalText(300),
}).refine(value => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    path: ['endDate'], message: 'End date must be on or after the start date.',
});

const schemas = {
    profile: z.object({
        name: requiredText(), fullName: optionalText(200), tagline: richText(2000), profileImage: urlField(true),
        aboutTitle: optionalText(300), aboutText: richText(),
        details: items(z.object({ label: requiredText(80), value: richText(2000) })), socialLinks,
        meta: z.object({ title: optionalText(200), description: optionalText(1000), keywords: optionalText(1000) }),
    }),
    skills: z.array(z.object({ name: requiredText(120), percentage: z.number().int().min(0).max(100) })).max(200),
    interests: z.array(z.object({
        name: requiredText(120), icon,
        color: text(7).regex(/^#[a-fA-F0-9]{6}$/, 'Use a six-digit hex color.'),
    })).max(200),
    resume: z.object({
        summary: z.object({ name: optionalText(200), text: richText() }),
        experience: items(z.object({ title: requiredText(), organization: optionalText(300), period: optionalText(100), bullets })),
        education: items(resumeEntry), certifications: items(resumeEntry), honors: items(resumeEntry),
        research: items(z.object({
            title: requiredText(500), institution: optionalText(300), period: optionalText(100), bullets,
            publicationUrl: urlField(), publicationTitle: optionalText(500),
        })),
        areasOfInterest: z.object({ title: optionalText(300), description: richText() }),
    }),
    contact: z.object({
        address: optionalText(1000), emails: items(z.object({ address: email })),
        phones: items(z.object({ number: requiredText(80), tel: text(80).regex(/^\+?[\d ()-]+$/, 'Enter a telephone number.') })),
        socialLinks,
    }),
    projects: z.array(project).max(200).refine(values => new Set(values.map(item => item.id)).size === values.length, 'Project IDs must be unique.'),
    settings: z.object({
        email: z.object({
            host: text(255).refine(value => !value || /^[a-zA-Z0-9.-]+$/.test(value), 'Enter an SMTP hostname.'),
            port: z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number).pipe(z.number().int().min(1).max(65535)),
            secure: z.boolean(), user: optionalText(320), password: z.string().max(1000).optional(), from: email, to: email,
        }),
        images: z.object({ backgroundImage: urlField(true), profileImage: urlField(true) }),
        analytics: z.object({ googleMeasurementId: optionalText(64).refine(value => !value || /^G-[A-Z0-9]+$/i.test(value), 'Use a Google measurement ID beginning G-.') }),
    }),
};

function validate(section, input) {
    const result = schemas[section].safeParse(input);
    if (result.success) return result.data;
    const error = new Error('Please correct the highlighted fields.');
    error.status = 400;
    error.fields = result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }));
    throw error;
}

function validateSite(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Site configuration must be an object.'), { status: 400 });
    for (const [key, asset] of [['sourceUrl', false], ['placeholderImage', true]]) {
        const value = input.testimonials?.[key];
        if (value && !safeUrl(value, asset)) throw Object.assign(new Error(`Testimonials ${key} is not a valid URL.`), { status: 400 });
    }
    const nav = input.navigation;
    const targets = { home: '#header', about: '#about', resume: '#resume', projects: '#projects', contact: '#contact' };
    if (nav && (!Array.isArray(nav) || nav.some(item => !item || targets[item.id] !== item.href) || new Set(nav.map(item => item.id)).size !== nav.length)) {
        throw Object.assign(new Error('Navigation must use unique, existing section targets.'), { status: 400 });
    }
    return input;
}

function validateSubscriptions(input) {
    const date = requiredText(10).refine(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Enter a real calendar date.');
    const time = text(5).regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.');
    const schema = z.object({
        settings: z.object({
            enabled: z.boolean(), recipientEmail: email, digest: z.boolean(), defaultReminderTime: time,
            timezone: requiredText(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Select a valid timezone.'),
        }),
        subscriptions: z.array(z.object({
            id: requiredText(120), name: requiredText(160), renewalDate: date,
            serviceUrl: urlField(), renewalUrl: urlField(), accountEmail: email,
            category: optionalText(80), provider: optionalText(120), client: optionalText(120), notes: optionalText(5000),
            status: z.enum(['active', 'paused', 'cancelled', 'archived']),
            billingCycle: z.enum(['monthly', 'quarterly', 'semiannual', 'yearly', 'biennial', 'custom']),
            cost: z.number().min(0).max(1e12), currency: text(12).min(1), autoRenew: z.boolean(),
            createdAt: optionalText(40), updatedAt: optionalText(40),
            reminders: z.array(z.object({ id: optionalText(80), offsetDays: z.number().int().min(0).max(3650), time, enabled: z.boolean() })).max(20),
        })).max(500).refine(values => new Set(values.map(item => item.id)).size === values.length, 'Subscription IDs must be unique.'),
    });
    const result = schema.safeParse(input);
    if (!result.success) throw Object.assign(new Error('Please correct the subscription fields.'), {
        status: 400, fields: result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return result.data;
}

module.exports = { validate, validateSite, validateSubscriptions, safeUrl, schemas };
