const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, validateSite, safeUrl } = require('../lib/content');
const { isPublicAddress, publicFetch } = require('../lib/outbound');

test('portfolio schemas reject malformed types and out-of-range values', () => {
    assert.throws(() => validate('projects', {}), error => error.status === 400);
    assert.throws(() => validate('skills', [{ name: 'Testing', percentage: 101 }]), error => error.fields[0].path === '0.percentage');
    assert.throws(() => validate('skills', [{ name: 'Testing', percentage: '50' }]));
    assert.throws(() => validate('interests', [{ name: 'Test', icon: 'bi bi-code-slash', color: 'red;display:none' }]));
});

test('rich text keeps supported formatting and removes scripts and unsafe attributes', () => {
    const profile = validate('profile', { name: 'Test', meta: {}, aboutText: '<strong>Safe</strong><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(2)">Link</a><span style="display:none">Visible</span>' });
    assert.equal(profile.aboutText, '<strong>Safe</strong><a>Link</a><span>Visible</span>');
    assert.equal(profile.name, 'Test');
});

test('project links reject executable protocols, credentials, duplicate IDs and reversed dates', () => {
    const project = { id: 'test', title: 'Test' };
    for (const liveUrl of ['javascript:alert(1)', 'data:text/html,hello', 'https://user:password@example.com', '//example.com']) assert.throws(() => validate('projects', [{ ...project, liveUrl }]));
    assert.throws(() => validate('projects', [project, project]));
    assert.throws(() => validate('projects', [{ ...project, startDate: '2026-06', endDate: '2026-05' }]));
    assert.equal(validate('projects', [{ ...project, startDate: '2026-06', endDate: '' }])[0].startDate, '2026-06');
});

test('image paths cannot escape assets or introduce another protocol', () => {
    assert.equal(safeUrl('assets/uploads/project/test.webp', true), 'assets/uploads/project/test.webp');
    for (const input of ['../data/secrets.json', 'assets/../admin.html', 'assets/%2e%2e/secrets', 'file:///etc/passwd', 'assets\\image.png']) assert.equal(safeUrl(input, true), '');
});

test('site navigation only accepts existing unique targets', () => {
    assert.throws(() => validateSite({ navigation: [{ id: 'home', href: '#header"]script' }] }));
    assert.throws(() => validateSite({ testimonials: { sourceUrl: 'file:///private' } }));
});

test('outbound requests reject internal and mapped addresses before network access', async () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1', '192.168.1.1', '100.64.0.1']) assert.equal(isPublicAddress(address), false, address);
    assert.equal(isPublicAddress('1.1.1.1'), true);
    await assert.rejects(() => publicFetch('http://127.0.0.1/private'));
    await assert.rejects(() => publicFetch('http://[::1]/private'));
    await assert.rejects(() => publicFetch('file:///etc/passwd'));
});
