/* ================================================
   UTILITAIRES HTTP — réponses JSON, erreurs normalisées, lecture bornée,
   cookies. Uniquement des objets Web standard (Request / Response / Headers).
   ================================================ */

/** Messages génériques par code d'erreur (jamais de détail interne). */
const MESSAGES = {
  BAD_REQUEST: 'Requête invalide.',
  UNAUTHENTICATED: 'Authentification requise.',
  CSRF: 'Requête refusée.',
  FORBIDDEN: 'Accès refusé.',
  STEP_UP_REQUIRED: 'Reconnexion récente requise pour cette action.',
  NOT_FOUND: 'Ressource introuvable.',
  METHOD_NOT_ALLOWED: 'Méthode non autorisée.',
  CONFLICT: 'Le contenu a été modifié entre-temps.',
  CHECKS_PENDING: 'Les vérifications de la CI sont en cours.',
  CHECKS_FAILED: 'Les vérifications de la CI ont échoué.',
  NOTHING_TO_PUBLISH: 'Aucune modification à publier.',
  LENGTH_REQUIRED: 'En-tête Content-Length requis.',
  PAYLOAD_TOO_LARGE: 'Corps de requête trop volumineux.',
  UNSUPPORTED_MEDIA_TYPE: 'Type de contenu non pris en charge.',
  VALIDATION: 'Le contenu est invalide.',
  UPLOAD_INVALID: 'Fichier refusé.',
  RATE_LIMITED: 'Trop de requêtes, réessayez plus tard.',
  INTERNAL: 'Erreur interne.',
  UPSTREAM: 'Le service GitHub a renvoyé une erreur.',
  UPSTREAM_TIMEOUT: 'Le service GitHub ne répond pas.',
  ADMIN_DISABLED: 'Administration indisponible.'
};

/** Erreur métier traduite en réponse HTTP normalisée. */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {keyof typeof MESSAGES} code
   * @param {{ details?: {path:string,code:string}[], extra?: object, headers?: Record<string,string>, reason?: string }} [opts]
   */
  constructor(status, code, opts = {}) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = opts.details;
    this.extra = opts.extra;
    this.headers = opts.headers;
    this.reason = opts.reason;
  }
}

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

/** Réponse JSON (Cache-Control: no-store). */
export function json(status, body, headers = {}) {
  const h = new Headers(BASE_HEADERS);
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return new Response(JSON.stringify(body), { status, headers: h });
}

/** Réponse d'erreur au format unique { error: { code, message, requestId, details? } }. */
export function errorResponse(err, requestId) {
  const body = { error: { code: err.code, message: MESSAGES[err.code] ?? MESSAGES.INTERNAL, requestId } };
  // details uniquement pour les 422, en chemin + code (aucun écho de valeur)
  if (err.status === 422 && Array.isArray(err.details)) body.error.details = err.details;
  if (err.extra) Object.assign(body.error, err.extra);
  return json(err.status, body, err.headers ?? {});
}

/** Identifiant de requête : x-vercel-id si présent, sinon aléatoire. */
export function getRequestId(request) {
  const id = request.headers.get('x-vercel-id');
  if (id && /^[A-Za-z0-9:_-]{1,128}$/.test(id)) return id;
  return `local-${crypto.randomUUID()}`;
}

/** IP cliente (pour le limiteur et les logs). */
export function getClientIp(request) {
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim().slice(0, 64);
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim().slice(0, 64);
  return 'unknown';
}

/**
 * Lit le corps en s'arrêtant dès que `limit` octets sont dépassés.
 * @returns {Promise<Uint8Array>}
 * @throws {ApiError} 413
 */
export async function readBoundedBody(request, limit) {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', { reason: 'body_over_limit' });
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Content-Length déclaré (entier ≥ 0) ou null. */
export function getContentLength(request) {
  const raw = request.headers.get('content-length');
  if (raw === null || !/^\d{1,12}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

/** Type MIME sans paramètres, en minuscules. */
export function getMediaType(request) {
  return (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}

/** Lit un cookie par son nom. */
export function getCookie(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

/**
 * Construit un en-tête Set-Cookie (jamais d'attribut Domain).
 * @param {string} name
 * @param {string} value
 * @param {{ maxAge: number, sameSite: 'Strict' | 'Lax', secure: boolean }} opts
 */
export function serializeCookie(name, value, { maxAge, sameSite, secure }) {
  const parts = [`${name}=${value}`, 'Path=/'];
  if (secure) parts.push('Secure');
  parts.push('HttpOnly', `SameSite=${sameSite}`, `Max-Age=${maxAge}`);
  return parts.join('; ');
}

/** Redirection (303 par défaut) avec en-têtes supplémentaires et cookies. */
export function redirect(location, status = 303, cookies = []) {
  const h = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(null, { status, headers: h });
}
