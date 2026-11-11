const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.env.PORTFOLIO_ROOT || path.resolve(__dirname, '..');
const filename = path.join(root, 'public', 'assets', 'js', 'motion.js');
const source = fs.readFileSync(filename, 'utf8');

function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, listener) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(listener);
  };
  target.emit = (type, event = {}) => {
    (listeners.get(type) || []).forEach(listener => listener(event));
  };
  return target;
}

// This models event delivery and frame ownership, not browser rendering.
// Actual CSS timelines and geometry are covered by the visual browser checks.
function fixture({ reduced = false, fine = true, width = 1600 } = {}) {
  const observers = [];
  const resizeObservers = [];
  const frames = new Map();
  let nextFrame = 1;
  let requested = 0;
  let cancelled = 0;

  function notify(target, attributeName) {
    observers.forEach(observer => {
      if (observer.targets.some(([element, options]) => element === target && options.attributes &&
          (!options.attributeFilter || options.attributeFilter.includes(attributeName)))) {
        observer.callback([{ target, attributeName }]);
      }
    });
  }

  function element(tag = 'div', className = '') {
    const classes = new Set(className.split(/\s+/).filter(Boolean));
    const values = new Map();
    const attributes = new Map();
    const node = events({ tagName: tag.toUpperCase(), children: [], parentElement: null, hidden: false, isConnected: true });
    Object.defineProperty(node, 'className', {
      get: () => [...classes].join(' '),
      set(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); notify(node, 'class'); },
    });
    node.classList = {
      contains: name => classes.has(name),
      add(name) { if (!classes.has(name)) { classes.add(name); notify(node, 'class'); } },
      remove(name) { if (classes.delete(name)) notify(node, 'class'); },
    };
    node.style = {
      setProperty(name, value) { values.set(name, String(value)); notify(node, 'style'); },
      removeProperty(name) { values.delete(name); notify(node, 'style'); },
      getPropertyValue: name => values.get(name) || '',
    };
    node.setAttribute = (name, value) => attributes.set(name, String(value));
    node.getAttribute = name => attributes.get(name) ?? null;
    node.appendChild = child => { child.parentElement = node; node.children.push(child); return child; };
    node.contains = child => {
      for (let current = child; current; current = current.parentElement) if (current === node) return true;
      return false;
    };
    node.closest = selector => {
      for (let current = node; current; current = current.parentElement) {
        if (selector === '.project-card' && current.classList.contains('project-card')) return current;
      }
      return null;
    };
    node.getBoundingClientRect = () => ({ left: 100, top: 150, width: 300, height: 400 });
    return node;
  }

  const body = element('body');
  const header = body.appendChild(element('header'));
  const navbar = header.appendChild(element('nav'));
  const sections = ['about', 'resume', 'projects', 'contact'].map(id => {
    const section = body.appendChild(element('section')); section.id = id; return section;
  });
  const card = sections[2].appendChild(element('div', 'project-card'));
  const inner = card.appendChild(element('span'));
  const reduction = events({ matches: reduced });
  const pointer = events({ matches: fine });
  const document = events({
    body, hidden: false, documentElement: { scrollHeight: 900 },
    getElementById: id => ({ header, navbar })[id] || null,
    querySelector: selector => selector === '.reading-progress' ? body.children.find(child => child.classList.contains('reading-progress')) || null : null,
    querySelectorAll: selector => selector === 'body > section' ? sections : [],
    createElement: tag => element(tag),
  });
  const window = events({
    innerWidth: width, innerHeight: 900, scrollY: 0,
    matchMedia: query => query.includes('prefers-reduced-motion') ? reduction : pointer,
    requestAnimationFrame(callback) { const id = nextFrame++; frames.set(id, callback); requested++; return id; },
    cancelAnimationFrame(id) { if (frames.delete(id)) cancelled++; },
  });
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
    observe(target, options) { this.targets.push([target, options]); }
  }
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = []; resizeObservers.push(this); }
    observe(target) { this.targets.push(target); }
  }
  window.ResizeObserver = ResizeObserver;
  const context = vm.createContext({ window, document, MutationObserver, ResizeObserver });
  const load = () => vm.runInContext(source, context, { filename });
  load();
  return {
    body, header, navbar, sections, card, inner, window, document, load,
    get progress() { return document.querySelector('.reading-progress'); },
    get pending() { return frames.size; },
    get requested() { return requested; },
    get cancelled() { return cancelled; },
    flush() {
      const callbacks = [...frames.entries()];
      callbacks.forEach(([id, callback]) => { frames.delete(id); callback(); });
      return callbacks.length;
    },
    move(x = 1600, y = 900, target = body, pointerType = 'mouse') {
      window.emit('pointermove', { clientX: x, clientY: y, target, pointerType });
    },
    activate(index = 2) {
      header.classList.add('header-top');
      sections.forEach((section, i) => section.classList[i === index ? 'add' : 'remove']('section-show'));
      document.documentElement.scrollHeight = 1800;
      window.scrollY = 450;
      window.emit('scroll');
    },
    media(name, matches) {
      const query = name === 'reduced' ? reduction : pointer;
      query.matches = matches; query.emit('change', { matches });
    },
    resize() { resizeObservers.forEach(observer => observer.callback([])); },
  };
}

