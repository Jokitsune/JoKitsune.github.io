/* ================================================
   LECTURE DES CORPS JSON — type imposé, taille vérifiée AVANT lecture,
   lecture bornée, parsing protégé.
   ================================================ */

import { ApiError, getContentLength, readBoundedBody } from './http.js';
import { requireMediaType } from './guard.js';

/**
 * @param {Request} request
 * @param {number} limit octets
 * @param {{ allowEmpty?: boolean }} [opts]
 * @returns {Promise<unknown>} undefined si corps vide autorisé
 */
export async function readJsonBody(request, limit, { allowEmpty = false } = {}) {
  const declared = getContentLength(request);
  if (allowEmpty && (declared === 0 || (declared === null && !request.headers.get('content-type')))) {
    return undefined;
  }
  requireMediaType(request, ['application/json']);
  if (declared !== null && declared > limit) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', { reason: 'declared_over_limit' });
  const bytes = await readBoundedBody(request, limit);
  if (bytes.length === 0) {
    if (allowEmpty) return undefined;
    throw new ApiError(400, 'BAD_REQUEST', { reason: 'empty_body' });
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, 'BAD_REQUEST', { reason: 'json_unreadable' });
  }
}
