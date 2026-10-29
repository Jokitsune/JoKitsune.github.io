/* ================================================
   GARDES — hôte, session, CSRF (Origin + en-tête custom), step-up, type
   ================================================ */

import { ApiError, getCookie, getMediaType } from './http.js';
import { cookieNames, verifySession } from './session.js';

/** L'hôte de la requête doit être exactement celui de ADMIN_ORIGIN (sinon 404). */
export function checkHost(config, url) {
  if (url.host !== config.host || `${url.protocol}//${url.host}` !== config.origin) {
    throw new ApiError(404, 'NOT_FOUND', { reason: 'host_mismatch' });
  }
}

/** Session valide obligatoire (sinon 401). */
export async function requireSession(config, request, nowSec) {
  const token = getCookie(request, cookieNames(config).session);
  const session = await verifySession(config, token, nowSec);
  if (!session) throw new ApiError(401, 'UNAUTHENTICATED', { reason: token ? 'session_invalid' : 'no_session' });
  return session;
}

/**
 * CSRF : Origin présent et strictement égal à ADMIN_ORIGIN, et X-JK-Admin: 1.
 * Aucun repli sur Referer.
 */
export function checkCsrf(config, request) {
  const origin = request.headers.get('origin');
  if (origin === null) throw new ApiError(403, 'CSRF', { reason: 'origin_missing' });
  if (origin !== config.origin) throw new ApiError(403, 'CSRF', { reason: 'origin_mismatch' });
  if (request.headers.get('x-jk-admin') !== '1') throw new ApiError(403, 'CSRF', { reason: 'header_missing' });
}

/** Authentification récente exigée pour les opérations à fort impact. */
export function requireStepUp(config, session, nowSec) {
  if (nowSec - session.authTime > config.stepUpMaxAge) {
    throw new ApiError(403, 'STEP_UP_REQUIRED', { reason: 'auth_too_old' });
  }
}

/** Content-Type imposé (sinon 415). */
export function requireMediaType(request, allowed) {
  const type = getMediaType(request);
  if (!allowed.includes(type)) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', { reason: `type_${type || 'none'}` });
  return type;
}
