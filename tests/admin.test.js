const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const nodemailer = require('nodemailer');

let root, server, base, admin, exported;
let emailCalls = [];
let releaseEmail;
let releaseVerification;
let failEmailSubject;
const password = 'Test-only-portfolio-2026';

function client() {
    let cookie = '';
    let csrf = '';
    return {
        async request(method, url, body, headers = {}) {
            const response = await fetch(base + url, {
                method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf, ...headers },
                body: body === undefined ? undefined : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body),
            });
            const setCookie = response.headers.get('set-cookie');
            if (setCookie) cookie = setCookie.split(';')[0];
            const data = (response.headers.get('content-type') || '').includes('json') ? await response.json() : await response.text();
            if (data.csrfToken) csrf = data.csrfToken;
            return { status: response.status, headers: response.headers, data };
        },
        async login() {
            await this.request('GET', '/api/admin/check');
            const result = await this.request('POST', '/api/admin/login', { username: 'test-admin', password });
            assert.equal(result.status, 200);
            return result;
        },
        async save(section, data, version) {
            const url = ['site', 'settings', 'subscriptions'].includes(section) ? `/api/admin/${section}` : `/api/admin/portfolio/${section}`;
            const current = version || (await this.request('GET', url)).headers.get('x-data-version');
            return this.request('PUT', url, data, { 'If-Match': current });
        },
    };
}

before(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-admin-test-'));
    process.env.DATA_DIR = path.join(root, 'data');
    process.env.UPLOADS_DIR = path.join(root, 'uploads');
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    process.env.ADMIN_USERNAME = 'test-admin';
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(password, 4);
    process.env.EMAIL_PASSWORD = 'test-smtp-secret';
    process.env.CRON_SECRET = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(process.env.DATA_DIR);
    const data = {
        profile: { name: 'Test Portfolio', fullName: 'Test Owner', tagline: '<span>Engineer</span>', profileImage: 'assets/img/me-0.png', aboutText: 'About', details: [], socialLinks: [], meta: {} },
        skills: [{ name: 'Testing', percentage: 80 }], interests: [],
        resume: { summary: { name: 'Test Owner', text: 'Summary' }, experience: [], education: [], certifications: [], honors: [], research: [], areasOfInterest: {} },
        contact: { address: '', emails: [], phones: [], socialLinks: [] }, projects: [],
        settings: { email: { host: 'smtp.example.test', port: 465, secure: true, user: 'test@example.test', from: 'test@example.test', to: 'owner@example.test' }, images: { backgroundImage: 'assets/img/bg.png', profileImage: 'assets/img/me-0.png' }, analytics: { googleMeasurementId: '' } },
        site: { testimonials: { sourceUrl: '' } },
        subscriptions: { settings: { enabled: true, recipientEmail: 'owner@example.test', timezone: 'UTC', defaultReminderTime: '00:00', digest: true }, subscriptions: [], reminderHistory: [] },
        secrets: { emailPassword: 'test-smtp-secret' },
    };
    for (const [section, value] of Object.entries(data)) fs.writeFileSync(path.join(process.env.DATA_DIR, `${section}.json`), JSON.stringify(value));
    mock.method(nodemailer, 'createTransport', () => ({
        async sendMail(message, callback) {
            emailCalls.push(message);
            if (failEmailSubject && message.subject.includes(failEmailSubject)) { failEmailSubject = null; throw new Error('Simulated SMTP failure'); }
            if (releaseEmail) await releaseEmail.promise;
            const info = { messageId: 'test' }; callback?.(null, info); return info;
        },
        async verify() {
            if (releaseVerification) {
                releaseVerification.started();
                await releaseVerification.promise;
            }
            return true;
        }, close() {},
    }));
    const { app } = require('../server');
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    admin = client(); await admin.login();
});

after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    mock.restoreAll();
    assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(), 'portfolio-admin-test-')));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('private endpoints require authentication and never expose runtime files', async () => {
    const guest = client();
    for (const url of ['/api/admin/settings', '/api/admin/dashboard', '/api/admin/media', '/api/admin/revisions', '/api/admin/backup/export', '/api/admin/subscriptions']) assert.equal((await guest.request('GET', url)).status, 401, url);
    for (const url of ['/data/secrets.json', '/data/subscriptions.json', '/api/portfolio/secrets']) assert.equal((await guest.request('GET', url)).status, 404);
    assert.equal((await guest.request('GET', '/api/portfolio/profile')).status, 200);
});

