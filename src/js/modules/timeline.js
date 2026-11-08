/* ==========================================
   FRISE « PARCOURS » — rail lié au défilement
   - le rail lit --tl-progress (0 → 1), écrit via le CSSOM (compatible CSP) ;
   - points atteints / entrée active recalculés à chaque frame de défilement,
     écrits seulement s'ils changent ;
   - apparition d'une entrée dès que son haut passe sous 90 % du viewport (sans
     seuil de surface : une entrée plus haute que le viewport, ex. zoom 400 %,
     ou sautée par un lien d'ancre, n'est jamais bloquée invisible) ;
   - écoute du défilement limitée aux abords de la frise (IntersectionObserver) ;
   - mouvement réduit : aucune animation, tout visible (bascule à chaud).
=========================================== */

import { computeProgress, computeStates, READING_LINE } from '../../lib/timeline.js';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
// Ligne d'apparition : 90 % de la hauteur du viewport
const REVEAL_LINE = 0.9;

/**
 * @param {Element|null} [root] conteneur [data-timeline]
 * @param {{ onState?: (s: { reachedCount: number, activeIndex: number }) => void }} [options]
 * @returns {() => void} destroy
 */
export function initTimeline(root = document.querySelector('[data-timeline]'), options = {}) {
  if (!root || typeof IntersectionObserver === 'undefined') return () => {};
  const mql = typeof matchMedia === 'function' ? matchMedia(REDUCE_QUERY) : null;
  let stop = () => {};

  const start = () => {
    stop();
    stop = mql?.matches ? () => {} : enhance(root, options);
  };
  start();
  mql?.addEventListener?.('change', start);

  return () => {
    mql?.removeEventListener?.('change', start);
    stop();
  };
}

function enhance(root, { onState } = {}) {
  const items = [...root.querySelectorAll('.tl-item')];
  const nodes = items.map(li => li.querySelector('.tl-node'));
  let centers = [];
  let state = { reachedCount: -1, activeIndex: -2 };
  let raf = 0;
  let listening = false;

  const reveal = li => li.classList.add('is-visible');

  /* Centres des points relatifs au haut de .tl, hors transformations (entrée encore
     décalée par l'apparition, losange tourné) ; recalculés au redimensionnement */
  const measure = () => {
    centers = nodes.map((n, i) => (n ? items[i].offsetTop + n.offsetTop + n.offsetHeight / 2 : Infinity));
  };

  const applyStates = next => {
    if (next.reachedCount === state.reachedCount && next.activeIndex === state.activeIndex) return;
    items.forEach((li, i) => {
      li.classList.toggle('is-reached', i < next.reachedCount);
      li.classList.toggle('is-active', i === next.activeIndex);
    });
    state = next;
    onState?.(next);
  };

  const frame = () => {
    raf = 0;
    const rect = root.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = computeProgress(rect.top, rect.height, vh, READING_LINE);
    root.style.setProperty('--tl-progress', p.toFixed(4));
    applyStates(computeStates(p * rect.height, centers));
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const attach = on => {
    if (on === listening) return;
    listening = on;
    if (on) {
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
      schedule();
    } else {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    }
  };

  /* Apparition : une entrée est révélée dès que son haut passe sous 90 % du viewport,
     y compris lorsqu'elle a été sautée (lien vers #contact) ; aucun seuil de surface,
     donc une entrée plus haute que le viewport (zoom 400 %) n'est jamais bloquée. */
  let pending = items.slice();
  let revealRaf = 0;
  const revealCheck = () => {
    revealRaf = 0;
    const limit = window.innerHeight * REVEAL_LINE;
    pending = pending.filter(li => {
      if (li.getBoundingClientRect().top >= limit) return true;
      reveal(li);
      return false;
    });
    if (!pending.length) {
      window.removeEventListener('scroll', scheduleReveal);
      window.removeEventListener('resize', scheduleReveal);
    }
  };
  function scheduleReveal() {
    if (!revealRaf) revealRaf = requestAnimationFrame(revealCheck);
  }

  /* N'écoute le défilement que lorsque la frise est proche du viewport */
  const gate = new IntersectionObserver(entries => {
    const entry = entries[entries.length - 1];
    attach(entry.isIntersecting);
  }, { threshold: 0, rootMargin: '100px 0px' });

  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { measure(); schedule(); })
    : null;

  const onLangChange = () => { measure(); schedule(); };

  // Initialisation sans clignotement : entrées déjà à l'écran (ou au-dessus) visibles d'emblée
  root.classList.add('tl--instant');
  const vh = window.innerHeight;
  pending = items.filter(li => {
    if (li.getBoundingClientRect().top >= vh) return true;
    reveal(li);
    return false;
  });
  if (pending.length) {
    window.addEventListener('scroll', scheduleReveal, { passive: true });
    window.addEventListener('resize', scheduleReveal, { passive: true });
  }
  root.style.setProperty('--tl-progress', '0');
  root.classList.add('is-enhanced');
  measure();
  frame();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('tl--instant')));

  gate.observe(root);
  resizeObserver?.observe(root);
  document.addEventListener('i18n:change', onLangChange);

  return function destroy() {
    attach(false);
    if (raf) cancelAnimationFrame(raf);
    if (revealRaf) cancelAnimationFrame(revealRaf);
    raf = 0;
    revealRaf = 0;
    window.removeEventListener('scroll', scheduleReveal);
    window.removeEventListener('resize', scheduleReveal);
    gate.disconnect();
    resizeObserver?.disconnect();
    document.removeEventListener('i18n:change', onLangChange);
    root.classList.remove('is-enhanced', 'tl--instant');
    root.style.removeProperty('--tl-progress');
    for (const li of items) li.classList.remove('is-visible', 'is-reached', 'is-active');
  };
}
