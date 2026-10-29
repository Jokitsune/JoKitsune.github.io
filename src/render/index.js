/* ================================================
   API DE RENDU — pure, sans DOM, importable depuis Node
   (plugin Vite, tests, futur panneau admin pour la prévisualisation).

     import { renderPage, renderSections, buildDictionary } from './src/render/index.js';
   ================================================ */

import { createContext } from './context.js';
import {
  renderHead, renderBoot, renderNav, renderHero, renderSkills,
  renderProjects, renderFormation, renderContact, renderAudio, renderFooter
} from './sections.js';

export { escapeHtml, escapeAttr, textToHtml, safeUrl } from './escape.js';
export { localize, isLocalized, visibleSorted, createContext } from './context.js';
export * from './sections.js';

/**
 * Renderers associés aux marqueurs `<!--render:nom-->` de index.html.
 * L'ordre d'appel suit l'ordre du document (clés i18n déterministes).
 */
export const SECTION_RENDERERS = {
  head: renderHead,
  boot: renderBoot,
  nav: renderNav,
  hero: renderHero,
  skills: renderSkills,
  projects: renderProjects,
  formation: renderFormation,
  contact: renderContact,
  audio: renderAudio,
  footer: renderFooter
};

/**
 * Rend toutes les sections.
 * @param {object} content contenu validé { site, ui, skills, projects, timeline, cards }
 * @param {'fr'|'en'} [lang] langue du HTML produit (défaut : site.defaultLang)
 * @returns {{ html: Record<string,string>, dictionary: { fr: Record<string,string>, en: Record<string,string> } }}
 */
export function renderSections(content, lang = content.site.defaultLang) {
  const ctx = createContext(lang);
  const html = {};
  for (const [name, render] of Object.entries(SECTION_RENDERERS)) {
    html[name] = render(content, ctx);
  }
  return { html, dictionary: ctx.dictionary };
}

/**
 * Dictionnaire i18n { fr: {clé: texte}, en: {clé: texte} } (texte brut, "\n" = <br>)
 * correspondant aux attributs data-i18n produits par le rendu.
 */
export function buildDictionary(content) {
  return renderSections(content).dictionary;
}

const MARKER = /<!--\s*render:([a-z]+)\s*-->/g;

/**
 * Remplace les marqueurs `<!--render:xxx-->` d'un gabarit HTML par les sections rendues.
 * Lève une erreur si un marqueur est inconnu.
 * @param {string} template contenu de index.html
 * @param {object} content contenu validé
 * @param {'fr'|'en'} [lang]
 */
export function renderPage(template, content, lang = content.site.defaultLang) {
  const { html } = renderSections(content, lang);
  return template
    .replace(MARKER, (_, name) => {
      if (!(name in html)) throw new Error(`Marqueur de rendu inconnu : render:${name}`);
      return html[name];
    })
    .replace(/<html lang="[a-z-]*">/, `<html lang="${lang}">`);
}
