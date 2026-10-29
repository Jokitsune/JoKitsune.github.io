/* ==========================================
   INTERNATIONALISATION (FR / EN)
   Le dictionnaire { fr: { clé: texte }, en: { clé: texte } } est fourni par l'appelant.
   Les valeurs sont du TEXTE BRUT (jamais du HTML) : elles sont insérées via
   des nœuds texte, seuls les "\n" deviennent des éléments <br> créés par le DOM.
   Aucun innerHTML ici : le contenu étant éditable depuis l'admin, cela
   empêche tout XSS stocké.
=========================================== */

import { safeUrl } from '../../render/escape.js';

const STORAGE_KEY = 'portfolio_lang';

let dictionary = { fr: {}, en: {} };
let fallbackLang = 'fr';

/**
 * Remplace le contenu d'un élément par du texte brut ; chaque "\n" devient un <br>.
 * @param {Element} el
 * @param {string} text
 */
export function setMultilineText(el, text) {
  const doc = el.ownerDocument;
  const parts = String(text).split('\n');
  const nodes = [];
  parts.forEach((part, i) => {
    if (i > 0) nodes.push(doc.createElement('br'));
    nodes.push(doc.createTextNode(part));
  });
  el.replaceChildren(...nodes);
}

export function setLanguage(lang) {
  if (!dictionary[lang]) lang = fallbackLang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;

  const strings = dictionary[lang];

  // Traduction des textes avec data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (strings && strings[key] !== undefined) {
      setMultilineText(el, strings[key]);
    }
  });

  // Traduction des placeholders avec data-i18n-placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (strings && strings[key] !== undefined) {
      el.placeholder = strings[key];
    }
  });

  // Liens traduits (ex. CV FR / EN) : URL revalidée côté client (liste blanche)
  document.querySelectorAll('[data-i18n-href]').forEach(el => {
    const key = el.getAttribute('data-i18n-href');
    if (strings && strings[key] !== undefined) {
      el.setAttribute('href', safeUrl(strings[key]));
    }
  });

  // Mise à jour de l'état actif sur les boutons de switch
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });
}

/**
 * Initialise l'i18n : préférence utilisateur > langue du navigateur > langue par défaut.
 * @param {{ fr: Record<string,string>, en: Record<string,string> }} dict
 * @param {{ defaultLang?: string }} [options]
 */
export function initI18n(dict, options = {}) {
  dictionary = dict;
  fallbackLang = options.defaultLang || 'fr';

  const savedLang = localStorage.getItem(STORAGE_KEY);
  const browserLang = (navigator.language || navigator.userLanguage || fallbackLang).toLowerCase();
  const initialLang = savedLang ? savedLang : (browserLang.startsWith('en') ? 'en' : fallbackLang);
  setLanguage(initialLang);

  // Écouteur sur les boutons de changement de langue
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetLang = btn.getAttribute('data-lang');
      setLanguage(targetLang);
    });
  });
}
