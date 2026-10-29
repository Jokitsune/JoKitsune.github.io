/* ================================================
   CLIENT DE L'API ADMIN
   - cookies same-origin uniquement (la session est HttpOnly, jamais lue en JS) ;
   - en-tête X-JK-Admin: 1 + Content-Type exact sur chaque mutation (CSRF) ;
   - aucune donnée stockée dans localStorage / sessionStorage.
   ================================================ */

export class AdminApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? `HTTP ${status}`);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = body?.error?.code ?? 'INTERNAL';
    this.details = body?.error?.details ?? [];
    this.body = body?.error ?? {};
  }
}

/**
 * @param {string} method
 * @param {string} path chemin /api/…
 * @param {{ json?: unknown, body?: Blob | ArrayBuffer, contentType?: string, headers?: Record<string,string> }} [opts]
 */
export async function apiRequest(method, path, opts = {}) {
  const headers = { Accept: 'application/json', ...(opts.headers ?? {}) };
  let body;
  if (method !== 'GET') headers['X-JK-Admin'] = '1';
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = opts.contentType;
    body = opts.body;
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body, credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
  } catch {
    throw new AdminApiError(0, { error: { code: 'NETWORK', message: 'Réseau indisponible.' } });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new AdminApiError(res.status, data);
  return data;
}

export const api = {
  me: () => apiRequest('GET', '/api/auth/me'),
  logout: () => apiRequest('POST', '/api/auth/logout'),
  listContent: () => apiRequest('GET', '/api/content'),
  getContent: (file, ref = 'draft') => apiRequest('GET', `/api/content/${encodeURIComponent(file)}?ref=${ref}`),
  putContent: (file, payload) => apiRequest('PUT', `/api/content/${encodeURIComponent(file)}`, { json: payload }),
  upload: (query, blob, contentType, baseSha) =>
    apiRequest('POST', `/api/upload?${new URLSearchParams(query)}`, {
      body: blob,
      contentType,
      headers: baseSha ? { 'X-Base-Sha': baseSha } : {}
    }),
  publishStatus: () => apiRequest('GET', '/api/publish/status'),
  publish: expectedHeadSha => apiRequest('POST', '/api/publish', { json: { expectedHeadSha } }),
  resetDraft: () => apiRequest('POST', '/api/draft/reset', { json: { confirm: 'DISCARD' } })
};
