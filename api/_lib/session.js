/* ================================================
   SESSION — JWT HS256 (jose) dans un cookie __Host-, et cookie de
   transaction OAuth (state + verifier PKCE). Clés distinctes dérivées par
   HKDF depuis SESSION_SECRET : un cookie de transaction ne peut pas être
   rejoué comme session (clé ET typ différents).
   ================================================ */

import { hkdfSync, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { serializeCookie } from './http.js';

export const SESSION_TYP = 'jk-admin+jwt';
export const OAUTH_TX_TYP = 'jk-oauth-tx+jwt';
export const AUDIENCE = 'jk-admin';
export const OAUTH_TX_TTL = 600;
export const CLOCK_TOLERANCE = 30;

/** Dérive une clé de 32 octets pour un usage donné. */
export function deriveKey(secret, info) {
  return new Uint8Array(hkdfSync('sha256', secret, new Uint8Array(0), info, 32));
}

const keyCache = new WeakMap();
function keys(config) {
  let k = keyCache.get(config);
  if (!k) {
    k = {
      session: deriveKey(config.sessionSecret, 'jk-admin/session/v1'),
      oauth: deriveKey(config.sessionSecret, 'jk-admin/oauth-tx/v1')
    };
    keyCache.set(config, k);
  }
  return k;
}

/** Noms des cookies : préfixe __Host- dès que les cookies sont Secure. */
export function cookieNames(config) {
  return config.secureCookies
    ? { session: '__Host-jk_admin', oauth: '__Host-jk_oauth' }
    : { session: 'jk_admin', oauth: 'jk_oauth' };
}

/**
 * Émet un jeton de session.
 * @param {object} config
 * @param {{ id: string, login: string }} user
 * @param {number} nowSec
 * @returns {Promise<{ token: string, sid: string, exp: number }>}
 */
export async function issueSession(config, user, nowSec) {
  const sid = randomBytes(16).toString('hex');
  const exp = nowSec + config.sessionTtl;
  const token = await new SignJWT({ login: user.login, sid, ver: config.sessionVersion, auth_time: nowSec })
    .setProtectedHeader({ alg: 'HS256', typ: SESSION_TYP })
    .setSubject(String(user.id))
    .setIssuer(config.origin)
    .setAudience(AUDIENCE)
    .setIssuedAt(nowSec)
    .setExpirationTime(exp)
    .sign(keys(config).session);
  return { token, sid, exp };
}

/**
 * Vérifie un jeton de session. Retourne null si invalide (quelle que soit la raison).
 * @returns {Promise<null | { sub: string, login: string, sid: string, exp: number, authTime: number }>}
 */
export async function verifySession(config, token, nowSec) {
  if (!token || token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, keys(config).session, {
      algorithms: ['HS256'],
      issuer: config.origin,
      audience: AUDIENCE,
      typ: SESSION_TYP,
      clockTolerance: CLOCK_TOLERANCE,
      currentDate: new Date(nowSec * 1000),
      requiredClaims: ['sub', 'exp', 'iat']
    });
    if (payload.ver !== config.sessionVersion) return null;
    if (payload.sub !== config.adminGithubId) return null;
    if (typeof payload.sid !== 'string' || typeof payload.login !== 'string') return null;
    if (!Number.isInteger(payload.auth_time)) return null;
    return { sub: payload.sub, login: payload.login, sid: payload.sid, exp: payload.exp, authTime: payload.auth_time };
  } catch {
    return null;
  }
}

/** Cookie de session (Strict, durée absolue). */
export function sessionCookie(config, token) {
  return serializeCookie(cookieNames(config).session, token, {
    maxAge: config.sessionTtl, sameSite: 'Strict', secure: config.secureCookies
  });
}

/** Cookie de session expiré. */
export function clearSessionCookie(config) {
  return serializeCookie(cookieNames(config).session, '', { maxAge: 0, sameSite: 'Strict', secure: config.secureCookies });
}

/**
 * Cookie de transaction OAuth : { state, cv, stepup } signé, 10 min.
 * SameSite=Lax obligatoire : le retour depuis github.com est une navigation cross-site.
 */
export async function issueOAuthTx(config, { state, verifier, stepup }, nowSec) {
  const token = await new SignJWT({ state, cv: verifier, stepup: Boolean(stepup) })
    .setProtectedHeader({ alg: 'HS256', typ: OAUTH_TX_TYP })
    .setIssuer(config.origin)
    .setAudience(`${AUDIENCE}/oauth`)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + OAUTH_TX_TTL)
    .sign(keys(config).oauth);
  return serializeCookie(cookieNames(config).oauth, token, { maxAge: OAUTH_TX_TTL, sameSite: 'Lax', secure: config.secureCookies });
}

/** Vérifie le cookie de transaction ; null si invalide ou expiré (sans tolérance). */
export async function verifyOAuthTx(config, token, nowSec) {
  if (!token || token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, keys(config).oauth, {
      algorithms: ['HS256'],
      issuer: config.origin,
      audience: `${AUDIENCE}/oauth`,
      typ: OAUTH_TX_TYP,
      currentDate: new Date(nowSec * 1000)
    });
    if (typeof payload.state !== 'string' || typeof payload.cv !== 'string') return null;
    return { state: payload.state, verifier: payload.cv, stepup: payload.stepup === true };
  } catch {
    return null;
  }
}

/** Cookie de transaction expiré (posé sur TOUTES les réponses du callback). */
export function clearOAuthTxCookie(config) {
  return serializeCookie(cookieNames(config).oauth, '', { maxAge: 0, sameSite: 'Lax', secure: config.secureCookies });
}
