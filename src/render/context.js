/* ================================================
   CONTEXTE DE RENDU — langue courante + collecte du dictionnaire i18n
   ================================================ */

import { escapeAttr, safeUrl, textToHtml } from './escape.js';

export const LANGS = ['fr', 'en'];

/**
 * Attributs traduisibles via `data-i18n-attr="attr:clé;attr:clé"` (liste blanche
 * partagée avec le client, src/js/modules/i18n.js). Jamais href, src, style ni on*.
 */
export const I18N_ATTRS = Object.freeze(['alt', 'aria-label', 'aria-roledescription', 'aria-description', 'title']);

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
    /**
     * Attributs textuels traduisibles (alt, aria-label…), pré-rendus dans la
     * langue du rendu. Renvoie la chaîne d'attributs complète, précédée d'une espace :
     *   ctx.attrs({ alt: ['certs.x.alt', { fr, en }] })
     *   → ' alt="…" data-i18n-attr="alt:certs.x.alt"'
     * Une valeur invariante produit l'attribut seul, sans data-i18n-attr.
     * @param {Record<string, [string, unknown]>} spec
     */
    attrs(spec) {
      const out = [];
      const i18n = [];
      for (const [name, [key, value]] of Object.entries(spec)) {
        if (!I18N_ATTRS.includes(name)) throw new Error(`Attribut non traduisible : ${name}`);
        if (/[;:\s]/.test(key)) throw new Error(`Clé i18n invalide pour un attribut : ${key}`);
        out.push(` ${name}="${escapeAttr(localize(value, lang))}"`);
        if (isLocalized(value)) {
          register(key, value, '');
          i18n.push(`${name}:${key}`);
        }
      }
      if (i18n.length) out.push(` data-i18n-attr="${escapeAttr(i18n.join(';'))}"`);
      return out.join('');
    },
    /**
     * Comme `attrs`, mais n'écrit QUE `data-i18n-attr` (clés enregistrées dans le
     * dictionnaire) : l'attribut lui-même est posé par le JS, via applyI18nAttrs,
     * quand il n'a de sens qu'en mode amélioré (ex. aria-roledescription, qui
     * exige un role ajouté par le moteur). Valeurs bilingues uniquement.
     * @param {Record<string, [string, unknown]>} spec
     */
    deferredAttrs(spec) {
      const i18n = [];
      for (const [name, [key, value]] of Object.entries(spec)) {
        if (!I18N_ATTRS.includes(name)) throw new Error(`Attribut non traduisible : ${name}`);
        if (/[;:\s]/.test(key)) throw new Error(`Clé i18n invalide pour un attribut : ${key}`);
        if (!isLocalized(value)) throw new Error(`Attribut différé non bilingue : ${name}`);
        register(key, value, '');
        i18n.push(`${name}:${key}`);
      }
      return i18n.length ? ` data-i18n-attr="${escapeAttr(i18n.join(';'))}"` : '';
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
