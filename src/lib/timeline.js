/* ================================================
   FRISE « PARCOURS » — logique pure (sans DOM), partagée par le rendu
   au build, le contrôleur client et les tests.
   ================================================ */

/** Entrée en cours : pas de date de fin. */
export function isOngoing(item) {
  return item?.end === undefined;
}

/**
 * Ordre d'affichage : visibles uniquement, puis début décroissant, entrées
 * en cours d'abord, fin décroissante, `order` croissant, index d'origine.
 * Les mois AAAA-MM se comparent comme des chaînes (longueur fixe).
 */
export function sortTimeline(items = []) {
  const cmpDesc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.visible !== false)
    .sort((a, b) => {
      const x = a.item;
      const y = b.item;
      return cmpDesc(x.start, y.start)
        || Number(isOngoing(y)) - Number(isOngoing(x))
        || (isOngoing(x) ? 0 : cmpDesc(x.end, y.end))
        || (x.order ?? 0) - (y.order ?? 0)
        || a.index - b.index;
    })
    .map(({ item }) => item);
}

/** « 2024-06 » → « 06/2024 » (format visible, neutre en langue). */
export function formatMonth(month) {
  const [y, m] = String(month).split('-');
  return `${m}/${y}`;
}

/** « 2024-06 » → « juin 2024 » / « June 2024 » (texte lu par les lecteurs d'écran). */
export function formatMonthLong(month, lang) {
  const [y, m] = String(month).split('-').map(Number);
  return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

/**
 * Période en toutes lettres, par langue : { fr: 'juin 2024 à aujourd’hui', en: 'June 2024 to present' }.
 * @param {{ start: string, end?: string }} item
 * @param {{ present: string|{fr:string,en:string}, to: string|{fr:string,en:string} }} labels ui.timeline
 * @param {readonly string[]} langs
 */
export function periodText(item, labels, langs = ['fr', 'en']) {
  const pick = (v, l) => (v && typeof v === 'object' ? v[l] ?? v.fr : v);
  return Object.fromEntries(langs.map(l => {
    const end = isOngoing(item) ? pick(labels.present, l) : formatMonthLong(item.end, l);
    return [l, `${formatMonthLong(item.start, l)} ${pick(labels.to, l)} ${end}`];
  }));
}

/* -------- Géométrie du défilement (contrôleur client) -------- */

/** Position de la ligne de lecture, en fraction de la hauteur du viewport. */
export const READING_LINE = 0.5;

/**
 * Progression de la frise dans [0, 1] : 0 quand le haut de la liste croise
 * la ligne de lecture, 1 quand son bas la croise.
 */
export function computeProgress(top, height, viewportH, ratio = READING_LINE) {
  if (!(height > 0)) return 1;
  const p = (viewportH * ratio - top) / height;
  return Math.min(1, Math.max(0, p));
}

/**
 * États des points : un point est atteint quand la tête du rail est au niveau
 * de son centre ou au-delà (égalité comprise). L'entrée active est la dernière atteinte.
 * @param {number} headY position de la tête (même repère que les centres)
 * @param {number[]} nodeCenters centres des points, croissants
 */
export function computeStates(headY, nodeCenters) {
  let reachedCount = 0;
  for (const c of nodeCenters) {
    if (headY >= c) reachedCount += 1;
    else break;
  }
  return { reachedCount, activeIndex: reachedCount - 1 };
}
