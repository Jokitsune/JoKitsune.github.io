/* Outils partagés par les tests de l'API admin : environnement valide,
   faux GitHub (fetch simulé), cookies de session, requêtes. */

import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from '../../../api/_lib/app.js';
import { loadConfig } from '../../../api/_lib/config.js';
import { issueSession, cookieNames } from '../../../api/_lib/session.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const ORIGIN = 'https://jokitsune.vercel.app';
export const ADMIN_ID = '12345678';
export const ADMIN_LOGIN = 'Jokitsune';
export const REPO_ID = '987654321';

// Valeurs sentinelles : ne doivent JAMAIS apparaître dans un log (T-LOG-01)
export const SENTINEL = 'SECRET_SENTINEL';
export const CLIENT_SECRET = `${SENTINEL}_CLIENT_${'x'.repeat(30)}`;
export const USER_TOKEN = `${SENTINEL}_USER_TOKEN`;
export const INSTALLATION_TOKEN = `${SENTINEL}_INSTALLATION_TOKEN`;
export const OAUTH_CODE = `${SENTINEL}_CODE`;

let keyCache = null;
/** Clé RSA de test (PKCS#1, comme celles générées par GitHub). */
export function testPrivateKey() {
  keyCache ??= generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  return keyCache;
}

/** Secret de session de test : préfixe sentinelle encodé, ≥ 32 octets. */
export const SESSION_SECRET = Buffer.concat([Buffer.from(`${SENTINEL}_SESSION`), randomBytes(16)]).toString('base64url');

/** Environnement de production valide (modifiable). */
export function makeEnv(overrides = {}) {
  return {
    VERCEL_ENV: 'production',
    ADMIN_ENABLED: 'true',
    ADMIN_ORIGIN: ORIGIN,
    ADMIN_GITHUB_ID: ADMIN_ID,
    ADMIN_GITHUB_LOGIN: ADMIN_LOGIN,
    GITHUB_OAUTH_CLIENT_ID: 'Iv1.testclientid',
    GITHUB_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
    GITHUB_APP_ID: '424242',
    GITHUB_APP_INSTALLATION_ID: '7777777',
    GITHUB_APP_PRIVATE_KEY_B64: Buffer.from(testPrivateKey()).toString('base64'),
    GITHUB_REPO_OWNER: 'Jokitsune',
    GITHUB_REPO_NAME: 'JoKitsune.github.io',
    GITHUB_REPO_ID: REPO_ID,
    CONTENT_BASE_BRANCH: 'main',
    CONTENT_DRAFT_BRANCH: 'content/draft',
    PUBLISH_MODE: 'pr',
    DRAFT_PREVIEW_URL: 'https://jokitsune-git-content-draft-jokitsune.vercel.app',
    SESSION_SECRET,
    SESSION_VERSION: '1',
    ...overrides
  };
}

const blobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const fakeSha = s => createHash('sha1').update(s).digest('hex');

/** Contenu réel d'un fichier du dépôt. */
export function repoFile(rel) {
  return readFileSync(path.join(ROOT, rel));
}

/**
 * Faux GitHub en mémoire : OAuth + API REST utilisée par l'admin.
 * `state` est exposé pour que les tests modifient le scénario.
 */
