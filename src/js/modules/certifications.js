/* ==========================================
   CERTIFICATIONS — coverflow 3D à logos
   - géométrie et physique pures dans src/lib/coverflow.js (testées en unitaire) ;
   - écritures de style UNIQUEMENT via le CSSOM (el.style.*) : compatible CSP ;
   - amélioration progressive : sans JS (ou < 4 certifications), grille statique ;
     le JS pose .cc--enhanced, les rôles ARIA, puis révèle les contrôles ;
   - autoplay pausable (WCAG 2.2.2) : bouton dédié, retenu au survol, au focus,
     hors écran et onglet masqué ; désactivé au démarrage en mouvement réduit ;
     arrêté définitivement au premier geste manuel ; aria-live « off » pendant
     la rotation automatique, « polite » sinon ;
   - clavier sur les contrôles (← → Origine Fin), focus conservé quand la slide
     qui le contenait sort ; swipe par pointer events (touch-action: pan-y) ;
     molette horizontale seulement, sur la scène (jamais sur window).
=========================================== */

import {
  computeTransforms, wrapOffset, wrapIndex, layoutFor, dampStep, swipeTarget,
  AUTOPLAY_DELAY, CAROUSEL_MIN
} from '../../lib/coverflow.js';
import { applyI18nAttrs } from './i18n.js';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
const DRAG_START = 8;        // px avant de décider horizontal / vertical
const WHEEL_STEP = 16;       // cumul de deltaX avant un pas
const WHEEL_LOCK = 240;      // ms sans événement avant de pouvoir refaire un pas
const VISIBLE_RATIO = 0.4;   // part visible requise pour l'autoplay

/**
 * @param {Element|null} [root] conteneur [data-cc]
 * @param {{ autoplayDelay?: number }} [options]
 * @returns {() => void} destroy
 */
