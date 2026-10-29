/* ================================================
   CONFIGURATION — lecture et validation « fail closed » des variables
   Toute variable absente ou mal formée ⇒ admin désactivé (503 ADMIN_DISABLED).
   Les erreurs citent le NOM de la variable, jamais sa valeur.
   ================================================ */

import { createPrivateKey, randomBytes } from 'node:crypto';

const ID_RE = /^[1-9][0-9]{0,15}$/;
const LOGIN_RE = /^[A-Za-z0-9-]{1,39}$/;
const HTTPS_ORIGIN_RE = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/;
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const BRANCH_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const DRAFT_BRANCH_RE = /^content\/[a-z0-9-]+$/;

/** Erreur levée quand le mode développement est demandé hors développement. */
export class DevModeForbiddenError extends Error {
  constructor() {
    super('ADMIN_DEV_MODE est interdit hors développement local (VERCEL_ENV doit être absent ou « development »).');
    this.name = 'DevModeForbiddenError';
  }
}

/** Le mode développement (backend fichier local, sans GitHub) est-il demandé ? */
export function isDevModeRequested(env) {
  return env.ADMIN_DEV_MODE !== undefined && env.ADMIN_DEV_MODE !== '' && env.ADMIN_DEV_MODE !== '0';
}

/**
 * Refuse le mode développement en production ou en preview.
 * Appelé par loadConfig ET par le plugin Vite de développement.
 * @throws {DevModeForbiddenError}
 */
export function assertDevModeAllowed(env) {
  const vercelEnv = env.VERCEL_ENV ?? '';
  if (vercelEnv !== '' && vercelEnv !== 'development') throw new DevModeForbiddenError();
  if (env.VERCEL === '1' && vercelEnv !== 'development') throw new DevModeForbiddenError();
  if (env.NODE_ENV === 'production') throw new DevModeForbiddenError();
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  return Buffer.from(value, 'base64url');
}

function intInRange(raw, min, max, fallback) {
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

/** Décode la clé privée de la GitHub App (PEM PKCS#1 ou PKCS#8 en base64) en PEM PKCS#8. */
export function decodePrivateKey(b64) {
  if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) return null;
  const pem = Buffer.from(b64.replace(/\s+/g, ''), 'base64').toString('utf8');
  if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(pem)) return null;
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'rsa') return null;
    return key.export({ type: 'pkcs8', format: 'pem' }).toString();
  } catch {
    return null;
  }
}

function devConfig(env) {
  const origin = env.ADMIN_ORIGIN || 'http://localhost:5173';
  const invalid = [];
  if (!LOCAL_ORIGIN_RE.test(origin)) invalid.push('ADMIN_ORIGIN');
  let sessionSecret = env.SESSION_SECRET ? decodeBase64Url(env.SESSION_SECRET) : randomBytes(32);
  if (!sessionSecret || sessionSecret.length < 32) invalid.push('SESSION_SECRET');
  if (invalid.length) return { ok: false, reason: 'invalid', invalid };
  return {
    ok: true,
    config: {
      devMode: true,
      environment: 'development',
      origin,
      host: new URL(origin).host,
      secureCookies: false,
      adminGithubId: env.ADMIN_GITHUB_ID && ID_RE.test(env.ADMIN_GITHUB_ID) ? env.ADMIN_GITHUB_ID : '1',
      adminGithubLogin: env.ADMIN_GITHUB_LOGIN && LOGIN_RE.test(env.ADMIN_GITHUB_LOGIN) ? env.ADMIN_GITHUB_LOGIN : 'dev-admin',
      baseBranch: 'main',
      draftBranch: 'content/draft',
      syncBranch: 'develop',
      publishMode: env.PUBLISH_MODE === 'direct' ? 'direct' : 'pr',
      previewUrl: env.DRAFT_PREVIEW_URL || null,
      sessionSecret,
      sessionVersion: 1,
      sessionTtl: 14400,
      stepUpMaxAge: intInRange(env.STEP_UP_MAX_AGE_SECONDS, 60, 3600, 900) ?? 900,
      logLevel: 'info',
      devDataDir: env.ADMIN_DEV_DATA_DIR || '.admin-dev'
    }
  };
}

/**
 * Valide l'environnement.
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true, config: object } | { ok: false, reason: 'disabled' | 'invalid' | 'dev_mode_forbidden', invalid: string[] }}
 */
