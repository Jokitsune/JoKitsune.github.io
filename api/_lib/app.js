/* ================================================
   APPLICATION API — table des routes et ordre des contrôles
   host → config → méthode → débit → session → CSRF → step-up →
   taille/type → lecture bornée → parsing → validation → GitHub
   (la config est lue juste avant l'hôte : sans elle, l'origine attendue est inconnue).

   createApi() reçoit ses dépendances (env, fetch, horloge, journal) :
   tout est testable sans serveur ni réseau.
   ================================================ */

import { isContentFile } from '../../src/lib/content-guard.js';
import { loadConfig } from './config.js';
import { ApiError, errorResponse, getClientIp, getRequestId } from './http.js';
import { checkCsrf, checkHost, requireSession, requireStepUp } from './guard.js';
import { createLogger } from './log.js';
import { createRateLimiter } from './ratelimit.js';
import { createInstallationTokenProvider } from './github-app.js';
import { RepoConflictError, createGitHubRepo } from './github-api.js';
import { createDevRepo } from './dev-backend.js';
import { callback, login, logout, me } from './routes/auth.js';
import { getContent, listContent, putContent } from './routes/content.js';
import { upload } from './routes/upload.js';
import { mergeSync, publish, publishStatus, resetDraft } from './routes/publish.js';

/**
 * access : public | session | mutation ; stepUp : publication/abandon ;
 * prOnly : 404 en PUBLISH_MODE=direct ; group : seau du limiteur.
 */
export const ROUTES = [
  { path: '/api/auth/login', group: 'auth', methods: { GET: { access: 'public', run: login } } },
  { path: '/api/auth/callback', group: 'auth', methods: { GET: { access: 'public', run: callback } } },
  { path: '/api/auth/logout', group: 'auth', methods: { POST: { access: 'mutation', run: logout } } },
  { path: '/api/auth/me', group: 'api', methods: { GET: { access: 'session', run: me } } },
  { path: '/api/content', group: 'api', methods: { GET: { access: 'session', run: listContent } } },
  {
    path: '/api/content/:file',
    group: 'api',
    methods: { GET: { access: 'session', run: getContent }, PUT: { access: 'mutation', run: putContent } }
  },
  { path: '/api/upload', group: 'api', methods: { POST: { access: 'mutation', run: upload } } },
  { path: '/api/publish/status', group: 'api', prOnly: true, methods: { GET: { access: 'session', run: publishStatus } } },
  { path: '/api/publish', group: 'api', prOnly: true, methods: { POST: { access: 'mutation', stepUp: true, run: publish } } },
  { path: '/api/publish/sync', group: 'api', prOnly: true, methods: { POST: { access: 'mutation', run: mergeSync } } },
  { path: '/api/draft/reset', group: 'api', prOnly: true, methods: { POST: { access: 'mutation', stepUp: true, run: resetDraft } } }
];

/** Associe un chemin à une route (paramètre :file validé par liste blanche). */
export function matchRoute(pathname) {
  for (const route of ROUTES) {
    if (!route.path.includes(':')) {
      if (pathname === route.path) return { route, params: {} };
      continue;
    }
    const prefix = route.path.slice(0, route.path.indexOf(':'));
    if (pathname.startsWith(prefix)) {
      const segment = pathname.slice(prefix.length);
      if (isContentFile(segment)) return { route, params: { file: segment } };
    }
  }
  return null;
}

/**
 * @param {{
 *   env: Record<string, string | undefined>,
 *   fetch?: typeof fetch,
 *   now?: () => number,
 *   logSink?: (line: string) => void,
 *   rateLimits?: object,
 *   rootDir?: string
 * }} deps
 */
export function createApi({ env, fetch: fetchImpl = globalThis.fetch, now = Date.now, logSink, rateLimits, rootDir } = {}) {
  const baseLog = createLogger({ sink: logSink, now });
  const loaded = loadConfig(env);
  const config = loaded.ok ? loaded.config : null;
  const log = config ? baseLog.withLevel(config.logLevel) : baseLog;
  if (!loaded.ok && loaded.reason !== 'disabled') {
    for (const name of loaded.invalid) baseLog.error('config.invalid', { var: name, reason: loaded.reason });
  }
  const limiter = createRateLimiter({ limits: rateLimits, now });

  // Dépôt créé à la demande (jamais avant authentification)
  let repo = null;
  const getRepo = () => {
    if (!repo) {
      repo = config.devMode
        ? createDevRepo({ config, env, rootDir })
        : createGitHubRepo({ config, fetch: fetchImpl, getToken: createInstallationTokenProvider({ config, fetch: fetchImpl, now }) });
    }
    return repo;
  };

  async function dispatch(request, ctx) {
    if (!config) throw new ApiError(503, 'ADMIN_DISABLED', { reason: loaded.reason });
    checkHost(config, ctx.url);

    const match = matchRoute(ctx.url.pathname);
    if (!match || (match.route.prOnly && config.publishMode !== 'pr')) throw new ApiError(404, 'NOT_FOUND', { reason: 'no_route' });
    ctx.logFields.route = match.route.path;
    const spec = match.route.methods[request.method];
    if (!spec) {
      // OPTIONS compris : 405, jamais d'en-tête CORS
      throw new ApiError(405, 'METHOD_NOT_ALLOWED', { headers: { Allow: Object.keys(match.route.methods).join(', ') } });
    }

    const rl = limiter.take(match.route.group, ctx.ip);
    if (!rl.ok) {
      log.warn('ratelimit.hit', { ...ctx.logFields });
      throw new ApiError(429, 'RATE_LIMITED', { headers: { 'Retry-After': String(rl.retryAfter) } });
    }

    if (spec.access !== 'public') {
      ctx.session = await requireSession(config, request, ctx.nowSec);
      ctx.logFields.sid = ctx.session.sid.slice(0, 8);
      ctx.logFields.actorId = ctx.session.sub;
    }
    if (spec.access === 'mutation') {
      try {
        checkCsrf(config, request);
      } catch (err) {
        log.warn('csrf.reject', { ...ctx.logFields, reason: err.reason });
        throw err;
      }
    }
    if (spec.stepUp) requireStepUp(config, ctx.session, ctx.nowSec);

    ctx.params = match.params;
    return spec.run(ctx);
  }

  /** Point d'entrée : Request Web → Response Web. */
  async function handle(request) {
    const started = now();
    const requestId = getRequestId(request);
    const ip = getClientIp(request);
    const url = new URL(request.url);
    const ctx = {
      request,
      url,
      config,
      log,
      fetch: fetchImpl,
      requestId,
      ip,
      nowSec: Math.floor(now() / 1000),
      session: null,
      params: {},
      repo: getRepo,
      logFields: { method: request.method, requestId, ip, route: url.pathname.slice(0, 80) }
    };
    let response;
    try {
      response = await dispatch(request, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        response = errorResponse(err, requestId);
        if (err.status >= 500) log.error('http.error', { ...ctx.logFields, code: err.code, reason: err.reason });
        else if (err.reason) ctx.logFields.reason = err.reason;
      } else if (err instanceof RepoConflictError) {
        response = errorResponse(new ApiError(409, 'CONFLICT', { extra: { currentSha: null } }), requestId);
      } else {
        // Exception imprévue : réponse générique, pile uniquement dans le journal
        log.error('http.exception', { ...ctx.logFields, errorName: err?.name, stack: err?.stack });
        response = errorResponse(new ApiError(500, 'INTERNAL'), requestId);
      }
    }
    log.info('http.request', { ...ctx.logFields, status: response.status, durationMs: now() - started });
    return response;
  }

  return { handle, config };
}
