/* ================================================
   OAUTH GITHUB (identité seule) — state, PKCE S256, échange du code,
   lecture de /user, révocation immédiate du jeton utilisateur.
   L'OAuth App ne demande AUCUN scope : son jeton ne peut rien écrire.
   ================================================ */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const GITHUB_WEB = 'https://github.com';
export const GITHUB_API = 'https://api.github.com';
export const API_VERSION = '2022-11-28';
const TIMEOUT_MS = 5000;

/** Génère state (32 octets) et le couple verifier / challenge PKCE S256. */
export function createPkcePair() {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url'); // 43 caractères
  const challenge = pkceChallenge(verifier);
  return { state, verifier, challenge };
}

/** code_challenge = base64url(SHA-256(verifier)). */
export function pkceChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Comparaison à temps constant (longueurs vérifiées d'abord). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/** URL de callback : fixe, dérivée de ADMIN_ORIGIN (jamais de la requête). */
export function callbackUrl(config) {
  return `${config.origin}/api/auth/callback`;
}

/** URL d'autorisation GitHub — sans paramètre scope, sans destination choisie par le client. */
export function authorizeUrl(config, { state, challenge }) {
  const url = new URL('/login/oauth/authorize', GITHUB_WEB);
  url.searchParams.set('client_id', config.oauthClientId);
  url.searchParams.set('redirect_uri', callbackUrl(config));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('allow_signup', 'false');
  url.searchParams.set('login', config.adminGithubLogin);
  return url.toString();
}

/** Erreur d'échange OAuth (raison interne, jamais renvoyée au client). */
export class OAuthError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'OAuthError';
    this.reason = reason;
  }
}

/**
 * Échange le code contre un jeton utilisateur.
 * @returns {Promise<string>} access_token
 */
export async function exchangeCode(fetchImpl, config, { code, verifier }) {
  const res = await fetchImpl(`${GITHUB_WEB}/login/oauth/access_token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.oauthClientId,
      client_secret: config.oauthClientSecret,
      code,
      redirect_uri: callbackUrl(config),
      code_verifier: verifier
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new OAuthError('token_http_error');
  const body = await res.json().catch(() => null);
  if (!body || typeof body.access_token !== 'string' || !body.access_token) throw new OAuthError('token_exchange_failed');
  return body.access_token;
}

/** Profil public de l'utilisateur authentifié. */
export async function fetchUser(fetchImpl, token) {
  const res = await fetchImpl(`${GITHUB_API}/user`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'jokitsune-admin'
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new OAuthError('user_http_error');
  const user = await res.json().catch(() => null);
  if (!user || typeof user.id !== 'number' || typeof user.login !== 'string') throw new OAuthError('user_invalid');
  return { id: String(user.id), login: user.login, type: user.type };
}

/** Révoque le jeton utilisateur (DELETE /applications/{client_id}/token). */
export async function revokeToken(fetchImpl, config, token) {
  const basic = Buffer.from(`${config.oauthClientId}:${config.oauthClientSecret}`).toString('base64');
  const res = await fetchImpl(`${GITHUB_API}/applications/${encodeURIComponent(config.oauthClientId)}/token`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'jokitsune-admin'
    },
    body: JSON.stringify({ access_token: token }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (res.status !== 204 && !res.ok) throw new OAuthError('revoke_failed');
}

/**
 * Décision d'autorisation : ID numérique (critère principal), login (secondaire), type User.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function authorizeUser(config, user) {
  if (user.id !== config.adminGithubId) return { ok: false, reason: 'id_mismatch' };
  if (user.login.toLowerCase() !== config.adminGithubLogin.toLowerCase()) return { ok: false, reason: 'login_mismatch' };
  if (user.type !== 'User') return { ok: false, reason: 'not_user' };
  return { ok: true };
}
