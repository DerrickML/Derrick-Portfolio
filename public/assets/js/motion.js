/** Decorative enhancements. Content and navigation work without this module. */
(() => {
  'use strict';
  const header = document.getElementById('header');
  const navbar = document.getElementById('navbar');
  if (!header || !navbar || document.querySelector('.reading-progress')) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const sections = [...document.querySelectorAll('body > section')];
  const progress = document.createElement('div');
  progress.className = 'reading-progress';
  progress.setAttribute('aria-hidden', 'true');
  progress.hidden = true;
  document.body.appendChild(progress);

  let frame = 0;
  let pointer = null;
  let highlightedCard = null;

  function clearDepth() {
    document.body.classList.remove('has-pointer-depth');
    document.body.style.removeProperty('--depth-x');
    document.body.style.removeProperty('--depth-y');
  }

  function clearHighlight() {
    if (!highlightedCard) return;
    highlightedCard.style.removeProperty('--halo-x');
    highlightedCard.style.removeProperty('--halo-y');
    highlightedCard = null;
  }

  function suspend() {
    pointer = null;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    clearDepth();
    clearHighlight();
    progress.hidden = true;
  }

  function schedule() {
    if (!frame && !reduced.matches && !document.hidden) frame = window.requestAnimationFrame(render);
  }

  function render() {
    frame = 0;
    if (reduced.matches || document.hidden) return suspend();
    const blocked = navbar.classList.contains('navbar-mobile') || document.body.classList.contains('modal-open');
    const activeSection = sections.find(section => section.classList.contains('section-show'));
    const range = document.documentElement.scrollHeight - window.innerHeight;
    const card = pointer?.target?.closest('.project-card');
    const canHighlight = !blocked && finePointer.matches && card?.isConnected && activeSection?.contains(card);
    const bounds = canHighlight ? card.getBoundingClientRect() : null;

    progress.hidden = blocked || !activeSection || range < 2;
    if (!progress.hidden) progress.style.setProperty('--reading-progress', String(Math.max(0, Math.min(1, window.scrollY / range))));

    if (!blocked && pointer && finePointer.matches && window.innerWidth >= 1024 && !header.classList.contains('header-top')) {
      const x = (Math.max(0, Math.min(1, pointer.x / window.innerWidth)) - 0.5) * 8;
      const y = (Math.max(0, Math.min(1, pointer.y / window.innerHeight)) - 0.5) * 6;
      document.body.style.setProperty('--depth-x', `${x.toFixed(2)}px`);
      document.body.style.setProperty('--depth-y', `${y.toFixed(2)}px`);
      document.body.classList.add('has-pointer-depth');
    } else clearDepth();

    if (highlightedCard !== card || !canHighlight) clearHighlight();
    if (canHighlight) {
      highlightedCard = card;
      card.style.setProperty('--halo-x', `${Math.max(0, Math.min(bounds.width, pointer.x - bounds.left)).toFixed(1)}px`);
      card.style.setProperty('--halo-y', `${Math.max(0, Math.min(bounds.height, pointer.y - bounds.top)).toFixed(1)}px`);
    }
  }

  function move(event) {
    if (reduced.matches || !finePointer.matches || (event.pointerType && event.pointerType !== 'mouse')) return;
    pointer = { x: event.clientX, y: event.clientY, target: event.target };
    schedule();
  }

  function refresh() {
    suspend();
    schedule();
  }

  window.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerleave', refresh);
  window.addEventListener('blur', suspend);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', refresh, { passive: true });
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('show.bs.modal', suspend);
  document.addEventListener('hidden.bs.modal', refresh);
  reduced.addEventListener('change', refresh);
  finePointer.addEventListener('change', refresh);

  // Observe navigation only: CSS variable writes must never trigger another frame.
  const navigation = new MutationObserver(refresh);
  [header, navbar, ...sections].forEach(element => navigation.observe(element, { attributes: true, attributeFilter: ['class'] }));
  if ('ResizeObserver' in window) {
    const sizes = new ResizeObserver(schedule);
    sections.forEach(section => sizes.observe(section));
  }
  schedule();
})();
