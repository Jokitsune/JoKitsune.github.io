# Portfolio — Jordan de SOUZA

Portfolio cybersécurité & DevSecOps : <https://jokitsune.github.io>

Site statique construit avec [Vite](https://vite.dev) (JavaScript vanilla, sans framework UI).
Tout le contenu (FR/EN) vit dans `content/*.json` ; il est **pré-rendu au build** dans le HTML
(en français par défaut, pour le SEO) et le JavaScript client ne fait que basculer la langue.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm install` | Installe les dépendances (Node ≥ 20.19) |
| `npm run dev` | Serveur de développement (rechargement automatique, y compris sur `content/`) |
| `npm run build` | Build de production dans `dist/` (échoue si le contenu est invalide) |
| `npm run preview` | Sert `dist/` localement |
| `npm run lint` | ESLint (flat config, `eslint.config.js`) |
| `npm test` | Tests unitaires Vitest (schéma, rendu, i18n, XSS) |
| `npm run validate:content` | Valide `content/*.json` (`-- --write-schemas` régénère `content/schema/`) |
| `npm run test:e2e` | Tests Playwright desktop + mobile sur le build (`npx playwright install chromium` la première fois) |
| `npm run compare -- <réf> <candidat>` | Diff DOM + pixel entre deux versions (URL ou dossier), FR/EN, desktop/mobile |

## Architecture

```text
index.html                     Gabarit : marqueurs <!--render:xxx--> remplacés au build
content/                       CONTENU ÉDITABLE (seul endroit à modifier pour les textes)
  site.json                    méta SEO, identité, hero, terminal, CV, réseaux, contact, audio, footer, formspreeId
  ui.json                      chaînes d'interface : boot, nav, boutons, titres de sections, formulaire, a11y
  skills.json                  catégories de compétences
  projects.json                projets (stack, liens)
  timeline.json                parcours (formation / expériences)
  cards.json                   cartes 3D (couleur, icône, progression, tags)
  schema/*.schema.json         JSON Schema dérivé (autocomplétion via "$schema")
public/asset/                  fichiers servis tels quels (CV PDF)
src/
  lib/schema.js                schéma zod du contenu + validateContent / validateFile (Node, sans DOM)
  lib/content.js               lecture + validation des fichiers (Node)
  render/                      rendu HTML pur (sans DOM) : escape, context (i18n), sections, icons, index
  vite/portfolio-content-plugin.js  plugin Vite : pré-rendu + module virtuel `virtual:portfolio-content`
  js/main.js                   point d'entrée client
  js/modules/                  cursor, i18n, boot, nav, social, scroll, contact, timeline, tilt, progress, audio
  styles/main.css              importe les partials dans l'ordre de cascade d'origine (ne pas réordonner)
scripts/                       validate-content.mjs, compare-sites.mjs
tests/unit/                    Vitest   ·   tests/e2e/   Playwright
```

### Flux de rendu

1. `vite build` (ou `vite dev`) charge et **valide** `content/*.json` (`src/lib/content.js`).
2. Le plugin remplace chaque marqueur de `index.html` par `renderX(content, ctx)` (`src/render/sections.js`)
   dans la langue `site.defaultLang`.
3. Chaque texte bilingue reçoit un attribut `data-i18n="clé"` ; les mêmes appels alimentent le
   dictionnaire `{ fr: {clé: texte}, en: {clé: texte} }` exposé au client par `virtual:portfolio-content`.
4. Côté client, `src/js/modules/i18n.js` applique la langue (préférence mémorisée > navigateur > défaut)
   avec `textContent` uniquement.

## Éditer le contenu

- **Texte traduisible** : `{ "fr": "…", "en": "…" }`. Une chaîne simple (`"Python"`) est un texte
  identique dans les deux langues (pas de bascule).
- **Retour à la ligne** : `\n` (ex. `"Arsenal\nTechnique"`). **Aucun HTML** : `<` et `>` sont refusés,
  tout est échappé au rendu.
- **Listes** (projets, compétences, timeline, cartes, réseaux, liens de nav, lignes de boot…) :
  chaque élément a un `id` stable (minuscules, `-`, `_`), un `order` (tri croissant) et `visible`
  (`false` = masqué sans suppression). Les numéros `PROJECT_0x` sont calculés selon l'ordre affiché.
- **Champs structurés** : `color` des cartes (`green` | `cyan` | `yellow`), `percent` (0-100),
  `network` des réseaux (`github` | `linkedin` | `whatsapp` | `instagram`, icône SVG fournie par le code),
  URLs limitées à `http(s)://`, `mailto:`, `tel:`, `#ancre` ou chemin relatif.
- Après modification : `npm run validate:content` (le build échoue de toute façon si le contenu est invalide,
  avec le fichier et le chemin fautifs).

## API réutilisable (panneau admin)

Modules ESM sans dépendance au DOM, importables depuis Node :

```js
import { validateContent, validateFile, formatIssues, toJSONSchemas, CONTENT_FILES } from './src/lib/schema.js';
import { readContent, loadContent } from './src/lib/content.js';
import { renderPage, renderSections, buildDictionary } from './src/render/index.js';

const res = validateFile('projects', json);      // { success, data, errors: [{ file, path, message }] }
const all = validateContent({ site, ui, skills, projects, timeline, cards });
const html = renderPage(templateHtml, all.data, 'fr');   // prévisualisation complète
```

## Déploiement

- **GitHub Pages** : workflow `.github/workflows/deploy-pages.yml` (build Vite → `dist/`) depuis `main`
  (Settings › Pages › Source = « GitHub Actions »).
- **Vercel** : `vercel.json` (framework Vite, sortie `dist/`).

Voir aussi [CONTRIBUTING.md](CONTRIBUTING.md) et [CHANGELOG.md](CHANGELOG.md).
