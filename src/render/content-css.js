/* ================================================
   RÈGLES CSS DÉRIVÉES DU CONTENU — pures, sans DOM
   Remplacent les anciens attributs style="animation-delay: …" (boot) et
   style="--fill: …%" (cartes) : la CSP du site n'autorise aucun style inline.
   Ajoutées à la fin de src/styles/main.css au build (plugin Vite).
   Les valeurs sont des nombres validés par le schéma, re-normalisés ici.
   ================================================ */

import { visibleSorted } from './context.js';

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Valeur de progression telle qu'écrite dans data-fill (même calcul que le rendu). */
export function fillValue(percent) {
  return Math.min(100, Math.max(0, num(percent)));
}

/**
 * @param {object} content contenu validé
 * @returns {string} CSS
 */
export function renderContentCss(content) {
  const rules = [];
  const delays = new Set(visibleSorted(content.ui.boot.lines).map(l => num(l.delay)));
  for (const d of [...delays].sort((a, b) => a - b)) {
    rules.push(`.boot-line[data-boot-delay="${d}"] { animation-delay: ${d}s; }`);
  }
  const fills = new Set(visibleSorted(content.cards.cards).map(c => fillValue(c.progress.percent)));
  for (const f of [...fills].sort((a, b) => a - b)) {
    rules.push(`.progress-bar-fill[data-fill="${f}"] { --fill: ${f}%; }`);
  }
  return `/* Généré depuis content/*.json (src/render/content-css.js) */\n${rules.join('\n')}\n`;
}