export function createFakeGitHub({ user = { id: Number(ADMIN_ID), login: ADMIN_LOGIN, type: 'User' } } = {}) {
  const calls = [];
  const files = { main: new Map(), 'content/draft': null };
  for (const name of ['site', 'ui', 'skills', 'projects', 'timeline', 'cards']) {
    files.main.set(`content/${name}.json`, Buffer.from(repoFile(`content/${name}.json`).toString('utf8').replace(/\r\n/g, '\n')));
  }
  const state = {
    user,
    tokenResponse: { access_token: USER_TOKEN, token_type: 'bearer', scope: '' },
    refs: { main: fakeSha('main-0'), 'content/draft': null },
    ahead: 0,
    pr: null,
    checks: [{ status: 'completed', conclusion: 'success' }],
    putConflict: false,
    mergeConflict: false,
    files,
    revoked: []
  };

  const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const branchFiles = b => (b === 'main' ? state.files.main : state.files['content/draft']);

  async function fetchImpl(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, url: url.toString(), pathname: url.pathname, headers, body });

    if (url.origin === 'https://github.com' && url.pathname === '/login/oauth/access_token') return json(200, state.tokenResponse);
    if (url.pathname === '/user') return json(200, state.user);
    if (/^\/applications\/[^/]+\/token$/.test(url.pathname) && method === 'DELETE') {
      state.revoked.push(body.access_token);
      return new Response(null, { status: 204 });
    }
    if (/^\/app\/installations\/\d+\/access_tokens$/.test(url.pathname)) {
      return json(201, { token: INSTALLATION_TOKEN, expires_at: new Date(Date.now() + 3600_000).toISOString() });
    }
    const m = url.pathname.match(/^\/repos\/Jokitsune\/JoKitsune\.github\.io(\/.*)$/);
    if (!m) return json(404, { message: 'Not Found' });
    const p = decodeURIComponent(m[1]);

    let r;
    if ((r = p.match(/^\/git\/ref\/heads\/(.+)$/))) {
      const sha = state.refs[r[1]];
      return sha ? json(200, { object: { sha } }) : json(404, { message: 'Not Found' });
    }
    if (p === '/git/refs' && method === 'POST') {
      const branch = body.ref.replace('refs/heads/', '');
      state.refs[branch] = body.sha;
      state.files[branch] = new Map(state.files.main);
      return json(201, { ref: body.ref, object: { sha: body.sha } });
    }
    if ((r = p.match(/^\/git\/refs\/heads\/(.+)$/)) && method === 'PATCH') {
      state.refs[r[1]] = body.sha;
      if (body.sha === state.refs.main) {
        state.files[r[1]] = new Map(state.files.main);
        state.ahead = 0;
      }
      return json(200, { object: { sha: body.sha } });
    }
    if ((r = p.match(/^\/contents\/(.+)$/))) {
      const filePath = r[1];
      if (method === 'GET') {
        const branch = url.searchParams.get('ref');
        const map = branchFiles(branch);
        if (!map) return json(404, { message: 'No commit found for the ref' });
        if (filePath === 'content') {
          return json(200, [...map.entries()].filter(([k]) => k.startsWith('content/')).map(([k, v]) => ({ name: k.slice(8), sha: blobSha(v), size: v.length, type: 'file' })));
        }
        const bytes = map.get(filePath);
        if (!bytes) return json(404, { message: 'Not Found' });
        return json(200, { type: 'file', sha: blobSha(bytes), size: bytes.length, encoding: 'base64', content: bytes.toString('base64') });
      }
      if (method === 'PUT') {
        const map = branchFiles(body.branch);
        const current = map.get(filePath);
        if (state.putConflict || (current && blobSha(current) !== body.sha)) return json(409, { message: `${filePath} does not match ${body.sha}` });
        if (current && !body.sha) return json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
        const bytes = Buffer.from(body.content, 'base64');
        map.set(filePath, bytes);
        state.refs[body.branch] = fakeSha(`${state.refs[body.branch]}:${filePath}`);
        if (body.branch !== 'main') state.ahead += 1;
        return json(200, { content: { sha: blobSha(bytes) }, commit: { sha: state.refs[body.branch] } });
      }
    }
    if (p.startsWith('/compare/')) return json(200, { ahead_by: state.ahead });
    if (p === '/pulls' && method === 'GET') return json(200, state.pr ? [state.pr] : []);
    if (p === '/pulls' && method === 'POST') {
      state.pr = { number: 12, html_url: 'https://github.com/Jokitsune/JoKitsune.github.io/pull/12', head: { sha: state.refs['content/draft'] } };
      return json(201, state.pr);
    }
    if (/^\/pulls\/\d+$/.test(p) && method === 'PATCH') {
      state.pr = null;
      return json(200, { state: 'closed' });
    }
    if (/^\/pulls\/\d+\/merge$/.test(p) && method === 'PUT') {
      if (state.mergeConflict || body.sha !== state.refs['content/draft']) return json(409, { message: 'Head branch was modified' });
      state.refs.main = fakeSha(`merge:${body.sha}`);
      state.files.main = new Map(state.files['content/draft']);
      state.pr = null;
      return json(200, { merged: true, sha: state.refs.main });
    }
    if (/^\/commits\/[^/]+\/check-runs$/.test(p)) return json(200, { total_count: state.checks.length, check_runs: state.checks });
    return json(404, { message: 'Not Found' });
  }

  return { fetch: fetchImpl, calls, state, blobSha };
}

/**
 * API de test avec journal capturé.
 * @returns {{ api, logs: string[], gh, config }}
 */
export function setup({ env = makeEnv(), gh = createFakeGitHub(), now = () => Date.now(), rateLimits } = {}) {
  const logs = [];
  const api = createApi({ env, fetch: gh.fetch, now, logSink: line => logs.push(line), rateLimits });
  return { api, logs, gh, config: loadConfig(env).config, now };
}

/** Cookie de session valide (auth_time = maintenant − authAgeSec). */
export async function sessionCookieFor(config, { authAgeSec = 0, user = { id: ADMIN_ID, login: ADMIN_LOGIN } } = {}) {
  const now = Math.floor(Date.now() / 1000) - authAgeSec;
  const { token } = await issueSession(config, user, now);
  return `${cookieNames(config).session}=${token}`;
}

/**
 * Construit une requête vers l'API.
 * @param {string} method
 * @param {string} pathWithQuery
 * @param {{ cookie?: string, origin?: string | null, csrf?: boolean, json?: unknown, body?: BodyInit, headers?: Record<string,string>, host?: string }} [opts]
 */
export function req(method, pathWithQuery, opts = {}) {
  const headers = new Headers(opts.headers ?? {});
  if (opts.cookie) headers.set('cookie', opts.cookie);
  const origin = opts.origin === undefined ? (method === 'GET' ? null : ORIGIN) : opts.origin;
  if (origin) headers.set('origin', origin);
  if (opts.csrf !== false && method !== 'GET') headers.set('x-jk-admin', '1');
  let body = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  }
  return new Request(`${opts.host ?? ORIGIN}${pathWithQuery}`, { method, headers, body });
}

export async function bodyOf(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
