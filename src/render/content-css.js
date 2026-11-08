/* ================================================
   RÈGLES CSS DÉRIVÉES DU CONTENU — pures, sans DOM
   Remplacent les anciens attributs style="animation-delay: …" (boot) :
   la CSP du site n'autorise aucun style inline.
   Ajoutées à la fin de src/styles/main.css au build (plugin Vite).
   Les valeurs sont des nombres validés par le schéma, re-normalisés ici.
   ================================================ */

import { visibleSorted } from './context.js';

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

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
  return `/* Généré depuis content/*.json (src/render/content-css.js) */\n${rules.join('\n')}\n`;
}
