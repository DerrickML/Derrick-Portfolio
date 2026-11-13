const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.env.PORTFOLIO_ROOT || path.resolve(__dirname, '..');

function adminResponseReader() {
  const stopInitialization = new Error('Skip admin DOM initialization.');
  const context = vm.createContext({
    URL, location: { href: 'https://example.test/admin.html' },
    document: { getElementById() { throw stopInitialization; } },
  });
  const filename = path.join(root, 'public', 'assets', 'js', 'admin.js');
  // Function declarations are available before the first DOM event is registered.
  assert.throws(() => vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename }), error => error === stopInitialization);
  return context.readResponse;
}

test('admin non-JSON errors identify the failed endpoint without exposing its query or response body', async () => {
  const readResponse = adminResponseReader();
  for (const status of [404, 503]) {
    const response = new Response('<html>private diagnostic details</html>', { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    Object.defineProperty(response, 'url', { value: 'https://example.test/api/admin/portfolio/profile?token=private-token' });
    await assert.rejects(() => readResponse(response), error => {
      assert.equal(error.status, status);
      assert.equal(error.code, 'UNEXPECTED_RESPONSE');
      assert.equal(error.endpoint, '/api/admin/portfolio/profile');
      assert.ok(error.message.includes(`HTTP ${status}`));
      assert.ok(error.message.includes('/api/admin/portfolio/profile'));
      assert.equal(error.message.includes('private'), false);
      if (status === 404) assert.match(error.message, /backend is deployed and restarted/);
      return true;
    });
  }
});

test('admin responses preserve valid JSON and distinguish malformed JSON from HTML errors', async () => {
  const readResponse = adminResponseReader();
  const data = { error: 'Please log in again.', fields: [] };
  assert.deepEqual(await readResponse(new Response(JSON.stringify(data), { status: 401, headers: { 'Content-Type': 'application/json' } })), data);
  const invalid = new Response('{broken', { headers: { 'Content-Type': 'application/json' } });
  Object.defineProperty(invalid, 'url', { value: 'https://example.test/api/admin/settings' });
  await assert.rejects(() => readResponse(invalid), error => error.code === 'INVALID_JSON' && error.endpoint === '/api/admin/settings' && error.status === 200);
});

// Deliberately small DOM: only the public scripts' observable output is modeled.
function element(tag = 'div') {
  let text = '';
  const listeners = new Map();
  const attributes = new Map();
  return {
    tagName: tag.toUpperCase(), children: [], dataset: {}, style: {}, value: '',
    hidden: false, disabled: false, className: '', parentElement: null,
    get textContent() { return text + this.children.map(child => child.textContent).join(''); },
    set textContent(value) { text = String(value ?? ''); this.children = []; },
    set innerHTML(value) {
      assert.equal(value, '', 'The fake only supports clearing markup.');
      text = ''; this.children = [];
    },
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; },
    replaceChildren(...children) { text = ''; this.children = []; children.forEach(child => this.appendChild(child)); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    },
    async emit(name, event = {}) {
      await Promise.all((listeners.get(name) || []).map(callback => callback({ preventDefault() {}, ...event })));
    },
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return this.parentElement; }, focus() {}, reset() {},
    classList: { add() {}, remove() {}, toggle() {} },
  };
}