test('login rotates sessions and all admin mutations need CSRF and same origin', async () => {
    const other = client();
    const check = await other.request('GET', '/api/admin/check');
    const loggedIn = await other.request('POST', '/api/admin/login', { username: 'test-admin', password });
    assert.notEqual(check.headers.get('set-cookie').split(';')[0], loggedIn.headers.get('set-cookie').split(';')[0]);
    assert.match(loggedIn.headers.get('set-cookie'), /HttpOnly/);
    assert.equal((await other.request('POST', '/api/admin/backups', {}, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await other.request('POST', '/api/admin/backups', {}, { Origin: 'https://attacker.example' })).status, 403);
    assert.equal((await other.request('POST', '/api/admin/backups', {}, { 'X-CSRF-Token': 'é'.repeat(64) })).status, 403);
    assert.equal((await other.request('POST', '/api/admin/logout')).status, 200);
    assert.equal((await other.request('GET', '/api/admin/dashboard')).status, 401);
});

test('invalid content returns field errors without changing data or creating a revision', async () => {
    const before = fs.readFileSync(path.join(process.env.DATA_DIR, 'skills.json'), 'utf8');
    const result = await admin.save('skills', [{ name: 'Bad', percentage: -5 }]);
    assert.equal(result.status, 400);
    assert.equal(result.data.fields[0].path, '0.percentage');
    assert.equal(fs.readFileSync(path.join(process.env.DATA_DIR, 'skills.json'), 'utf8'), before);
    assert.equal((await admin.request('GET', '/api/admin/revisions')).data.revisions.length, 0);
});

test('save validates, strips unsupported fields, creates history, and rejects stale versions', async () => {
    const previous = await admin.request('GET', '/api/admin/portfolio/skills');
    const version = previous.headers.get('x-data-version');
    const saved = await admin.save('skills', [{ name: 'Updated', percentage: 95, injected: 'discard' }], version);
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data.data, [{ name: 'Updated', percentage: 95 }]);
    assert.notEqual(saved.headers.get('x-data-version'), version);
    assert.equal((await admin.save('skills', [], version)).status, 409);
    assert.equal((await admin.request('PUT', '/api/admin/portfolio/skills', [])).status, 428);
    assert.deepEqual((await admin.request('GET', '/api/portfolio/skills')).data, saved.data.data);
    assert.equal((await admin.request('GET', '/api/admin/revisions')).data.revisions[0].section, 'skills');
});

test('all editable portfolio sections round-trip with validation', async () => {
    for (const section of ['profile', 'resume', 'contact', 'interests']) {
        const current = await admin.request('GET', `/api/admin/portfolio/${section}`);
        assert.equal((await admin.save(section, current.data)).status, 200, section);
    }
    assert.equal((await admin.save('projects', [{ id: 'bad', title: 'Bad', liveUrl: 'javascript:alert(1)' }])).status, 400);
    assert.equal((await admin.save('site', { navigation: [{ id: 'home', href: '#wrong' }] })).status, 400);
});

test('reviewing and restoring a revision preserves the replaced content', async () => {
    const revisions = (await admin.request('GET', '/api/admin/revisions')).data.revisions;
    const skillsRevision = revisions.find(item => item.section === 'skills');
    const detail = await admin.request('GET', `/api/admin/revisions/${skillsRevision.id}`);
    assert.equal(detail.data.data[0].name, 'Testing');
    const latest = await admin.request('GET', '/api/admin/portfolio/skills');
    const result = await admin.request('POST', `/api/admin/revisions/${skillsRevision.id}/restore`, {}, { 'If-Match': latest.headers.get('x-data-version') });
    assert.equal(result.status, 200);
    assert.equal((await admin.request('GET', '/api/portfolio/skills')).data[0].name, 'Testing');
    assert.ok((await admin.request('GET', '/api/admin/revisions')).data.revisions.some(item => item.reason === 'Before restore'));
});

test('uploads are decoded, resized, and converted; active and historical images cannot be deleted', async () => {
    const png = await sharp({ create: { width: 2200, height: 1000, channels: 3, background: '#258d73' } }).png().toBuffer();
    const upload = await admin.request('POST', '/api/admin/uploads/project', png, { 'Content-Type': 'image/png' });
    assert.equal(upload.status, 200);
    assert.match(upload.data.path, /\.webp$/);
    const localFile = path.join(process.env.UPLOADS_DIR, upload.data.path.slice('assets/uploads/'.length));
    const metadata = await sharp(fs.readFileSync(localFile)).metadata();
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.width, 1600);
    const project = { id: 'image-test', title: 'Image test', image: upload.data.path };
    assert.equal((await admin.save('projects', [project])).status, 200);
    const deleteUrl = `/api/admin/media/${upload.data.path.slice('assets/uploads/'.length)}`;
    assert.equal((await admin.request('DELETE', deleteUrl)).status, 409);
    assert.equal((await admin.save('projects', [])).status, 200);
    assert.equal((await admin.request('DELETE', deleteUrl)).status, 409);
    const unused = await admin.request('POST', '/api/admin/uploads/general', png, { 'Content-Type': 'image/png' });
    assert.equal((await admin.request('DELETE', `/api/admin/media/${unused.data.path.slice('assets/uploads/'.length)}`)).status, 200);
    assert.equal((await admin.request('POST', '/api/admin/uploads/general', Buffer.from('not an image'), { 'Content-Type': 'image/png' })).status, 400);
    assert.equal((await admin.request('POST', '/api/admin/uploads/general', Buffer.from('GIF89a123456789'), { 'Content-Type': 'image/gif' })).status, 400);
});

