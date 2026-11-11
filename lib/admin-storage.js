const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONTENT_SECTIONS = ['profile', 'skills', 'interests', 'resume', 'contact', 'projects', 'settings', 'site', 'subscriptions'];

function writeAtomic(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
        fs.renameSync(temporary, file);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
}

function createStorage(dataDir) {
    const revisionsDir = path.join(dataDir, 'revisions');
    const activityFile = path.join(dataDir, 'activity.json');
    function fileFor(section) {
        if (!CONTENT_SECTIONS.includes(section)) throw Object.assign(new Error('Section not found.'), { status: 404 });
        return path.join(dataDir, `${section}.json`);
    }
    function version(section) {
        const file = fileFor(section);
        if (!fs.existsSync(file)) return { version: 'missing', savedAt: null };
        return { version: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), savedAt: fs.statSync(file).mtime.toISOString() };
    }
    function readRevision(id) {
        if (!/^[0-9a-f-]{36}$/.test(id)) throw Object.assign(new Error('Revision not found.'), { status: 404 });
        const file = path.join(revisionsDir, `${id}.json`);
        if (!fs.existsSync(file)) throw Object.assign(new Error('Revision not found.'), { status: 404 });
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    function revisions() {
        if (!fs.existsSync(revisionsDir)) return [];
        return fs.readdirSync(revisionsDir).filter(name => name.endsWith('.json')).map(name => {
            const { data, ...metadata } = readRevision(name.slice(0, -5));
            return metadata;
        }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    function snapshot(section, reason = 'Before save') {
        const file = fileFor(section);
        if (!fs.existsSync(file)) return null;
        const revision = { id: crypto.randomUUID(), section, reason, createdAt: new Date().toISOString(), data: JSON.parse(fs.readFileSync(file, 'utf8')) };
        writeAtomic(path.join(revisionsDir, `${revision.id}.json`), revision);
        const previous = revisions().filter(item => item.section === section);
        for (const item of previous.slice(30)) fs.unlinkSync(path.join(revisionsDir, `${item.id}.json`));
        return revision.id;
    }
    function save(section, data, reason) {
        snapshot(section, reason);
        writeAtomic(fileFor(section), data);
        return version(section);
    }
    function activity() {
        return fs.existsSync(activityFile) ? JSON.parse(fs.readFileSync(activityFile, 'utf8')) : [];
    }
    function record(action, detail = '') {
        // Activity is operational metadata only. Never pass credentials or request bodies.
        writeAtomic(activityFile, [{ id: crypto.randomUUID(), at: new Date().toISOString(), action, detail }, ...activity()].slice(0, 200));
    }
    return { fileFor, version, readRevision, revisions, snapshot, save, activity, record };
}

async function restoreBackup(file, destination) {
    const { validate, validateSite, validateSubscriptions } = require('./content');
    const sharp = require('sharp');
    const target = path.resolve(destination);
    if (fs.existsSync(target)) throw new Error('The restore destination must not already exist.');
    if (fs.statSync(file).size > 150 * 1024 * 1024) throw new Error('Backup exceeds the 150 MB restore limit.');
    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (backup.format !== 'portfolio-backup' || backup.version !== 1 || !backup.data || !Array.isArray(backup.uploads)) throw new Error('Unsupported backup format.');
    const content = {};
    for (const section of CONTENT_SECTIONS) {
        const value = backup.data[`${section}.json`];
        if (value === undefined) throw new Error(`Backup is missing ${section}.json.`);
        if (section === 'site') content[section] = validateSite(value);
        else if (section === 'subscriptions') {
            const history = value.reminderHistory || [];
            if (!Array.isArray(history) || history.length > 20000 || history.some(item => !item || typeof item.key !== 'string' || typeof item.sentAt !== 'string')) throw new Error('Invalid reminder history.');
            content[section] = { ...validateSubscriptions(value), reminderHistory: history };
        } else content[section] = validate(section, value);
    }
    delete content.settings.email.password;
    const seen = new Set();
    let bytes = 0;
    const uploads = [];
    for (const item of backup.uploads) {
        if (!/^assets\/uploads\/(background|profile|project|general)\/[\w-]+\.(jpg|jpeg|png|webp|gif)$/i.test(item.path || '') || typeof item.base64 !== 'string' || seen.has(item.path)) throw new Error('Invalid or duplicate upload path.');
        seen.add(item.path);
        const buffer = Buffer.from(item.base64, 'base64');
        bytes += buffer.length;
        if (buffer.length > 8 * 1024 * 1024 || bytes > 100 * 1024 * 1024) throw new Error('Backup exceeds media size limits.');
        const metadata = await sharp(buffer, { limitInputPixels: 40000000 }).metadata();
        if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format)) throw new Error('Unsupported image format.');
        uploads.push({ relativePath: item.path.slice('assets/uploads/'.length), buffer });
    }
    // Validate the complete bundle before creating a fresh restore directory.
    fs.mkdirSync(target, { recursive: false, mode: 0o700 });
    for (const [section, value] of Object.entries(content)) writeAtomic(path.join(target, 'data', `${section}.json`), value);
    for (const item of uploads) {
        const output = path.join(target, 'uploads', item.relativePath);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, item.buffer, { flag: 'wx' });
    }
    return { dataDir: path.join(target, 'data'), uploadsDir: path.join(target, 'uploads') };
}

module.exports = { createStorage, writeAtomic, CONTENT_SECTIONS, restoreBackup };
