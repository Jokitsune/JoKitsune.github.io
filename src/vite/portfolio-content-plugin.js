/* ================================================
   PLUGIN VITE — pré-rendu du contenu au build (SEO) + module virtuel i18n
   - transformIndexHtml : remplace les marqueurs <!--render:xxx--> de index.html
     par le HTML rendu depuis content/*.json (langue par défaut : site.defaultLang)
   - `virtual:portfolio-content` : expose au client le dictionnaire i18n généré
     depuis les MÊMES JSON + la configuration utile (formspreeId, statuts…)
   - en dev : rechargement complet à chaque modification de content/
   ================================================ */

import path from 'node:path';
import { CONTENT_DIR, loadContent } from '../lib/content.js';
import { renderPage, buildDictionary } from '../render/index.js';
import { renderContentCss } from '../render/content-css.js';

const VIRTUAL_ID = 'virtual:portfolio-content';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/** Données exposées au code client (aucun HTML : uniquement du texte et de la config). */
export function clientPayload(content) {
  return {
    defaultLang: content.site.defaultLang,
    formspreeId: content.site.formspreeId,
    formStatus: content.ui.form.status,
    audioVolume: content.site.audio.volume,
    dictionary: buildDictionary(content)
  };
}

const MAIN_CSS_RE = /[\\/]src[\\/]styles[\\/]main\.css$/;

/**
 * Règles CSS dérivées du contenu (délais du boot, progression des cartes),
 * ajoutées à la FIN de src/styles/main.css avant son traitement par Vite :
 * elles partagent le bundle CSS principal (même chargement qu'avant, rendu
 * identique) et remplacent les anciens style="…" interdits par la CSP.
 * @returns {import('vite').Plugin}
 */
function contentStylesheet(contentDir) {
  return {
    name: 'portfolio-content-css',
    enforce: 'pre',
    async transform(code, id) {
      if (!MAIN_CSS_RE.test(id.split('?')[0])) return null;
      return { code: `${code}\n${renderContentCss(await loadContent(contentDir))}`, map: null };
    }
  };
}

/**
 * @param {{ contentDir?: string }} [options]
 * @returns {import('vite').Plugin[]}
 */
export function portfolioContent({ contentDir = CONTENT_DIR } = {}) {
  return [portfolioContentHtml({ contentDir }), contentStylesheet(contentDir)];
}

/**
 * @param {{ contentDir: string }} options
 * @returns {import('vite').Plugin}
 */
function portfolioContentHtml({ contentDir }) {
  const isContentFile = file => path.resolve(file).startsWith(path.resolve(contentDir)) && file.endsWith('.json');

  return {
    name: 'portfolio-content',

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    async load(id) {
      if (id !== RESOLVED_ID) return;
      const content = await loadContent(contentDir);
      return `export default ${JSON.stringify(clientPayload(content))};`;
    },

    transformIndexHtml: {
      order: 'pre',
      async handler(html, ctx) {
        // Seule la page d'accueil est pré-rendue (pas le panneau /admin)
        if (ctx?.path && ctx.path !== '/index.html') return html;
        const content = await loadContent(contentDir);
        return renderPage(html, content);
      }
    },

    configureServer(server) {
      server.watcher.add(contentDir);
      const reload = file => {
        if (!isContentFile(file)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        // La feuille principale embarque des règles dérivées du contenu
        for (const m of server.moduleGraph.idToModuleMap.values()) {
          if (m.file && MAIN_CSS_RE.test(m.file)) server.moduleGraph.invalidateModule(m);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('change', reload);
      server.watcher.on('add', reload);
    }
  };
}