function assertNoDepth(f) {
  assert.equal(f.body.classList.contains('has-pointer-depth'), false);
  assert.equal(f.body.style.getPropertyValue('--depth-x'), '');
  assert.equal(f.body.style.getPropertyValue('--depth-y'), '');
}

function assertNoHalo(f) {
  assert.equal(f.card.style.getPropertyValue('--halo-x'), '');
  assert.equal(f.card.style.getPropertyValue('--halo-y'), '');
}

test('reduced motion starts with no scheduled effects, even after pointer, scroll, or size events', () => {
  const f = fixture({ reduced: true });
  f.activate(); f.move(200, 250, f.inner); f.resize(); f.window.emit('resize');
  assert.equal(f.requested, 0);
  assert.equal(f.pending, 0);
  assert.equal(f.progress.hidden, true);
  assert.equal(f.progress.getAttribute('aria-hidden'), 'true');
  assertNoDepth(f); assertNoHalo(f);
});

test('pointer, scroll and resize-observer events coalesce into one frame and never self-schedule', () => {
  const f = fixture();
  f.flush();
  const requests = f.requested;
  f.move(200, 300); f.move(1600, 900); f.window.emit('scroll'); f.resize();
  assert.equal(f.pending, 1);
  assert.equal(f.requested, requests + 1);
  f.flush();
  assert.equal(f.body.style.getPropertyValue('--depth-x'), '4.00px');
  assert.equal(f.body.style.getPropertyValue('--depth-y'), '3.00px');
  assert.equal(f.pending, 0, 'CSS variable writes must not start an observer/frame loop');
  f.move(-1000, 5000); f.flush();
  assert.equal(f.body.style.getPropertyValue('--depth-x'), '-4.00px');
  assert.equal(f.body.style.getPropertyValue('--depth-y'), '3.00px');
  assert.equal(f.pending, 0);
});

test('coarse pointers, touch input and small viewports never move the Home background', () => {
  for (const options of [{ fine: false }, { width: 390 }]) {
    const f = fixture(options); f.move(); f.flush(); assertNoDepth(f);
    assert.equal(f.pending, 0);
  }
  const f = fixture(); f.flush(); f.move(1600, 900, f.body, 'touch');
  assert.equal(f.pending, 0); assertNoDepth(f);
});

test('section navigation resets Home depth and reports reading progress only for scrolling sections', () => {
  const f = fixture(); f.move(); f.flush();
  assert.equal(f.body.classList.contains('has-pointer-depth'), true);
  f.activate();
  assertNoDepth(f);
  f.flush();
  assert.equal(f.progress.hidden, false);
  assert.equal(f.progress.style.getPropertyValue('--reading-progress'), '0.5');
  f.window.scrollY = 3000; f.window.emit('scroll'); f.flush();
  assert.equal(f.progress.style.getPropertyValue('--reading-progress'), '1');
  f.document.documentElement.scrollHeight = 900; f.resize(); f.flush();
  assert.equal(f.progress.hidden, true);
  f.sections[2].classList.remove('section-show'); f.header.classList.remove('header-top'); f.flush();
  assert.equal(f.progress.hidden, true);
  assert.equal(f.pending, 0);
});