function fixture(ids = [], selectors = {}) {
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  const ready = [];
  const document = {
    getElementById: id => elements[id] || null,
    querySelector: selector => selectors[selector] || null,
    querySelectorAll: () => [],
    createElement: tag => element(tag),
    createTextNode: text => Object.assign(element(), { textContent: text }),
    addEventListener: (name, callback) => {
      assert.equal(name, 'DOMContentLoaded'); ready.push(callback);
    },
    documentElement: { style: { setProperty() {} } },
  };
  const context = vm.createContext({
    document, window: {}, console: { error() {} }, setTimeout, clearTimeout,
    fetch: async () => { throw new Error('Unexpected network request in unit test.'); },
    bootstrap: { Modal: class { show() {} hide() {} } },
    Swiper: class {},
  });
  return {
    elements, context,
    load(name) {
      const filename = path.join(root, 'public', 'assets', 'js', name);
      vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
    },
    start() { return ready.splice(0).map(callback => callback()); },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

function fakeClock() {
  let now = 0;
  let nextId = 0;
  const pending = new Map();
  return {
    setTimeout(callback, delay) { const id = ++nextId; pending.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { pending.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...pending].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        pending.delete(id); now = timer.at; timer.callback();
      }
      now = end;
    },
  };
}

const contactIds = ['contact-form', 'submitButton', 'captchaModal', 'captchaAnswer', 'checkCaptcha', 'captchaQuestion', 'mailMessage', 'captchaMessage'];

test('a replacement contact error survives the previous message timeout', async () => {
  const app = fixture(contactIds);
  const clock = fakeClock();
  Object.assign(app.context, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  app.context.window.PortfolioData = {
    preview: false,
    fetchJson: async () => { throw new Error('Simulated unavailable challenge.'); },
  };
  app.load('contact-form.js');
  app.start();

  await app.elements['contact-form'].emit('submit');
  assert.ok(app.elements.mailMessage.textContent, 'The first failure must be displayed.');
  clock.advance(9000);
  await app.elements['contact-form'].emit('submit');
  const replacement = app.elements.mailMessage.textContent;
  assert.ok(replacement, 'The replacement failure must be displayed.');
  clock.advance(1000);
  assert.equal(app.elements.mailMessage.textContent, replacement, 'The old timer must not erase the newer failure.');
  clock.advance(9000);
  assert.equal(app.elements.mailMessage.textContent, '', 'The replacement still expires after its own interval.');
});

test('late site configuration preserves an already displayed server CAPTCHA challenge', async () => {
  const app = fixture(contactIds);
  const site = deferred();
  const clock = fakeClock();
  Object.assign(app.context, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  app.context.window.PortfolioData = {
    preview: false, safeUrl: value => value || '',
    fetchJson: async url => {
      if (url === '/api/site') return site.promise;
      if (url === '/api/contact/challenge') return { question: 'What is 8 + 9?' };
      return null;
    },
  };
  app.load('data-loader.js');
  app.load('contact-form.js');
  const pending = app.start();
  await app.elements['contact-form'].emit('submit');
  assert.equal(app.elements.captchaQuestion.textContent, 'What is 8 + 9?');

  site.resolve({ contactForm: { captchaQuestion: 'What is 1 + 1?' } });
  await Promise.all(pending);
  await flush();
  assert.equal(app.elements.captchaQuestion.textContent, 'What is 8 + 9?', 'Static labels must not replace the question bound to the server session.');
});

test('pending skills and contact requests do not hold profile and resume rendering', async () => {
  const app = fixture(['header-name', 'profile-image', 'resume-tabs', 'resume-panels', 'resume-overview', 'contact-address']);
  const skills = deferred();
  const contact = deferred();
  const responses = {
    '/api/settings/public': { images: { profileImage: 'assets/img/configured-profile.png' } },
    '/api/site': {},
    '/api/portfolio/profile': { name: 'Profile fixture', profileImage: 'assets/img/profile.png' },
    '/api/portfolio/resume': { summary: { name: 'Resume fixture', text: 'Available resume content' } },
    '/api/portfolio/interests': [],
    '/api/portfolio/skills': skills.promise,
    '/api/portfolio/contact': contact.promise,
  };
  app.context.window.PortfolioData = { preview: false, safeUrl: value => value || '', fetchJson: async url => responses[url] };
  app.load('data-loader.js');
  const pending = app.start();
  await flush();
  try {
    assert.equal(app.elements['header-name'].textContent, 'Profile fixture');
    assert.equal(app.elements['profile-image'].src, 'assets/img/configured-profile.png', 'Profile rendering must retain the configured image override.');
    assert.match(app.elements['resume-overview'].textContent, /Available resume content/);
    assert.equal(app.elements['contact-address'].textContent, '', 'The contact request is still pending.');
  } finally {
    skills.resolve([]);
    contact.resolve({ address: 'Delayed contact content' });
    await Promise.all(pending);
    await flush();
  }
  assert.equal(app.elements['contact-address'].textContent, 'Delayed contact content');
});

test('unavailable testimonials stay hidden when enabled site configuration arrives later', async t => {
  for (const scenario of ['empty', 'http-error', 'network-error']) {
    await t.test(scenario, async () => {
      const section = element();
      const app = fixture(['testimonials-container'], { '#about .testimonials': section });
      app.elements['testimonials-container'].parentElement = section;
      const site = deferred();
      const testimonialResponse = async () => {
        if (scenario === 'network-error') throw new Error('Simulated offline request.');
        return { ok: scenario !== 'http-error', status: scenario === 'http-error' ? 500 : 200,
          json: async () => scenario === 'http-error' ? { error: 'Unavailable' } : [] };
      };
      app.context.fetch = testimonialResponse;
      app.context.window.PortfolioData = {
        preview: false, safeUrl: value => value || '',
        fetchJson: async url => {
          if (url === '/api/site') return site.promise;
          if (url === '/api/testimonials') {
            const response = await testimonialResponse();
            if (!response.ok) throw new Error('Unavailable');
            return response.json();
          }
          return null;
        },
      };
      app.load('data-loader.js');
      app.load('testimonials.js');
      const pending = app.start();
      await flush();
      site.resolve({ sections: { testimonials: { enabled: true } } });
      await Promise.all(pending);
      await flush();
      assert.equal(section.hidden, true, 'Missing testimonials must stay hidden after site visibility is applied.');
    });
  }
});

test('populated testimonials preserve configured display visibility', async () => {
  const section = element();
  section.hidden = true;
  section.style.display = 'none';
  const app = fixture(['testimonials-container'], { '.testimonials': section, '#about .testimonials': section });
  app.elements['testimonials-container'].parentElement = section;
  const data = [{ name: 'Test author', title: 'Test role', quote: 'Test testimonial', image: '' }];
  app.context.fetch = async () => ({ ok: true, json: async () => data });
  app.context.window.PortfolioData = { preview: false, safeUrl: value => value || '', fetchJson: async () => data };
  app.load('testimonials.js');
  await Promise.all(app.start());
  await flush();
  assert.equal(section.hidden, false, 'Successfully loaded testimonials must clear their unavailable state.');
  assert.equal(section.style.display, 'none', 'Loading testimonials must not override the site visibility setting.');
  assert.equal(app.elements['testimonials-container'].children.length, 1);
  assert.match(app.elements['testimonials-container'].textContent, /Test testimonial/);
});