test('subscription validation rejects invalid dates/timezones and ignores forged delivery history', async () => {
    const current = (await admin.request('GET', '/api/admin/subscriptions')).data;
    const invalid = structuredClone(current); invalid.settings.timezone = 'Invalid/Timezone';
    assert.equal((await admin.save('subscriptions', invalid)).status, 400);
    const item = { id: 'due', name: 'Test service', renewalDate: new Date().toISOString().slice(0, 10), status: 'active', billingCycle: 'yearly', cost: 10, currency: 'USD', autoRenew: false, reminders: [{ offsetDays: 0, time: '00:00', enabled: true }, { offsetDays: 0, time: '00:00', enabled: true }] };
    const invalidDate = { ...current, subscriptions: [{ ...item, renewalDate: '2026-02-30' }] };
    assert.equal((await admin.save('subscriptions', invalidDate)).status, 400);
    const saved = await admin.save('subscriptions', { ...current, subscriptions: [item], reminderHistory: [{ key: 'forged' }] });
    assert.equal(saved.status, 200); assert.equal(saved.data.data.reminderHistory.length, 0);
});

test('reminder dry runs, concurrent runs, and retries never duplicate a delivery', async () => {
    const dryRun = await admin.request('POST', '/api/admin/subscriptions/reminders/run', { dryRun: true });
    assert.equal(dryRun.data.count, 1); assert.equal(emailCalls.length, 0);
    let resolveEmail;
    releaseEmail = { promise: new Promise(resolve => { resolveEmail = resolve; }) };
    const first = admin.request('POST', '/api/admin/subscriptions/reminders/run', { dryRun: false });
    while (!emailCalls.length) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal((await admin.request('POST', '/api/admin/subscriptions/reminders/run', { dryRun: false })).status, 409);
    const snapshot = (await admin.request('GET', '/api/admin/subscriptions')).data;
    assert.equal((await admin.save('subscriptions', snapshot)).status, 409);
    resolveEmail(); releaseEmail = null;
    assert.equal((await first).data.sent, true);
    assert.equal((await admin.request('POST', '/api/admin/subscriptions/reminders/run', { dryRun: false })).data.count, 0);
    assert.equal(emailCalls.length, 1);
    const latest = (await admin.request('GET', '/api/admin/subscriptions')).data;
    assert.equal((await admin.save('subscriptions', { ...latest, reminderHistory: [] })).data.data.reminderHistory.length, 1);
});

test('SMTP verification does not send a message; snapshots and export omit credentials', async () => {
    const count = emailCalls.length;
    assert.equal((await admin.request('POST', '/api/admin/settings/verify-email')).status, 200);
    assert.equal(emailCalls.length, count);
    assert.equal((await admin.request('GET', '/api/admin/dashboard')).data.email.verified, true);
    assert.equal((await admin.request('POST', '/api/admin/backups')).data.count, 9);
    exported = (await admin.request('GET', '/api/admin/backup/export')).data;
    assert.equal(exported.format, 'portfolio-backup');
    assert.ok(exported.uploads.length > 0);
    assert.equal(Object.hasOwn(exported.data, 'secrets.json'), false);
    assert.equal(JSON.stringify(exported).includes('test-smtp-secret'), false);
    assert.equal(JSON.stringify((await admin.request('GET', '/api/admin/settings')).data).includes('test-smtp-secret'), false);
});