export function initCertCarousel(root = document.querySelector('[data-cc]'), options = {}) {
  if (!root) return () => {};
  const slides = [...root.querySelectorAll('[data-cc-slide]')];
  const n = slides.length;
  const stage = root.querySelector('.cc-stage');
  const track = root.querySelector('.cc-track');
  const controls = root.querySelector('.cc-controls');
  if (n < CAROUSEL_MIN || !stage || !track || !controls) return () => {};

  const delay = options.autoplayDelay ?? AUTOPLAY_DELAY;
  const cards = slides.map(s => s.querySelector('.cc-card'));
  const dots = [...controls.querySelectorAll('[data-cc-dot]')];
  const prevBtn = controls.querySelector('[data-cc-prev]');
  const nextBtn = controls.querySelector('[data-cc-next]');
  const toggleBtn = controls.querySelector('[data-cc-toggle]');
  const glyph = toggleBtn?.querySelector('.cc-glyph');
  const pauseLabel = toggleBtn?.querySelector('[data-cc-label="pause"]');
  const playLabel = toggleBtn?.querySelector('[data-cc-label="play"]');
  const counter = controls.querySelector('[data-cc-current]');
  const status = root.querySelector('.cc-status');
  const mql = typeof matchMedia === 'function' ? matchMedia(REDUCE_QUERY) : null;

  let reduce = !!mql?.matches;
  let pos = 0;
  let target = 0;
  let current = -1;
  let announced = 0;
  let layout = { size: 220, pitch: 150, win: 3 };
  let raf = 0;
  let lastTime = 0;
  let timer = 0;
  let userPlaying = !reduce;
  let drag = null;            // geste de glisser en cours
  const holds = new Set(['offscreen']);
  if (document.hidden) holds.add('hidden');
  const listeners = [];

  const on = (target_, type, fn, opts) => {
    target_.addEventListener(type, fn, opts);
    listeners.push(() => target_.removeEventListener(type, fn, opts));
  };
  const pad2 = v => String(v).padStart(2, '0');

  /* ---------- Rendu ---------- */
  function measure() {
    const size = cards[Math.max(0, current)]?.offsetWidth || layout.size;
    layout = layoutFor(window.innerWidth, size);
  }

  function paint() {
    computeTransforms(pos, n, layout).forEach((st, i) => {
      const s = cards[i].style;
      s.transform = st.transform;
      s.opacity = String(st.opacity);
      s.zIndex = String(st.zIndex);
      s.visibility = st.hidden ? 'hidden' : '';
    });
  }

  /** Applique tout de suite l'index courant (classes, ARIA, points, compteur, focus). */
  function setCurrent(index) {
    if (index === current) return;
    const active = document.activeElement;
    const focusInOutgoing = current >= 0 && active && slides[current].contains(active);
    const focusOnDot = active && dots.includes(active);
    current = index;
    slides.forEach((li, i) => {
      const isCurrent = i === index;
      li.classList.toggle('is-current', isCurrent);
      if (isCurrent) li.removeAttribute('aria-hidden');
      else li.setAttribute('aria-hidden', 'true');
    });
    dots.forEach((dot, i) => {
      if (i === index) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
      dot.tabIndex = i === index ? 0 : -1;   // focus mobile : un seul arrêt de tabulation
    });
    if (counter) counter.textContent = pad2(index + 1);
    // Le focus ne doit jamais tomber sur <body> quand sa slide devient masquée
    if (focusInOutgoing) (slides[index].querySelector('.cc-verify') || nextBtn)?.focus({ preventScroll: true });
    else if (focusOnDot) dots[index]?.focus({ preventScroll: true });
  }

  /** Fin d'animation : message pour les lecteurs d'écran, puis réarmement de l'autoplay. */
  function settle() {
    if (status && current !== announced) {
      const li = slides[current];
      const parts = [
        li.getAttribute('aria-label'),
        li.querySelector('.cc-title')?.textContent,
        li.querySelector('.cc-org')?.textContent
      ].map(t => (t || '').trim()).filter(Boolean);
      status.textContent = parts.join(' — ');
      announced = current;
    }
    schedule();
  }

  /* ---------- Animation ---------- */
  function stopAnimation() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastTime = 0;
  }

  function frame(time) {
    const dt = lastTime ? (time - lastTime) / 1000 : 1 / 60;
    lastTime = time;
    const step = dampStep(pos, target, dt);
    pos = step.pos;
    paint();
    if (step.done) {
      raf = 0;
      lastTime = 0;
      settle();
    } else {
      raf = requestAnimationFrame(frame);
    }
  }

  function animate() {
    clearTimer();
    if (reduce) {
      stopAnimation();
      pos = target;
      paint();
      settle();
      return;
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }

  /* ---------- Navigation ---------- */
  function go(delta, manual = true) {
    if (manual) stopUserPlay();
    target = Math.round(target) + delta;
    setCurrent(wrapIndex(target, n));
    animate();
  }
  function goTo(index, manual = true) {
    go(Math.round(wrapOffset(index, target, n)), manual);
  }

  /* ---------- Autoplay ---------- */
  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = 0;
  }
  function schedule() {
    clearTimer();
    if (userPlaying && holds.size === 0 && !raf && !drag?.active) {
      timer = setTimeout(() => {
        timer = 0;
        go(1, false);
      }, delay);
    }
  }
  function syncToggle() {
    if (pauseLabel) pauseLabel.hidden = !userPlaying;
    if (playLabel) playLabel.hidden = userPlaying;
    glyph?.classList.toggle('cc-glyph--pause', userPlaying);
    glyph?.classList.toggle('cc-glyph--play', !userPlaying);
    status?.setAttribute('aria-live', userPlaying ? 'off' : 'polite');
  }
  function stopUserPlay() {
    if (!userPlaying) return;
    userPlaying = false;
    syncToggle();
    clearTimer();
  }
  function hold(name, active) {
    if (active) holds.add(name);
    else holds.delete(name);
    if (holds.size) clearTimer();
    else if (!timer) schedule();
  }

  /* ---------- Entrées : contrôles ---------- */
  on(prevBtn, 'click', () => go(-1));
  on(nextBtn, 'click', () => go(1));
  dots.forEach((dot, i) => on(dot, 'click', () => goTo(i)));
  if (toggleBtn) {
    on(toggleBtn, 'click', () => {
      userPlaying = !userPlaying;
      syncToggle();
      schedule();
    });
  }
  on(controls, 'keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const actions = {
      ArrowLeft: () => go(-1),
      ArrowRight: () => go(1),
      Home: () => goTo(0),
      End: () => goTo(n - 1)
    };
    const action = actions[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  });

  /* ---------- Entrées : clic sur une carte latérale ---------- */
  let suppressClick = false;
  cards.forEach((card, i) => on(card, 'click', () => {
    if (suppressClick || i === current) return;
    goTo(i);
  }));

  /* ---------- Entrées : glisser / swipe (pointer events) ---------- */
  on(stage, 'pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest?.('a, button')) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pos0: pos, active: false, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  });
  on(stage, 'pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < DRAG_START) return;
      if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; }  // défilement vertical : on laisse la page
      drag.active = true;
      try { stage.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      stopAnimation();
      stopUserPlay();
      clearTimer();
      drag.pos0 = pos;
      drag.x0 = e.clientX;
    }
    const ddx = e.clientX - drag.x0;
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.v = Math.abs(e.clientX - drag.lastX) / dt;
    drag.lastX = e.clientX;
    drag.lastT = e.timeStamp;
    drag.dx = ddx;
    pos = drag.pos0 - ddx / layout.pitch;   // suivi du doigt (manipulation directe, gardée en mouvement réduit)
    paint();
    setCurrent(wrapIndex(pos, n));
  });
  const endDrag = cancelled => e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.active) return;
    try { stage.releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ }
    target = cancelled ? Math.round(pos) : swipeTarget(d.pos0, d.dx || 0, layout.pitch, d.v);
    setCurrent(wrapIndex(target, n));
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    animate();
  };
  on(stage, 'pointerup', endDrag(false));
  on(stage, 'pointercancel', endDrag(true));

  /* ---------- Entrées : molette horizontale (trackpad, Maj + molette) ---------- */
  let wheelSum = 0;
  let wheelLocked = false;
  let wheelTimer = 0;
  on(stage, 'wheel', e => {
    // Geste vertical : on ne fait rien, la page défile normalement
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const horizontal = e.deltaX;
    e.preventDefault();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelSum = 0; wheelLocked = false; }, WHEEL_LOCK);
    if (wheelLocked) return;
    wheelSum += horizontal;
    if (Math.abs(wheelSum) < WHEEL_STEP) return;
    wheelLocked = true;
    const dir = wheelSum > 0 ? 1 : -1;
    wheelSum = 0;
    go(dir);
  }, { passive: false });

  /* ---------- Retenues de l'autoplay ---------- */
  on(root, 'pointerenter', e => { if (e.pointerType === 'mouse') hold('hover', true); });
  on(root, 'pointerleave', e => { if (e.pointerType === 'mouse') hold('hover', false); });
  // Le bouton de rotation n'est pas une retenue : sinon « Lancer » n'aurait aucun effet visible
  on(root, 'focusin', e => hold('focus', e.target !== toggleBtn));
  on(root, 'focusout', e => { if (!root.contains(e.relatedTarget)) hold('focus', false); });
  on(document, 'visibilitychange', () => hold('hidden', document.hidden));

  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      const visible = entry.isIntersecting && (
        entry.intersectionRatio >= VISIBLE_RATIO ||
        entry.intersectionRect.height >= window.innerHeight * 0.5
      );
      hold('offscreen', !visible);
    }, { threshold: [0, 0.2, VISIBLE_RATIO, 0.6, 1] })
    : null;
  if (!io) holds.delete('offscreen');

  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { measure(); paint(); })
    : null;

  const onReduceChange = () => {
    reduce = !!mql?.matches;
    if (reduce) {
      stopUserPlay();
      if (raf) { stopAnimation(); pos = target; paint(); settle(); }
    }
  };
  mql?.addEventListener?.('change', onReduceChange);

  /* ---------- Activation ---------- */
  const sectionLabel = root.closest('section')?.getAttribute('aria-labelledby');
  root.classList.add('cc--enhanced');
  root.setAttribute('role', 'group');
  if (sectionLabel) root.setAttribute('aria-labelledby', sectionLabel);
  track.setAttribute('role', 'presentation');
  for (const li of slides) li.setAttribute('role', 'group');
  applyI18nAttrs(root);  // aria-roledescription / aria-label des slides (clés pré-rendues)
  controls.hidden = false;
  setCurrent(0);
  measure();
  paint();
  syncToggle();
  io?.observe(root);
  ro?.observe(stage);
  if (!io) schedule();

  return function destroy() {
    stopAnimation();
    clearTimer();
    clearTimeout(wheelTimer);
    for (const off of listeners) off();
    mql?.removeEventListener?.('change', onReduceChange);
    io?.disconnect();
    ro?.disconnect();
    root.classList.remove('cc--enhanced');
    for (const name of ['role', 'aria-labelledby', 'aria-roledescription']) root.removeAttribute(name);
    track.setAttribute('role', 'list');
    slides.forEach((li, i) => {
      li.classList.remove('is-current');
      for (const name of ['role', 'aria-hidden', 'aria-roledescription', 'aria-label']) li.removeAttribute(name);
      const s = cards[i].style;
      s.transform = s.opacity = s.zIndex = s.visibility = '';
    });
    for (const dot of dots) {
      dot.removeAttribute('aria-current');
      dot.removeAttribute('tabindex');
    }
    controls.hidden = true;
    if (status) {
      status.textContent = '';
      status.setAttribute('aria-live', 'polite');
    }
  };
}
