# Panneau d'administration `/admin`

Le panneau `/admin` permet d'éditer le contenu du site (`content/*.json`), d'envoyer le CV et des images, puis de publier, sans toucher au code. Il n'est servi que par **Vercel** (`https://jokitsune.vercel.app/admin/`). Le miroir GitHub Pages ne le contient pas.

> Le panneau reste **désactivé** tant que `ADMIN_ENABLED=true` n'est pas défini et que toutes les variables ne sont pas valides : toutes les routes `api/` répondent alors `503 ADMIN_DISABLED`.

## Sommaire

1. [Fonctionnement](#1-fonctionnement)
2. [Récupérer les identifiants numériques](#2-récupérer-les-identifiants-numériques)
3. [Créer l'OAuth App (connexion)](#3-créer-loauth-app-connexion)
4. [Créer la GitHub App (écriture)](#4-créer-la-github-app-écriture)
5. [Générer les secrets](#5-générer-les-secrets)
6. [Renseigner les variables Vercel](#6-renseigner-les-variables-vercel)
7. [Protéger la preview et la branche `main`](#7-protéger-la-preview-et-la-branche-main)
8. [Régler le pare-feu Vercel (WAF)](#8-régler-le-pare-feu-vercel-waf)
9. [Mise en service et recette](#9-mise-en-service-et-recette)
10. [Développement local](#10-développement-local)
11. [Exploitation : rotation, révocation, coupure d'urgence](#11-exploitation--rotation-révocation-coupure-durgence)

---

## 1. Fonctionnement

```
Navigateur /admin/ ──fetch──▶ api/* (Vercel, Node) ──▶ GitHub
  (HTML/JS statique,           ├─ auth/*   : OAuth App SANS scope (identité seule)
   CSP stricte +               └─ content/*, upload, publish
   Trusted Types)                   : jeton d'installation de la GitHub App (1 h, ce dépôt)
                                      └─ commits sur content/draft ─▶ PR ─▶ main
```

- **Connexion** : OAuth GitHub avec `state` + PKCE S256. Le serveur vérifie l'**ID numérique** du compte (`ADMIN_GITHUB_ID`), puis le login et le type `User`. Le jeton GitHub de l'utilisateur est **révoqué immédiatement** après lecture du profil : il n'est jamais conservé.
- **Session** : JWT HS256 dans le cookie `__Host-jk_admin` (`HttpOnly; Secure; SameSite=Strict`), d'une durée absolue de 4 h.
- **Écriture** : uniquement via la GitHub App, avec un jeton d'installation de 1 h restreint à ce dépôt. Les commits sont signés par le bot `…[bot]` et portent les trailers `Admin-Actor`, `Admin-Session` et `Admin-Request-Id`.
- **Brouillon** (`PUBLISH_MODE=pr`) : toutes les modifications vont sur `content/draft`. « Publier » ouvre (ou réutilise) une PR `content/draft → main`, attend une CI verte, puis la fusionne en squash.
- **Publication en deux temps** : le premier clic sur « Publier » ouvre la PR et lance la CI (1 à 2 minutes). Si le brouillon est en retard sur `main`, il est d'abord mis à jour (`update-branch`) et la CI repart. Une fois la CI verte, un second clic fusionne. L'interface l'indique à chaque étape.
- **Ré-authentification dédiée (step-up)** : publier ou abandonner le brouillon exige une connexion GitHub **lancée depuis le bouton « Se ré-authentifier » de la vue Publication** (`/api/auth/login?stepup=1`) et datant de moins de 15 minutes. Une connexion ordinaire, même récente, ne suffit pas.
- **Synchronisation de `develop`** : après chaque fusion dans `main`, l'App ouvre la PR `main → develop` « chore: synchroniser develop avec la publication de contenu » (sauf si elle est déjà ouverte). Elle active ensuite l'**auto-merge en mode merge commit**. Si l'auto-merge est indisponible, la vue Publication propose « Fusionner la synchronisation » dès que la CI est verte (`POST /api/publish/sync`).
- **Concurrence** : chaque écriture porte le `sha` lu. Si le fichier a changé entre-temps, l'API répond `409` et l'admin affiche les différences, sans jamais écraser automatiquement. Après une fusion, le brouillon n'est réaligné sur `main` que s'il n'a pas bougé entre-temps.

> **Limite résiduelle du step-up** : GitHub OAuth ne propose ni `prompt=login` ni `max_age`. Si la session GitHub du navigateur est active, la ré-authentification se fait sans saisie. Le step-up prouve donc la **possession actuelle de la session GitHub du propriétaire**, ce qui empêche un cookie admin volé seul de publier. Il ne prouve pas une présence humaine interactive. L'évolution prévue est une confirmation **WebAuthn** (passkey) côté admin avant publication ; elle demande un stockage de clé publique et n'est pas couverte par cette version.

## 2. Récupérer les identifiants numériques

Avec `gh` authentifié :

```bash
# ID numérique (immuable) du compte administrateur → ADMIN_GITHUB_ID
gh api users/Jokitsune --jq .id

# ID numérique du dépôt → GITHUB_REPO_ID
gh api repos/Jokitsune/JoKitsune.github.io --jq .id
```

## 3. Créer l'OAuth App (connexion)

GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App** :

| Champ | Valeur |
|---|---|
| Application name | `jokitsune-admin-login` |
| Homepage URL | `https://jokitsune.vercel.app` |
| Authorization callback URL | `https://jokitsune.vercel.app/api/auth/callback` |
| Enable Device Flow | **non** |

Puis **Generate a new client secret**. Notez le **Client ID** (`GITHUB_OAUTH_CLIENT_ID`) et le **secret** (`GITHUB_OAUTH_CLIENT_SECRET`, affiché une seule fois).

- Aucun scope n'est demandé par le code : l'application ne lit que le profil public.
- **Callback de preview** : aucune. Une OAuth App n'accepte qu'une seule URL de callback, et c'est voulu : les secrets ne sont déclarés que pour la **Production**, donc `api/` répond 503 sur les previews. Le refus de toute URL autre que `ADMIN_ORIGIN` est en plus contrôlé par le serveur (`checkHost`).
- **Développement local avec un vrai GitHub** (optionnel) : créez une **seconde** OAuth App, par exemple `jokitsune-admin-login-dev`, avec la callback `http://localhost:3000/api/auth/callback`. N'utilisez jamais les identifiants de production sur le poste.

## 4. Créer la GitHub App (écriture)

GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App** :

| Champ | Valeur |
|---|---|
| GitHub App name | `jokitsune-admin-writer` |
| Homepage URL | `https://jokitsune.vercel.app` |
| Callback URL | *(vide)* |
| Request user authorization (OAuth) during installation | **décoché** |
| Webhook → Active | **décoché** |
| Where can this GitHub App be installed? | **Only on this account** |

**Permissions → Repository permissions** (et rien d'autre) :

| Permission | Accès |
|---|---|
| Contents | **Read and write** |
| Pull requests | **Read and write** |
| Checks | **Read-only** |
| Metadata | **Read-only** (imposé) |

Aucune permission *Account* ni *Organization*. Surtout **pas** *Administration*, *Workflows*, *Secrets* ni *Actions*.

Ensuite :

1. **Create GitHub App**, puis notez l'**App ID** (`GITHUB_APP_ID`).
2. **Private keys → Generate a private key** : un fichier `.pem` est téléchargé. Ne le copiez jamais dans le dépôt.
3. **Install App** → compte `Jokitsune` → **Only select repositories** → `JoKitsune.github.io`.
4. L'URL de la page d'installation se termine par `/settings/installations/<nombre>` : ce nombre est `GITHUB_APP_INSTALLATION_ID`.
5. Dans les rulesets du dépôt, **n'ajoutez pas** l'App aux acteurs autorisés à contourner les règles (*bypass*).

## 5. Générer les secrets

```bash
# SESSION_SECRET : 32 octets aléatoires en base64url
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# GITHUB_APP_PRIVATE_KEY_B64 : la clé PEM encodée en base64 sur UNE ligne
base64 -w0 jokitsune-admin-writer.*.private-key.pem          # Git Bash / Linux
# PowerShell :
# [Convert]::ToBase64String([IO.File]::ReadAllBytes("jokitsune-admin-writer.private-key.pem"))
```

Les clés PKCS#1 (`BEGIN RSA PRIVATE KEY`, le format fourni par GitHub) et PKCS#8 sont acceptées toutes les deux. Une fois la variable enregistrée dans Vercel, **supprimez le fichier `.pem` local** (ou rangez-le dans un gestionnaire de secrets).

## 6. Renseigner les variables Vercel

Vercel → projet → **Settings → Environment Variables**. Pour **chaque** variable :

- **Environments** : **Production uniquement**. Décochez *Preview* et *Development*.
- Cochez **Sensitive** pour les secrets marqués 🔒 : leur valeur ne pourra plus être relue après l'enregistrement.

| Variable | Valeur | |
|---|---|---|
| `ADMIN_ENABLED` | `true` (en dernier, après la recette) | |
| `ADMIN_ORIGIN` | `https://jokitsune.vercel.app` (sans slash final) | |
| `ADMIN_GITHUB_ID` | résultat de `gh api users/Jokitsune --jq .id` | |
| `ADMIN_GITHUB_LOGIN` | `Jokitsune` | |
| `GITHUB_OAUTH_CLIENT_ID` | Client ID de l'OAuth App | |
| `GITHUB_OAUTH_CLIENT_SECRET` | secret de l'OAuth App | 🔒 |
| `GITHUB_APP_ID` | App ID | |
| `GITHUB_APP_INSTALLATION_ID` | ID d'installation | |
| `GITHUB_APP_PRIVATE_KEY_B64` | clé PEM en base64 (une ligne) | 🔒 |
| `GITHUB_REPO_OWNER` | `Jokitsune` | |
| `GITHUB_REPO_NAME` | `JoKitsune.github.io` | |
| `GITHUB_REPO_ID` | résultat de `gh api repos/… --jq .id` | |
| `CONTENT_BASE_BRANCH` | `main` | |
| `CONTENT_DRAFT_BRANCH` | `content/draft` | |
| `CONTENT_SYNC_BRANCH` | `develop` (défaut ; `none` désactive la PR de synchronisation) | |
| `PUBLISH_MODE` | `pr` | |
| `DRAFT_PREVIEW_URL` | alias de preview de `content/draft` (voir § 7) | |
| `SESSION_SECRET` | généré au § 5 | 🔒 |
| `SESSION_VERSION` | `1` | |
| `SESSION_TTL_SECONDS` | `14400` (facultatif) | |
| `STEP_UP_MAX_AGE_SECONDS` | `900` (facultatif) | |
| `LOG_LEVEL` | `info` (facultatif) | |

La liste complète, commentée, se trouve dans [`.env.example`](../.env.example). **Ne définissez jamais `ADMIN_DEV_MODE` sur Vercel** : en production comme en preview, sa simple présence désactive l'API (503).

Les variables ne s'appliquent qu'aux **nouveaux** déploiements : redéployez la production après chaque modification (*Deployments → … → Redeploy*).

## 7. Protéger la preview et la branche `main`

**Vercel**

- **Settings → Deployment Protection → Vercel Authentication** : *Standard Protection*. Les previews, dont celle de `content/draft`, ne sont alors visibles qu'une fois connecté à Vercel.
- **Settings → Git → Git Fork Protection** : activé.
- L'alias stable de la branche brouillon a la forme `https://jokitsune-git-content-draft-<scope>.vercel.app`. Il apparaît sur la page du premier déploiement de `content/draft`. Reportez-le dans `DRAFT_PREVIEW_URL`.

**GitHub** (Settings → Rules → Rulesets → New branch ruleset, cible `main`)

- *Require a pull request before merging*.
- *Require status checks to pass* : le check **« Lint, tests et build »** du workflow CI. Il valide le contenu (`npm run validate:content`), lance les tests, construit le site et contrôle `dist/`.
- **Règle « branche à jour »** (*Require branches to be up to date before merging*) : recommandée. Elle garantit que la CI a validé le contenu **combiné** à la dernière version de `main`. L'admin la gère : si le brouillon est en retard, « Publier » le met à jour (`PUT /pulls/{n}/update-branch`), la CI repart, puis un nouveau clic fusionne.
- *Block force pushes* et *Restrict deletions*.
- **Ne cochez pas** *Require linear history* : `CONTRIBUTING.md` impose des merge commits pour `develop → main` (releases) et pour la synchronisation `main → develop`.
- **Aucun** acteur de contournement, y compris la GitHub App.
- Facultatif (mode « B+ ») : *Required approvals: 1*. La publication se fait alors en approuvant la PR sur GitHub.

**GitHub** (ruleset de `develop`) : PR obligatoire, check « Lint, tests et build », 0 approbation, merge commits autorisés. La PR de synchronisation `main → develop` s'y conforme.

**GitHub** (Settings → General → Pull Requests) : cochez **Allow auto-merge** (pour la fusion automatique de la synchronisation) et **Allow merge commits** (merge commit de synchronisation). Sans auto-merge, la synchronisation reste possible depuis l'admin, en un clic, une fois la CI verte.

Les permissions de la GitHub App (§ 4) **suffisent** : *Contents: write* et *Pull requests: write* couvrent l'ouverture de la PR de synchronisation, la mise à jour de branche (`update-branch`), l'activation de l'auto-merge (GraphQL `enablePullRequestAutoMerge`) et la fusion. *Checks: read* sert à lire la CI. Aucune permission *Workflows* ni *Administration* n'est nécessaire.

Activez aussi **Settings → Code security → Secret scanning** et **Push protection**.

> **PDF et en-têtes** : la CSP `sandbox` et `nosniff` des PDF (`/files/*.pdf`, `/asset/*.pdf`) ne sont appliquées que par **Vercel**. Sur le miroir GitHub Pages, aucun en-tête personnalisé n'est possible : le PDF y est servi sans sandbox. L'admin refuse donc à l'envoi les PDF actifs (noms décodés des `#xx`) et les PDF non inspectables (`/ObjStm`, `/Encrypt`, flux non décodables).

> **CSP du site public** : elle est **appliquée** (et non plus en Report-Only), sans aucun script tiers ni `unsafe-inline`. Le formulaire de contact utilise `fetch` vers `formspree.io` (le script `unpkg.com/@formspree/ajax` a été supprimé : il s'exécutait sur l'origine de l'admin). Tout nouveau domaine externe (police, script, média) doit être ajouté explicitement dans `vercel.json`.

## 8. Régler le pare-feu Vercel (WAF)

Vercel → projet → **Firewall → Configure → New Rule**. Le limiteur en mémoire du code n'est qu'un filet ; le WAF est le contrôle principal.

| Règle | Condition | Action |
|---|---|---|
| Auth | Request path *starts with* `/api/auth/` | Rate limit 20 req / 60 s / IP, puis **Deny** pendant 10 min |
| API | Request path *starts with* `/api/` | Rate limit 120 req / 60 s / IP, puis **Deny** |
| Upload | Request path *equals* `/api/upload` | Rate limit 10 req / 10 min / IP |
| Coupe-circuit (**désactivée**) | Request path *starts with* `/api/` | **Deny**. À activer en cas d'incident : effet immédiat, sans redéploiement |

Vérifiez le nombre de règles disponibles dans votre offre Vercel. *Attack Challenge Mode* peut aussi être activé en cas d'abus.

## 9. Mise en service et recette

1. Déployez la production avec toutes les variables, sauf `ADMIN_ENABLED`.
2. Vérifiez que `https://jokitsune.vercel.app/api/auth/me` répond **503**.
3. Ajoutez `ADMIN_ENABLED=true`, puis redéployez.
4. Ouvrez `https://jokitsune.vercel.app/admin/`, connectez-vous avec GitHub, modifiez un texte, enregistrez, puis publiez.
5. Déroulez la checklist manuelle (cas `T-MAN-*`, `T-HDR-*`, `T-GIT-02`, `T-SEC-*` listés dans la PR), notamment :
   - connexion avec un **autre** compte GitHub ⇒ refus ;
   - `curl -sI https://jokitsune.vercel.app/admin/` ⇒ CSP stricte, `X-Robots-Tag: noindex`, `Cache-Control: no-store` ;
   - l'URL de déploiement immuable (`jokitsune-<hash>-….vercel.app/api/auth/login`) ⇒ **404** ;
   - le premier commit du bot affiche le badge **Verified**.

## 10. Développement local

### Mode sans GitHub (recommandé)

```bash
npm ci
npm run dev:admin        # http://localhost:5173/admin/
```

- `ADMIN_DEV_MODE=1` est positionné automatiquement : l'API est montée dans le serveur Vite, sur un **backend fichier local**.
- La connexion est fictive (utilisateur `dev-admin`) et aucun appel réseau n'est fait vers GitHub.
- Les écritures vont dans `.admin-dev/` (ignoré par Git) : `draft/` pour le brouillon, `main/` pour la version « publiée ». Les fichiers du dépôt (`content/`, `public/`) ne sont **jamais** modifiés. Pour repartir de zéro, supprimez `.admin-dev/` (il est recréé à la volée, même serveur lancé).
- La « CI » y est toujours considérée verte. Le step-up suit la même règle qu’en production : seul le lien « Se ré-authentifier » (`/api/auth/login?stepup=1`) l’accorde. La synchronisation `main → develop` est simulée (auto-merge immédiat).
- Port différent : `PORT=5180 npm run dev:admin` (`ADMIN_ORIGIN` suit automatiquement).
- **Garde-fou** : le serveur refuse de démarrer, et l'API répond 503, si `VERCEL_ENV` vaut `production` ou `preview` (ou toute autre valeur que `development`), si `NODE_ENV=production`, ou sur Vercel hors `vercel dev`. Ce comportement est couvert par `tests/unit/api/config.test.js`.

Le serveur de développement Vite n'applique pas la CSP. Pour vérifier l'admin sous la CSP réelle et Trusted Types, utilisez :

```bash
npm run build && npm run preview   # applique les en-têtes de vercel.json, /admin/ inclus
npm run test:e2e                   # Playwright : site public sous CSP, admin sous CSP (API simulée)
                                   # et parcours complet sur le vrai backend de dev (tests/e2e/admin-dev.spec.js)
```

### Avec `vercel dev` et un vrai GitHub (optionnel)

1. Créez une OAuth App de développement (callback `http://localhost:3000/api/auth/callback`), ainsi qu'une GitHub App de développement installée sur un **dépôt de test**.
2. Copiez `.env.example` vers `.env.local` (ignoré par Git) et remplissez-le avec ces identifiants de développement, en ajoutant `VERCEL_ENV=development`, `ADMIN_ENABLED=true` et `ADMIN_ORIGIN=http://localhost:3000`.
3. Lancez `npx vercel dev`. En `development`, l'origine `http://localhost` est acceptée et les cookies s'appellent `jk_admin` / `jk_oauth` (le préfixe `__Host-` exige HTTPS).

## 11. Exploitation : rotation, révocation, coupure d'urgence

| Action | Procédure |
|---|---|
| Déconnecter toutes les sessions | Incrémenter `SESSION_VERSION`, puis redéployer |
| Rotation de la clé de la GitHub App (tous les 6 mois) | Générer une 2ᵉ clé dans GitHub → mettre à jour `GITHUB_APP_PRIVATE_KEY_B64` → redéployer → vérifier une écriture → **supprimer l'ancienne clé dans GitHub** |
| Rotation du secret OAuth (tous les 6 mois) | Même procédure (GitHub autorise deux secrets simultanés) |
| Rotation de `SESSION_SECRET` (annuelle) | Nouvelle valeur, puis redéployer (toutes les sessions tombent) |
| Coupure immédiate | Activer la règle WAF « coupe-circuit », ou `ADMIN_ENABLED=false` + redéploiement |
| Compte renommé | La connexion est refusée (log `auth.login_mismatch`) : mettre à jour `ADMIN_GITHUB_LOGIN` |
| Audit | Historique Git (trailers `Admin-*`) et journaux Vercel (une ligne JSON par événement : `auth.*`, `content.*`, `upload.*`, `publish.done`, `csrf.reject`…) |

Revue semestrielle conseillée : *Settings → Applications* (OAuth Apps autorisées et GitHub Apps installées). Activez la 2FA par passkey ou clé matérielle sur le compte `Jokitsune`.