export function loadConfig(env) {
  if (isDevModeRequested(env)) {
    try {
      assertDevModeAllowed(env);
    } catch {
      return { ok: false, reason: 'dev_mode_forbidden', invalid: ['ADMIN_DEV_MODE'] };
    }
    return devConfig(env);
  }

  if (env.ADMIN_ENABLED !== 'true') return { ok: false, reason: 'disabled', invalid: ['ADMIN_ENABLED'] };

  const invalid = [];
  const check = (name, ok) => { if (!ok) invalid.push(name); };
  const vercelEnv = env.VERCEL_ENV;
  check('VERCEL_ENV', vercelEnv === 'production' || vercelEnv === 'development');
  const isDevelopment = vercelEnv === 'development';

  const origin = env.ADMIN_ORIGIN ?? '';
  check('ADMIN_ORIGIN', HTTPS_ORIGIN_RE.test(origin) || (isDevelopment && LOCAL_ORIGIN_RE.test(origin)));
  check('ADMIN_GITHUB_ID', ID_RE.test(env.ADMIN_GITHUB_ID ?? ''));
  check('ADMIN_GITHUB_LOGIN', LOGIN_RE.test(env.ADMIN_GITHUB_LOGIN ?? ''));
  check('GITHUB_OAUTH_CLIENT_ID', /^[A-Za-z0-9._-]{1,100}$/.test(env.GITHUB_OAUTH_CLIENT_ID ?? ''));
  check('GITHUB_OAUTH_CLIENT_SECRET', /^[A-Za-z0-9._-]{40,200}$/.test(env.GITHUB_OAUTH_CLIENT_SECRET ?? ''));
  check('GITHUB_APP_ID', ID_RE.test(env.GITHUB_APP_ID ?? ''));
  check('GITHUB_APP_INSTALLATION_ID', ID_RE.test(env.GITHUB_APP_INSTALLATION_ID ?? ''));
  const privateKey = decodePrivateKey(env.GITHUB_APP_PRIVATE_KEY_B64);
  check('GITHUB_APP_PRIVATE_KEY_B64', privateKey !== null);
  check('GITHUB_REPO_OWNER', LOGIN_RE.test(env.GITHUB_REPO_OWNER ?? ''));
  check('GITHUB_REPO_NAME', /^[A-Za-z0-9._-]{1,100}$/.test(env.GITHUB_REPO_NAME ?? ''));
  check('GITHUB_REPO_ID', ID_RE.test(env.GITHUB_REPO_ID ?? ''));

  const baseBranch = env.CONTENT_BASE_BRANCH || 'main';
  check('CONTENT_BASE_BRANCH', BRANCH_RE.test(baseBranch) && baseBranch.length <= 100);
  const draftBranch = env.CONTENT_DRAFT_BRANCH || 'content/draft';
  check('CONTENT_DRAFT_BRANCH', DRAFT_BRANCH_RE.test(draftBranch));
  // Branche resynchronisée après chaque publication (PR base → sync) ; « none » pour désactiver
  const syncRaw = env.CONTENT_SYNC_BRANCH || 'develop';
  const syncBranch = syncRaw === 'none' ? null : syncRaw;
  check('CONTENT_SYNC_BRANCH', syncBranch === null || (BRANCH_RE.test(syncBranch) && syncBranch !== baseBranch && syncBranch !== draftBranch));
  const publishMode = env.PUBLISH_MODE || 'pr';
  check('PUBLISH_MODE', publishMode === 'pr' || publishMode === 'direct');
  const previewUrl = env.DRAFT_PREVIEW_URL || null;
  check('DRAFT_PREVIEW_URL', previewUrl === null || /^https:\/\/[^\s"'<>]{1,200}$/.test(previewUrl));

  const sessionSecret = decodeBase64Url(env.SESSION_SECRET ?? '');
  check('SESSION_SECRET', sessionSecret !== null && sessionSecret.length >= 32);
  const sessionVersion = intInRange(env.SESSION_VERSION, 1, 1e9, 1);
  check('SESSION_VERSION', sessionVersion !== null);
  const sessionTtl = intInRange(env.SESSION_TTL_SECONDS, 900, 28800, 14400);
  check('SESSION_TTL_SECONDS', sessionTtl !== null);
  const stepUpMaxAge = intInRange(env.STEP_UP_MAX_AGE_SECONDS, 60, 3600, 900);
  check('STEP_UP_MAX_AGE_SECONDS', stepUpMaxAge !== null);
  const logLevel = env.LOG_LEVEL || 'info';
  check('LOG_LEVEL', ['info', 'warn', 'error'].includes(logLevel));

  if (invalid.length) return { ok: false, reason: 'invalid', invalid };

  return {
    ok: true,
    config: {
      devMode: false,
      environment: vercelEnv,
      origin,
      host: new URL(origin).host,
      // __Host- exige Secure : seul un développement local en http s'en passe
      secureCookies: origin.startsWith('https://'),
      adminGithubId: env.ADMIN_GITHUB_ID,
      adminGithubLogin: env.ADMIN_GITHUB_LOGIN,
      oauthClientId: env.GITHUB_OAUTH_CLIENT_ID,
      oauthClientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
      appId: env.GITHUB_APP_ID,
      installationId: env.GITHUB_APP_INSTALLATION_ID,
      privateKeyPem: privateKey,
      repoOwner: env.GITHUB_REPO_OWNER,
      repoName: env.GITHUB_REPO_NAME,
      repoId: Number(env.GITHUB_REPO_ID),
      baseBranch,
      draftBranch,
      syncBranch,
      publishMode,
      previewUrl,
      sessionSecret,
      sessionVersion,
      sessionTtl,
      stepUpMaxAge,
      logLevel
    }
  };
}
