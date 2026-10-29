/* ================================================
   CONTEXTE DE RENDU — langue courante + collecte du dictionnaire i18n
   ================================================ */

import { escapeAttr, safeUrl, textToHtml } from './escape.js';

export const LANGS = ['fr', 'en'];

/** Vrai si la valeur est un texte bilingue { fr, en }. */
export function isLocalized(value) {
  return value !== null && typeof value === 'object' && 'fr' in value && 'en' in value;
}

/** Résout un texte (invariant ou { fr, en }) dans la langue demandée. */
export function localize(value, lang) {
  if (isLocalized(value)) return value[lang] ?? value.fr;
  return value ?? '';
}

/** Trie par `order` et retire les éléments masqués (`visible: false`). */
export function visibleSorted(list = []) {
  return list
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.visible !== false)
    .sort((a, b) => (a.item.order ?? 0) - (b.item.order ?? 0) || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * Crée un contexte de rendu.
 * - `ctx.t(key, value, opts)` renvoie `{ attr, html }` :
 *     attr = ' data-i18n="key"' si la valeur est bilingue (sinon ''),
 *     html = texte échappé dans la langue du rendu.
 * - `ctx.ph(key, value)` idem pour un placeholder (attribut data-i18n-placeholder).
 * - `ctx.dictionary` accumule { fr: {clé: texte}, en: {clé: texte} } (texte brut).
 * @param {'fr'|'en'} lang
 */
export function createContext(lang) {
  const dictionary = Object.fromEntries(LANGS.map(l => [l, {}]));

  function register(key, value, prefix) {
    for (const l of LANGS) {
      if (key in dictionary[l] && dictionary[l][key] !== prefix + localize(value, l)) {
        throw new Error(`Clé i18n en conflit : ${key}`);
      }
      dictionary[l][key] = prefix + localize(value, l);
    }
  }

  return {
    lang,
    dictionary,
    /** @param {string} key @param {unknown} value @param {{ prefix?: string }} [opts] */
    t(key, value, { prefix = '' } = {}) {
      const text = prefix + localize(value, lang);
      if (!isLocalized(value)) return { attr: '', html: textToHtml(text) };
      register(key, value, prefix);
      return { attr: ` data-i18n="${escapeAttr(key)}"`, html: textToHtml(text) };
    },
    /** Placeholder de champ de formulaire. */
    ph(key, value) {
      const text = localize(value, lang);
      if (!isLocalized(value)) return { attr: '', value: escapeAttr(text) };
      register(key, value, '');
      return { attr: ` data-i18n-placeholder="${escapeAttr(key)}"`, value: escapeAttr(text) };
    },
    /**
     * Lien traduisible : href (sûr, échappé) dans la langue du rendu + attribut
     * data-i18n-href pour la bascule FR/EN côté client (revalidée par safeUrl).
     */
    href(key, value) {
      const url = escapeAttr(safeUrl(localize(value, lang)));
      if (!isLocalized(value)) return { attr: '', value: url };
      register(key, value, '');
      return { attr: ` data-i18n-href="${escapeAttr(key)}"`, value: url };
    },
    /** Texte non traduit dynamiquement, échappé pour un attribut (méta…) */
    plain(value) {
      return escapeAttr(localize(value, lang));
    },
    /** Texte brut (non échappé) dans la langue du rendu — à échapper par l'appelant. */
    plainText(value) {
      return localize(value, lang);
    }
  };
}
