/* ================================================
   COVERFLOW — géométrie et physique pures (sans DOM)
   Partagées par le moteur client (src/js/modules/certifications.js) et les tests.
   Formules reprises du paint() de kexsio, corrigées :
     - pas de translateX(-50 %) : la carte est centrée par la grille CSS ;
     - opacité latérale plus basse (plaques sur fond sombre) ;
     - fenêtre `win` : au-delà de win + 0,5 la carte s'efface puis est masquée
       (supprime la traversée de l'arrière-plan au bouclage).
   ================================================ */

/** Constantes du moteur (amortissement exponentiel de kexsio). */
export const DAMPING = 8.8;        // pos += (target − pos) × (1 − e^(−8,8·dt))
export const MAX_DT = 0.05;        // dt plafonné (s) : onglet en arrière-plan, gel
export const SETTLE_EPSILON = 5e-4;
export const MOBILE_BREAKPOINT = 680;
/** En dessous de ce nombre de certifications : grille statique, sans contrôles. */
export const CAROUSEL_MIN = 4;
/** Délai de l'autoplay (ms), réarmé à la fin de chaque animation. */
export const AUTOPLAY_DELAY = 4000;

/**
 * Décalage circulaire de la slide `i` par rapport à la position `pos`,
 * dans [−n/2, n/2[ (chemin le plus court sur l'anneau).
 * @param {number} i @param {number} pos @param {number} n
 */
export function wrapOffset(i, pos, n) {
  if (n <= 0) return 0;
  return ((((i - pos + n / 2) % n) + n) % n) - n / 2;
}

/** Index réel (0 … n−1) correspondant à une position non bornée. */
export function wrapIndex(pos, n) {
  if (n <= 0) return 0;
  return ((Math.round(pos) % n) + n) % n;
}

/** Évite « -0 » et les flottants trop longs dans les chaînes CSS. */
const num = v => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};

/**
 * Style d'une slide à un décalage donné.
 * @param {number} offset décalage signé (en nombre de cartes)
 * @param {{ size: number, pitch: number, win: number }} layout
 * @returns {{ transform: string, opacity: number, zIndex: number, hidden: boolean, rotation: number, depth: number }}
 */
export function slideStyle(offset, { size, pitch, win }) {
  const d = Math.abs(offset);
  const c = d ** 0.68;
  const s = Math.sign(offset);
  const rotation = num(-s * Math.min(35 * c, 74));
  const depth = num(-size * 0.4 * c);
  const scale = num(1 - Math.min(d * 0.018, 0.075));
  const fade = Math.min(1, Math.max(0, (win + 0.5 - d) / 0.5));
  return {
    transform: `translateX(${num(offset * pitch)}px) translateZ(${depth}px) rotateY(${rotation}deg) scale(${scale})`,
    opacity: num(fade * Math.max(0.3, 1 - d * 0.18)),
    zIndex: 5000 - Math.round(d * 100),
    hidden: fade === 0,
    rotation,
    depth
  };
}

/**
 * Styles de toutes les slides pour une position donnée (fonction pure).
 * @param {number} pos position réelle non bornée
 * @param {number} n nombre de slides
 * @param {{ size: number, pitch: number, win: number }} layout
 */
export function computeTransforms(pos, n, layout) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(slideStyle(wrapOffset(i, pos, n), layout));
  return out;
}

/**
 * Géométrie selon la largeur du viewport et la largeur mesurée d'une carte.
 * @param {number} viewportWidth @param {number} size largeur de carte (px)
 */
export function layoutFor(viewportWidth, size) {
  const mobile = viewportWidth <= MOBILE_BREAKPOINT;
  return { size, pitch: size * (mobile ? 0.72 : 0.68), win: mobile ? 2 : 3 };
}

/**
 * Un pas d'amortissement exponentiel.
 * @param {number} pos @param {number} target @param {number} dt secondes (plafonné à MAX_DT)
 * @returns {{ pos: number, done: boolean }}
 */
export function dampStep(pos, target, dt) {
  const remaining = target - pos;
  if (Math.abs(remaining) < SETTLE_EPSILON) return { pos: target, done: true };
  const k = 1 - Math.exp(-DAMPING * Math.min(MAX_DT, Math.max(0, dt)));
  const next = pos + remaining * k;
  if (Math.abs(target - next) < SETTLE_EPSILON) return { pos: target, done: true };
  return { pos: next, done: false };
}

/**
 * Cible au relâchement d'un glissement.
 * @param {number} pos0 position au début du geste
 * @param {number} dx déplacement horizontal (px, positif vers la droite)
 * @param {number} pitch écart entre cartes (px)
 * @param {number} velocity vitesse (px/ms, valeur absolue)
 */
export function swipeTarget(pos0, dx, pitch, velocity = 0) {
  const base = Math.round(pos0);
  if (!pitch || (Math.abs(dx) <= 0.25 * pitch && velocity <= 0.4) || dx === 0) return base;
  return base - Math.sign(dx) * Math.max(1, Math.round(Math.abs(dx) / pitch));
}

/**
 * Initiales de repli quand une certification n'a pas de logo :
 * « IBM » → IBM, « Red Team Leaders » → RTL, « United Nations Office on Drugs and Crime » → UNODC.
 * @param {string} org
 */
export function monogram(org) {
  const text = String(org ?? '').trim();
  if (!text) return '?';
  if (!/\s/.test(text) && text.length <= 5) return text.toUpperCase();
  const initials = text.split(/\s+/).map(w => w.match(/^\p{Lu}/u)?.[0]).filter(Boolean).join('');
  return (initials || text[0].toUpperCase()).slice(0, 5);
}
