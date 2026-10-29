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

/** Retourne l'URL si son schéma est autorisé, sinon "#". */
export function safeUrl(url) {
  const s = String(url ?? '').trim();
  return SAFE_URL.test(s) ? s : '#';
}
