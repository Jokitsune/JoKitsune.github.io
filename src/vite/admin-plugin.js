/* ================================================
   PLUGINS VITE DU PANNEAU /admin
   - adminDevApi : en `vite` (dev) avec ADMIN_DEV_MODE=1, monte les routes
     api/ dans le serveur de développement, sur le backend fichier local
     (aucun appel GitHub). Refuse de démarrer si VERCEL_ENV vaut
     « production » (ou toute valeur autre que « development »).
   - vercelHeadersPreview : en `vite preview`, applique les en-têtes de
     vercel.json (CSP stricte + Trusted Types de /admin) pour les vérifier
     localement et dans les tests e2e.
   ================================================ */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { assertDevModeAllowed, isDevModeRequested } from '../../api/_lib/config.js';

/** Convertit une requête Node (connect) en Request Web standard. */
export function toWebRequest(req) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach(x => headers.append(k, x));
    else if (v !== undefined) headers.set(k, v);
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  return new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? 'half' : undefined
  });
}

/** Écrit une Response Web dans une réponse Node. */
export async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

/**
 * @param {{ env?: Record<string, string | undefined> }} [opts]
 * @returns {import('vite').Plugin}
 */
export function adminDevApi({ env = process.env } = {}) {
  return {
    name: 'admin-dev-api',
    apply: 'serve',
    configureServer(server) {
      if (!isDevModeRequested(env)) return;
      // Garde-fou : jamais en production ni en preview Vercel
      assertDevModeAllowed(env);
      let apiPromise = null;
      server.config.logger.info('\n  ⚠ ADMIN_DEV_MODE=1 : /api servi par le backend fichier local (.admin-dev/), sans GitHub.\n');
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          // Chargé via Vite : les modifications de api/_lib sont prises en compte au rechargement
          apiPromise ??= server.ssrLoadModule('/api/_lib/app.js').then(m => m.createApi({ env, rootDir: server.config.root }));
          const api = await apiPromise;
          await sendWebResponse(res, await api.handle(toWebRequest(req)));
        } catch (err) {
          next(err);
        }
      });
    }
  };
}

/** Convertit une « source » de vercel.json (syntaxe compatible regex) en RegExp. */
export function sourceToRegExp(source) {
  return new RegExp(`^${source}$`);
}

/**
 * En-têtes applicables à un chemin, dans l'ordre de vercel.json (le dernier l'emporte).
 * @param {{ headers?: { source: string, headers: { key: string, value: string }[] }[] }} vercelConfig
 * @param {string} pathname
 */
export function headersFor(vercelConfig, pathname) {
  const out = new Map();
  for (const rule of vercelConfig.headers ?? []) {
    if (sourceToRegExp(rule.source).test(pathname)) {
      for (const { key, value } of rule.headers) out.set(key.toLowerCase(), [key, value]);
    }
  }
  return [...out.values()];
}

/** @returns {import('vite').Plugin} */
export function vercelHeadersPreview() {
  return {
    name: 'vercel-headers-preview',
    configurePreviewServer(server) {
      const vercelConfig = JSON.parse(readFileSync(path.join(server.config.root, 'vercel.json'), 'utf8'));
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        // Redirection /admin → /admin/ (comme sur Vercel)
        const redirect = (vercelConfig.redirects ?? []).find(r => r.source === pathname);
        if (redirect) {
          res.statusCode = redirect.permanent ? 308 : 307;
          res.setHeader('Location', redirect.destination);
          return res.end();
        }
        // HSTS inutile (et trompeur) en http local
        for (const [key, value] of headersFor(vercelConfig, pathname)) {
          if (key.toLowerCase() !== 'strict-transport-security') res.setHeader(key, value);
        }
        next();
      });
    }
  };
}