test('SMTP verification expires on password-only changes and cannot verify concurrent settings changes', { timeout: 10000 }, async () => {
    const current = (await admin.request('GET', '/api/admin/settings')).data;
    assert.equal((await admin.save('settings', current)).status, 200);
    assert.equal((await admin.request('POST', '/api/admin/settings/verify-email')).status, 200);
    const version = (await admin.request('GET', '/api/admin/settings')).headers.get('x-data-version');
    const passwordOnly = await admin.save('settings', { ...current, email: { ...current.email, password: 'changed-test-smtp-password' } });
    assert.equal(passwordOnly.status, 200);
    assert.notEqual(passwordOnly.headers.get('x-data-version'), version);
    assert.equal((await admin.save('settings', current, version)).status, 409);
    assert.equal((await admin.request('GET', '/api/admin/dashboard')).data.email.verified, false);

    let started, release;
    const verifying = new Promise(resolve => { started = resolve; });
    releaseVerification = { started, promise: new Promise(resolve => { release = resolve; }) };
    const pending = admin.request('POST', '/api/admin/settings/verify-email');
    await verifying;
    try {
        assert.equal((await admin.save('settings', { ...current, email: { ...current.email, host: 'changed.example.test' } })).status, 200);
    } finally {
        release(); releaseVerification = null;
        assert.equal((await pending).status, 200);
    }
    assert.equal((await admin.request('GET', '/api/admin/dashboard')).data.email.verified, false);
});

test('non-digest retries preserve successful deliveries after a partial SMTP failure', async () => {
    const current = (await admin.request('GET', '/api/admin/subscriptions')).data;
    const first = { ...current.subscriptions[0], id: 'first', name: 'First service' };
    const second = { ...current.subscriptions[0], id: 'second', name: 'Second service' };
    assert.equal((await admin.save('subscriptions', { ...current, settings: { ...current.settings, digest: false }, subscriptions: [first, second] })).status, 200);
    const prior = emailCalls.length;
    failEmailSubject = 'Second service';
    assert.equal((await admin.request('POST', '/api/admin/subscriptions/reminders/run', { dryRun: false })).status, 500);
    assert.equal((await admin.request('POST', '/api/admin/subscriptions/reminders/run', { dryRun: false })).data.sent, true);
    assert.equal(emailCalls.slice(prior).filter(item => item.subject.includes('First service')).length, 1);
    assert.equal((await admin.request('GET', '/api/admin/subscriptions')).data.reminderHistory.filter(item => ['first', 'second'].includes(item.subscriptionId)).length, 2);
});

test('malformed JSON and upload limits produce JSON errors', async () => {
    assert.equal((await admin.request('POST', '/api/admin/backups', '{')).status, 400);
    const tooLarge = await admin.request('POST', '/api/admin/uploads/general', Buffer.alloc(8 * 1024 * 1024 + 1), { 'Content-Type': 'image/png' });
    assert.equal(tooLarge.status, 413); assert.ok(tooLarge.data.error);
});

test('exported backup restores into a fresh directory and cannot traverse or overwrite paths', async () => {
    const { restoreBackup } = require('../lib/admin-storage');
    const backupFile = path.join(root, 'export.json');
    fs.writeFileSync(backupFile, JSON.stringify(exported));
    const destination = path.join(root, 'restored');
    const result = await restoreBackup(backupFile, destination);
    assert.ok(fs.existsSync(path.join(result.dataDir, 'profile.json')));
    assert.ok(fs.existsSync(path.join(result.uploadsDir, exported.uploads[0].path.slice('assets/uploads/'.length))));
    await assert.rejects(() => restoreBackup(backupFile, destination), /must not already exist/);
    const badBackup = structuredClone(exported); badBackup.uploads[0].path = 'assets/uploads/../../outside.png';
    fs.writeFileSync(backupFile, JSON.stringify(badBackup));
    const rejectedDestination = path.join(root, 'rejected');
    await assert.rejects(() => restoreBackup(backupFile, rejectedDestination), /Invalid or duplicate/);
    assert.equal(fs.existsSync(rejectedDestination), false);
});

test('contact challenge is checked on the server and can only be used once', async () => {
    const visitor = client();
    assert.equal((await visitor.request('POST', '/send-email', {})).status, 400);
    const challenge = await visitor.request('GET', '/api/contact/challenge');
    const numbers = challenge.data.question.match(/\d+/g).map(Number);
    const form = { name: 'Visitor', email: 'visitor@example.test', subject: 'Test', message: 'Message', answer: String(numbers[0] + numbers[1]) };
    assert.equal((await visitor.request('POST', '/send-email', form)).status, 200);
    assert.equal((await visitor.request('POST', '/send-email', form)).status, 400);
});

test('password changes revoke other sessions and rotate the current CSRF token', async () => {
    const second = client(); await second.login();
    const token = (await admin.request('GET', '/api/admin/check')).data.csrfToken;
    const changed = await admin.request('POST', '/api/admin/password', { currentPassword: password, newPassword: 'Another-test-only-password' });
    assert.equal(changed.status, 200); assert.notEqual(changed.data.csrfToken, token);
    assert.equal((await admin.request('GET', '/api/admin/dashboard')).status, 200);
    assert.equal((await second.request('GET', '/api/admin/dashboard')).status, 401);
});
