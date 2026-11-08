/* ==========================================
   INTERNATIONALISATION (FR / EN)
   Le dictionnaire { fr: { clé: texte }, en: { clé: texte } } est fourni par l'appelant.
   Les valeurs sont du TEXTE BRUT (jamais du HTML) : elles sont insérées via
   des nœuds texte, seuls les "\n" deviennent des éléments <br> créés par le DOM.
   Aucun innerHTML ici : le contenu étant éditable depuis l'admin, cela
   empêche tout XSS stocké.
=========================================== */

import { safeUrl } from '../../render/escape.js';
import { I18N_ATTRS } from '../../render/context.js';

const STORAGE_KEY = 'portfolio_lang';

/** Événement émis sur `document` après chaque changement de langue ({ detail: { lang } }). */
export const I18N_CHANGE_EVENT = 'i18n:change';

let dictionary = { fr: {}, en: {} };
let fallbackLang = 'fr';
let currentLang = 'fr';

/** Langue actuellement appliquée. */
export function getLanguage() {
  return currentLang;
}

/** Texte brut traduit dans la langue courante (undefined si la clé est absente). */
export function translate(key) {
  return dictionary[currentLang]?.[key];
}

/**
 * Lit `data-i18n-attr="attr:clé;attr:clé"`. Seuls les attributs de la liste
 * blanche I18N_ATTRS sont retenus (jamais href, src, style ni on*).
 * @param {string|null} spec
 * @returns {[string, string][]}
 */
export function parseI18nAttr(spec) {
  if (!spec) return [];
  return String(spec).split(';').flatMap(part => {
    const i = part.indexOf(':');
    if (i <= 0) return [];
    const name = part.slice(0, i).trim().toLowerCase();
    const key = part.slice(i + 1).trim();
    return key && I18N_ATTRS.includes(name) ? [[name, key]] : [];
  });
}

/**
 * Applique les attributs traduits (data-i18n-attr) sous `root` (et sur `root`
 * lui-même), dans la langue courante. À rappeler après l'insertion de nœuds.
 * @param {ParentNode} [root]
 */
export function applyI18nAttrs(root = document) {
  const strings = dictionary[currentLang];
  if (!strings) return;
  const els = [...root.querySelectorAll('[data-i18n-attr]')];
  if (root.nodeType === 1 && root.hasAttribute('data-i18n-attr')) els.unshift(root);
  for (const el of els) {
    for (const [name, key] of parseI18nAttr(el.getAttribute('data-i18n-attr'))) {
      if (strings[key] !== undefined) el.setAttribute(name, strings[key]);
    }
  }
}

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
  currentLang = lang;
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

  // Attributs textuels traduits (alt, aria-label…) : liste blanche
  applyI18nAttrs(document);

  // Mise à jour de l'état actif sur les boutons de switch
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });

  document.dispatchEvent(new CustomEvent(I18N_CHANGE_EVENT, { detail: { lang } }));
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
