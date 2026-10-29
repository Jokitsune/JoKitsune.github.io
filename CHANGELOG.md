# Changelog

Toutes les modifications notables de ce projet sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
et le projet adhère au [Versionnage sémantique](https://semver.org/lang/fr/).

## [Unreleased]

### Ajouté

- Workflow Git documenté (`CONTRIBUTING.md`) : branches `main` / `develop` / `feat/*`…, Conventional Commits, cycle de PR et releases SemVer.
- Modèles de pull request et d'issues (bug, fonctionnalité).
- Intégration continue GitHub Actions (lint, tests, build) sur les PR et pushs vers `develop` et `main`.
- Déploiement GitHub Pages du build Vite (`dist/`) depuis `main`.
- `.gitignore` et `.editorconfig`.
- Contenu du site extrait dans `content/*.json` (textes bilingues `{ "fr", "en" }`, listes avec `id` / `order` / `visible`), validé par un schéma zod réutilisable (`src/lib/schema.js`) et `npm run validate:content` ; JSON Schema dérivés dans `content/schema/`.
- Pré-rendu du contenu au build (plugin Vite, HTML final en français pour le SEO) ; le dictionnaire i18n client est généré depuis les mêmes JSON.
- Tests Vitest (schéma, rendu, i18n, protection XSS), tests e2e Playwright et script de comparaison visuelle/DOM entre deux versions (`npm run compare`).
- `vercel.json` (build Vite, sortie `dist/`).
- Panneau d'administration `/admin` (Vercel uniquement) : connexion GitHub (OAuth App sans scope, `state` + PKCE, vérification de l'ID numérique), éditeur généré depuis le schéma avec édition FR/EN côte à côte, gestion des listes (ajout, suppression, réordonnancement, masquage), envoi du CV et d'images, brouillon `content/draft` et publication par PR avec CI verte et ré-authentification récente, gestion des conflits (409).
- API serverless `api/` (11 routes, handlers Web standard) : écriture via jeton d'installation de GitHub App, session JWT dans un cookie `__Host-`, protections CSRF, validation serveur avec le schéma partagé, upload contrôlé par magic bytes, journaux JSON sans secrets. Seule dépendance d'exécution ajoutée : `jose` (version exacte).
- Mode de développement local sans GitHub (`npm run dev:admin`, backend fichier), refusé en production.
- `docs/ADMIN.md` (configuration pas à pas), `.env.example`, `npm run check:dist` (aucun secret ni script inline dans le build), tests Vitest de l'API et de l'admin, test e2e de l'admin sous CSP + Trusted Types.

### Modifié

- `vercel.json` : en-têtes de sécurité (HSTS, nosniff, Permissions-Policy, COOP, X-Frame-Options), CSP stricte + Trusted Types sur `/admin`, **CSP appliquée** sur le site public (sans script tiers ni `unsafe-inline`), `CSP: sandbox` sur les PDF, redirection `/admin` → `/admin/`.
- Formulaire de contact : envoi uniquement par `fetch` vers Formspree ; le script `unpkg.com/@formspree/ajax` (version flottante, sans SRI) est supprimé. Les styles inline du HTML pré-rendu sont déplacés en CSS (rendu identique au pixel près).
- `site.cv.url` devient bilingue `{ fr, en }` : le bouton CV suit la langue du site.
- Publication depuis `/admin` : mise à jour automatique d'un brouillon en retard sur `main` (règle « branche à jour »), puis PR de synchronisation `main → develop` avec auto-merge (merge commit).
- Build Vite multi-page (`index.html` + `admin/index.html`) ; le build GitHub Pages (`BUILD_TARGET=pages`) exclut `/admin`. Polyfill `modulepreload` désactivé (aucun script inline).
- `npm run validate:content` applique aussi les garde-fous de l'admin (bidi, caractères de contrôle, profondeur, `order`) et accepte `--dir` ; il est exécuté en CI.
- ESLint interdit `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` dans `src/`, `api/` et `admin/`, et ignore `.claude/**`.

- Migration vers Vite : `index.html` devient un gabarit, JavaScript découpé en modules ES (`src/js/modules/`), CSS découpé en partials (`src/styles/`) dans l'ordre de cascade d'origine, CV servi depuis `public/asset/` (même URL). Rendu visuel et comportement inchangés.
- Le pied de page pré-rendu affiche « Tous droits réservés » en français (auparavant le HTML statique contenait la version anglaise, corrigée seulement par le JavaScript).

### Sécurité

- Le step-up de publication n'est accordé que par une ré-authentification lancée depuis la vue Publication (une connexion ordinaire ne suffit plus).
- URL : refus des URL protocol-relative (`//hôte`), des barres obliques inverses et des chemins relatifs sortant de l'origine (schéma) ; `safeUrl` ignore les caractères de contrôle masquant un schéma (`java\tscript:`).
- Upload PDF : noms `#xx` décodés avant détection, refus des objets compressés (`/ObjStm`), du chiffrement et des flux non inspectables.
- Publication : le brouillon n'est jamais réinitialisé s'il a reçu des commits pendant la fusion.

- Plus aucun `innerHTML` pour le contenu : l'i18n insère du texte (les `\n` deviennent des `<br>` créés via le DOM), le rendu au build échappe tout le texte, le schéma refuse `<` / `>` et les URL non sûres (`javascript:`…).

## [1.0.0] - 2026-08-25

Version reconstituée rétroactivement à partir de l'historique de `main`
(commits antérieurs à l'adoption de Conventional Commits).

### Ajouté

- Première version du portfolio en HTML / CSS / JavaScript statique, publiée sur GitHub Pages (`3e541f8`, 2026-05-07).
- Refonte UX/UI issue d'un audit : lecteur audio au thème cyber, pile de liens vers les réseaux sociaux, internationalisation FR/EN et optimisations diverses (`042d52f`, 2026-08-24).
- CV téléchargeable au format PDF (`asset/Jordan_de_SOUZA_CV.pdf`) (`042d52f`).
- Affichage mobile en pile verticale, avec déploiement des réseaux sociaux vers le bas (`ba89a92`, 2026-08-25).

### Modifié

- Ajustements du contenu de `index.html` (`b89d813`, `cf93d75`, 2026-05-07 / 2026-05-08).

### Corrigé

- Bouton CV et bouton réseaux sociaux verrouillés côte à côte (`707c256`, 2026-08-24).
- Positionnement absolu de la pile réseaux et invalidation du cache navigateur des ressources (`6a39119`, 2026-08-24).

### Supprimé

- Commentaires superflus dans `script.js` et `style.css` (`6e42947`, `9c19c14`, 2026-05-07).

[Unreleased]: https://github.com/Jokitsune/JoKitsune.github.io/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Jokitsune/JoKitsune.github.io/commits/v1.0.0
