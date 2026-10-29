/* ================================================
   ÉCHAPPEMENT HTML — fonctions pures (sans DOM)
   Tout texte issu du contenu passe par ces fonctions : aucun HTML du contenu
   n'est jamais interprété. Seul "\n" est converti en <br>.
   ================================================ */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/** Échappe une chaîne pour un nœud texte ou une valeur d'attribut entre guillemets. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/** Alias explicite pour les valeurs d'attributs. */
export const escapeAttr = escapeHtml;

/** Texte -> HTML : échappement complet puis "\n" -> <br>. */
export function textToHtml(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

// Mêmes règles que urlSchema (défense en profondeur si le contenu n'a pas été validé)
const SAFE_URL = /^(https?:\/\/|mailto:|tel:|#|(?![A-Za-z][A-Za-z0-9+.-]*:))/;
// Contrôles C0, espace, DEL et C1 : les navigateurs les ignorent dans un schéma
// (« java\tscript: » == « javascript: ») ; on les retire avant de tester.
// eslint-disable-next-line no-control-regex
const IGNORED_BY_URL_PARSER = /[\u0000- \u007F-\u009F]/g;
const BASE = 'https://origin.invalid';

/**
 * Retourne l'URL si elle est sûre, sinon "#".
 * Liste blanche : http(s), mailto:, tel:, #ancre, chemin relatif restant sur la même origine.
 */
export function safeUrl(url) {
  const s = String(url ?? '').trim();
  const probe = s.replace(IGNORED_BY_URL_PARSER, '');
  if (!probe || probe.includes('\\') || probe.startsWith('//')) return '#';
  if (!SAFE_URL.test(probe)) return '#';
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(probe)) {
    try {
      if (new URL(probe, BASE).origin !== BASE) return '#';
    } catch {
      return '#';
    }
  }
  return s;
}
