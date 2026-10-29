/* ================================================
   ROUTES D'AUTHENTIFICATION — login, callback, logout, me
   ================================================ */

import { getCookie, json, redirect } from '../http.js';
import {
  authorizeUrl, authorizeUser, createPkcePair, exchangeCode, fetchUser, revokeToken, safeEqual
} from '../oauth.js';
import {
  clearOAuthTxCookie, clearSessionCookie, cookieNames, issueOAuthTx, issueSession, sessionCookie, verifyOAuthTx
} from '../session.js';

const ADMIN_PATH = '/admin/';
const FAILURE_PATH = '/admin/?e=auth';

/** GET /api/auth/login[?stepup=1] — 302 vers GitHub (ou session directe en mode dev). */
export async function login(ctx) {
  const { config, url, log, nowSec } = ctx;
  const stepup = url.searchParams.get('stepup') === '1';

  if (config.devMode) {
    // Mode développement : aucune requête GitHub, session pour l'utilisateur fictif
    const { token, sid } = await issueSession(config, { id: config.adminGithubId, login: config.adminGithubLogin }, nowSec);
    log.info('auth.success', { ...ctx.logFields, sid: sid.slice(0, 8), actorId: config.adminGithubId, devMode: true });
    return redirect(ADMIN_PATH, 302, [sessionCookie(config, token)]);
  }

  const { state, verifier, challenge } = createPkcePair();
  const txCookie = await issueOAuthTx(config, { state, verifier, stepup }, nowSec);
  log.info('auth.login_start', { ...ctx.logFields, reason: stepup ? 'stepup' : 'login' });
  return redirect(authorizeUrl(config, { state, challenge }), 302, [txCookie]);
}

/** GET /api/auth/callback?code&state — échecs unifiés vers /admin/?e=auth. */
export async function callback(ctx) {
  const { config, url, request, log, nowSec, fetch: fetchImpl } = ctx;
  const clearTx = clearOAuthTxCookie(config);
  const fail = (event, fields = {}) => {
    log.warn(event, { ...ctx.logFields, ...fields });
    return redirect(FAILURE_PATH, 303, [clearTx]);
  };

  if (config.devMode) return fail('auth.denied', { reason: 'dev_mode_no_oauth' });

  const tx = await verifyOAuthTx(config, getCookie(request, cookieNames(config).oauth), nowSec);
  if (!tx) return fail('auth.state_invalid', { reason: 'tx_cookie_invalid' });
  if (url.searchParams.has('error')) return fail('auth.denied', { reason: 'user_denied' });
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!safeEqual(state ?? '', tx.state)) return fail('auth.state_invalid', { reason: 'state_mismatch' });
  if (!code || code.length > 256) return fail('auth.denied', { reason: 'code_missing' });

  let token = null;
  let user;
  try {
    token = await exchangeCode(fetchImpl, config, { code, verifier: tx.verifier });
    user = await fetchUser(fetchImpl, token);
  } catch (err) {
    return fail('auth.denied', { reason: err?.reason ?? 'oauth_error' });
  } finally {
    // Révocation immédiate du jeton utilisateur, quel que soit le résultat
    if (token) {
      await revokeToken(fetchImpl, config, token).catch(() => log.warn('auth.revoke_failed', { ...ctx.logFields }));
    }
  }

  const decision = authorizeUser(config, user);
  if (!decision.ok) {
    if (decision.reason === 'login_mismatch') {
      return fail('auth.login_mismatch', { reason: decision.reason, githubId: user.id, login: user.login });
    }
    return fail('auth.denied', { reason: decision.reason, githubId: user.id, login: user.login });
  }

  const { token: jwt, sid } = await issueSession(config, user, nowSec);
  log.info('auth.success', { ...ctx.logFields, sid: sid.slice(0, 8), actorId: user.id, login: user.login, reason: tx.stepup ? 'stepup' : 'login' });
  return redirect(tx.stepup ? '/admin/?stepup=ok' : ADMIN_PATH, 303, [clearTx, sessionCookie(config, jwt)]);
}

/** POST /api/auth/logout — 204, cookie expiré + Clear-Site-Data. */
export async function logout(ctx) {
  const h = new Headers({ 'Cache-Control': 'no-store', 'Clear-Site-Data': '"cookies", "storage"' });
  h.append('Set-Cookie', clearSessionCookie(ctx.config));
  ctx.log.info('auth.logout', { ...ctx.logFields });
  return new Response(null, { status: 204, headers: h });
}

/** GET /api/auth/me — état de la session. */
export async function me(ctx) {
  const { config, session, nowSec } = ctx;
  return json(200, {
    login: session.login,
    id: session.sub,
    expiresAt: new Date(session.exp * 1000).toISOString(),
    authTime: new Date(session.authTime * 1000).toISOString(),
    stepUpValid: nowSec - session.authTime <= config.stepUpMaxAge,
    publishMode: config.publishMode,
    previewUrl: config.previewUrl,
    devMode: config.devMode
  });
}
