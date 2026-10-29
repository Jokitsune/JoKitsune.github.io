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