test('project halo tracks only cards in the active section and clears on menu opening or navigation', () => {
  const f = fixture(); f.activate(); f.flush();
  f.move(250, 250, f.inner); f.flush();
  assert.equal(f.card.style.getPropertyValue('--halo-x'), '150.0px');
  assert.equal(f.card.style.getPropertyValue('--halo-y'), '100.0px');
  f.navbar.classList.add('navbar-mobile');
  assertNoHalo(f);
  f.move(250, 250, f.inner); f.flush();
  assertNoHalo(f); assert.equal(f.progress.hidden, true);
  f.navbar.classList.remove('navbar-mobile'); f.flush();
  f.move(250, 250, f.inner); f.flush();
  f.activate(1); f.flush();
  assertNoHalo(f);
  f.move(250, 250, f.inner); f.flush();
  assertNoHalo(f); assert.equal(f.pending, 0);
});

test('opening a modal cancels pending work and suppresses effects until it closes', () => {
  const f = fixture(); f.activate(); f.flush();
  f.move(250, 250, f.inner); f.flush(); f.move(300, 300, f.inner);
  assert.equal(f.pending, 1);
  f.document.emit('show.bs.modal'); f.body.classList.add('modal-open');
  assert.equal(f.pending, 0); assert.ok(f.cancelled > 0);
  assertNoDepth(f); assertNoHalo(f); assert.equal(f.progress.hidden, true);
  f.move(250, 250, f.inner); f.window.emit('scroll'); f.flush();
  assertNoHalo(f); assert.equal(f.progress.hidden, true); assert.equal(f.pending, 0);
  f.body.classList.remove('modal-open'); f.document.emit('hidden.bs.modal'); f.flush();
  assert.equal(f.progress.hidden, false); assertNoHalo(f); assert.equal(f.pending, 0);
});

test('visibility and preference changes cancel pending work and clear decorative state', () => {
  const f = fixture(); f.activate(); f.flush();
  f.move(250, 250, f.inner); f.flush(); f.move(300, 300, f.inner);
  f.document.hidden = true; f.document.emit('visibilitychange');
  assert.equal(f.pending, 0); assertNoHalo(f); assert.equal(f.progress.hidden, true);
  f.window.emit('scroll'); f.resize(); assert.equal(f.pending, 0);
  f.document.hidden = false; f.document.emit('visibilitychange'); f.flush();
  assert.equal(f.progress.hidden, false); assertNoHalo(f);
  f.move(250, 250, f.inner); f.flush(); f.move(300, 300, f.inner);
  f.media('reduced', true);
  assert.equal(f.pending, 0); assertNoDepth(f); assertNoHalo(f); assert.equal(f.progress.hidden, true);
  f.window.emit('scroll'); f.move(); assert.equal(f.pending, 0);
  f.media('reduced', false); f.flush();
  assert.equal(f.progress.hidden, false); assertNoHalo(f);
  f.move(250, 250, f.inner); f.flush(); f.media('fine', false); f.flush();
  assertNoHalo(f); assertNoDepth(f); assert.equal(f.pending, 0);
});

test('pointer leave, blur and page lifecycle clear Home depth without leaving a frame loop', () => {
  const f = fixture();
  for (const [target, event] of [[f.document, 'pointerleave'], [f.window, 'blur'], [f.window, 'pagehide']]) {
    f.move(); f.flush(); f.move(1200, 700);
    target.emit(event); f.flush();
    assertNoDepth(f); assertNoHalo(f); assert.equal(f.pending, 0);
  }
  f.window.emit('pageshow'); f.flush(); assertNoDepth(f); assert.equal(f.pending, 0);
});

test('initializing twice cannot duplicate the progress element or event-driven work', () => {
  const f = fixture(); f.flush(); f.load();
  assert.equal(f.body.children.filter(child => child.classList.contains('reading-progress')).length, 1);
  const requests = f.requested; f.move();
  assert.equal(f.requested, requests + 1);
  f.flush(); assert.equal(f.pending, 0);
});
