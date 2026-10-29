/* ================================================
   GITHUB APP — JWT d'application (RS256) puis jeton d'installation (1 h),
   re-restreint à CE dépôt (ID numérique) et aux seules permissions utiles.
   Le jeton reste en mémoire du module, n'est jamais renvoyé ni journalisé.
   ================================================ */

import { SignJWT, importPKCS8 } from 'jose';
import { ApiError } from './http.js';
import { GITHUB_API, API_VERSION } from './oauth.js';

/** Permissions demandées pour chaque jeton d'installation. */
export const INSTALLATION_PERMISSIONS = Object.freeze({
  contents: 'write',
  pull_requests: 'write',
  checks: 'read',
  metadata: 'read'
});

const TIMEOUT_MS = 8000;
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

/** JWT d'application : iat = now − 60, exp = now + 540 (< 10 min). */
export async function createAppJwt(config, nowSec) {
  const key = await importPKCS8(config.privateKeyPem, 'RS256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(String(config.appId))
    .setIssuedAt(nowSec - 60)
    .setExpirationTime(nowSec + 540)
    .sign(key);
}

/**
 * Fournisseur de jeton d'installation avec cache mémoire (jusqu'à expires_at − 10 min).
 * @param {{ config: object, fetch: typeof fetch, now: () => number }} deps
 */
export function createInstallationTokenProvider({ config, fetch: fetchImpl, now }) {
  let cached = null; // { token, expiresAt }
  return async function getInstallationToken() {
    if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now()) return cached.token;
    const jwt = await createAppJwt(config, Math.floor(now() / 1000));
    let res;
    try {
      res = await fetchImpl(`${GITHUB_API}/app/installations/${config.installationId}/access_tokens`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': API_VERSION,
          'User-Agent': 'jokitsune-admin'
        },
        body: JSON.stringify({ repository_ids: [config.repoId], permissions: INSTALLATION_PERMISSIONS }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new ApiError(504, 'UPSTREAM_TIMEOUT', { reason: 'installation_token_timeout' });
      throw new ApiError(502, 'UPSTREAM', { reason: 'installation_token_network' });
    }
    if (res.status !== 201 && !res.ok) throw new ApiError(502, 'UPSTREAM', { reason: `installation_token_${res.status}` });
    const body = await res.json().catch(() => null);
    if (!body || typeof body.token !== 'string') throw new ApiError(502, 'UPSTREAM', { reason: 'installation_token_invalid' });
    const expiresAt = Date.parse(body.expires_at) || now() + 60 * 60 * 1000;
    cached = { token: body.token, expiresAt };
    return body.token;
  };
}
