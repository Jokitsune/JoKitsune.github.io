# Contribuer au portfolio

Ce guide décrit le workflow Git du dépôt `Jokitsune/JoKitsune.github.io`.
Objectif : un historique lisible, des releases traçables et une production toujours déployable.

## Environnements

| Branche   | Rôle                         | Déploiement                                                        |
| --------- | ---------------------------- | ------------------------------------------------------------------ |
| `main`    | Production (releases taguées) | Vercel production (https://jokitsune.vercel.app) + GitHub Pages (https://jokitsune.github.io, site statique sans `/admin`) |
| `develop` | Intégration                   | Vercel preview                                                      |
| autres    | Travail en cours              | Vercel preview par PR                                               |

## Branches

```
main     ──●─────────────────────●──────────●──   (prod, tags vX.Y.Z)
            \                   / \        /
develop      ●──●────●────●────●   \      /       (intégration)
                 \  /      \  /     \    /
feat/…            ●         ●     hotfix/…        (courte durée)
```

| Préfixe      | Part de   | Fusionne vers        | Usage                                  |
| ------------ | --------- | -------------------- | -------------------------------------- |
| `feat/`      | `develop` | `develop`            | Nouvelle fonctionnalité                |
| `fix/`       | `develop` | `develop`            | Correction de bug non urgente          |
| `refactor/`  | `develop` | `develop`            | Restructuration sans changement visible |
| `docs/`      | `develop` | `develop`            | Documentation uniquement               |
| `chore/`     | `develop` | `develop`            | Outillage, CI, dépendances, config     |
| `hotfix/`    | `main`    | `main` **puis** `develop` | Correctif urgent en production   |

Règles :

- Nom en kebab-case, court et explicite : `feat/admin-login`, `fix/menu-mobile`, `chore/vite-setup`.
- Une branche = un sujet. Durée de vie courte (quelques jours maximum).
- On ne commite **jamais** directement sur `main` ni `develop` : tout passe par une PR.

## Démarrer une tâche

```bash
git fetch origin
git switch --no-track -c feat/ma-fonctionnalite origin/develop
# ... travail + commits ...
git push -u origin feat/ma-fonctionnalite
gh pr create --base develop --fill
```

Hotfix (part de `main`) :

```bash
git fetch origin
git switch --no-track -c hotfix/lien-cv-casse origin/main
git push -u origin hotfix/lien-cv-casse
gh pr create --base main --fill
```

## Conventional Commits (en français)

Format : `type(portée optionnelle): description à l'impératif, sans majuscule ni point final`

| Type       | Quand l'utiliser                                   | Impact version |
| ---------- | -------------------------------------------------- | -------------- |
| `feat`     | Nouvelle fonctionnalité visible                    | MINOR          |
| `fix`      | Correction de bug                                  | PATCH          |
| `perf`     | Amélioration de performance                        | PATCH          |
| `refactor` | Restructuration sans changement de comportement    | —              |
| `style`    | Formatage du code (pas le CSS visuel : c'est `feat`/`fix`) | —      |
| `docs`     | Documentation                                      | —              |
| `test`     | Ajout ou correction de tests                       | —              |
| `build`    | Vite, dépendances npm                              | —              |
| `ci`       | Workflows GitHub Actions, config Vercel            | —              |
| `chore`    | Maintenance diverse                                | —              |
| `revert`   | Annulation d'un commit précédent                   | selon le cas   |

Changement cassant : `feat!: …` ou pied de page `BREAKING CHANGE: …` (MAJOR).

Exemples :

```text
feat(i18n): ajouter la traduction anglaise de la section projets
fix(nav): corriger le chevauchement du bouton CV sur mobile
perf(audio): charger le lecteur audio à la demande
refactor(js): découper script.js en modules ES
build: migrer le site vers Vite
ci: ajouter le déploiement GitHub Pages depuis main
docs: documenter le workflow de contribution
feat(admin)!: remplacer l'authentification par jeton par OAuth GitHub

BREAKING CHANGE: la variable ADMIN_TOKEN n'est plus lue.
```

Bonnes pratiques :

- Commits **atomiques** : un commit = un changement réversible indépendamment.
- Corps du message (facultatif) pour expliquer le *pourquoi*, pas le *comment*.
- Référencer l'issue en pied de page : `Closes #12`.

## Cycle de Pull Request

1. **Avant d'ouvrir** : se remettre à jour sur la cible.
   ```bash
   git fetch origin
   git rebase origin/develop
   git push --force-with-lease   # uniquement sur SA branche de travail
   ```
2. **Ouvrir la PR** vers `develop` (ou `main` pour un `hotfix/`). Le titre suit Conventional Commits : il devient le message du commit squashé.
3. **CI verte obligatoire** (`lint`, `test`, `build`) + vérification de la preview Vercel.
4. **Fusion** :

| PR                        | Méthode            | Pourquoi                                          |
| ------------------------- | ------------------ | ------------------------------------------------- |
| `feat/*`, `fix/*`… → `develop` | **Squash merge**   | Un commit propre par sujet sur `develop`          |
| `develop` → `main` (release)   | **Merge commit**   | Conserve l'historique de `develop` et marque la release |
| `hotfix/*` → `main`            | **Squash merge**   | Puis reporter sur `develop` (voir ci-dessous)     |

5. La branche est supprimée après fusion.

Après un hotfix, resynchroniser `develop` :

```bash
git fetch origin
git switch --no-track -c chore/sync-hotfix origin/develop
git merge origin/main
git push -u origin chore/sync-hotfix
gh pr create --base develop --title "chore: reporter le hotfix vX.Y.Z sur develop"
```

## Releases et tags (SemVer)

`vMAJEUR.MINEUR.CORRECTIF` — ex. `v1.2.0`.

- **MAJEUR** : changement cassant (refonte d'URL, suppression de section, API admin incompatible).
- **MINEUR** : nouvelle fonctionnalité (`feat`).
- **CORRECTIF** : corrections uniquement (`fix`, `perf`).

Procédure :

1. Mettre à jour `CHANGELOG.md` sur `develop` (déplacer *Unreleased* vers la nouvelle version) via une PR `docs: préparer la release vX.Y.Z`.
2. Ouvrir la PR `develop` → `main` intitulée `release: vX.Y.Z`, fusionner en **merge commit**.
3. Taguer le commit de fusion sur `main` :
   ```bash
   git fetch origin
   git tag -a vX.Y.Z origin/main -m "vX.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z --notes-from-tag   # ou --generate-notes
   ```

## Repartir proprement

| Situation | Commande sûre |
| --------- | ------------- |
| Mettre sa branche à jour | `git fetch origin && git rebase origin/develop` |
| Annuler des modifs locales non commitées d'un fichier | `git restore <fichier>` |
| Défaire le dernier commit en gardant les modifs | `git reset --soft HEAD~1` |
| Annuler un commit déjà poussé / fusionné | `git revert <sha>` (jamais de réécriture sur `main`/`develop`) |
| Commit fait par erreur sur `develop` local | `git switch -c feat/x` puis `git switch develop && git reset --hard origin/develop` |
| Retrouver un commit « perdu » | `git reflog` puis `git switch -c sauvetage <sha>` |
| Supprimer les branches locales déjà fusionnées | `git fetch --prune` puis `git branch -d <branche>` |
| Travailler sur deux sujets en parallèle | `git worktree add --no-track -b feat/y ../portfolio-y origin/develop` |

Règles d'or :

- Jamais de `git push --force` ; utiliser `--force-with-lease`, et **uniquement** sur sa propre branche de travail.
- Jamais de réécriture d'historique sur `main` ou `develop`.
- Avant toute commande destructive (`reset --hard`, `clean -fd`), vérifier `git status` et créer une branche de sauvegarde : `git branch sauvegarde-$(date +%Y%m%d)`.

## Développement local

```bash
npm ci            # installe les dépendances (lockfile strict)
npm run dev       # serveur Vite
npm run lint
npm test
npm run build     # sortie dans dist/
npm run preview   # sert dist/ localement
```

Les secrets (fonctions `api/` sur Vercel) se déclarent dans `.env.local` (ignoré par Git) ; documenter les variables attendues dans `.env.example`.
