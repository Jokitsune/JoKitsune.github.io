// Garde-fous HTTP : CSRF, hôte, CORS, erreurs, ordre des contrôles, débit
// (T-CSRF-01, T-CSRF-02, T-HOST-01, T-CORS-01, T-ERR-01, T-ORD-01).
import { describe, it, expect } from 'vitest';
import { ROUTES } from '../../../api/_lib/app.js';
import { setup, req, sessionCookieFor, bodyOf, makeEnv, createFakeGitHub } from './helpers.js';

const mutations = [
  ['PUT', '/api/content/projects', { baseSha: 'a'.repeat(40), data: {} }],
  ['POST', '/api/auth/logout', undefined],
  ['POST', '/api/upload?kind=image&name=x', undefined],
  ['POST', '/api/publish', { expectedHeadSha: 'a'.repeat(40) }],
  ['POST', '/api/draft/reset', { confirm: 'DISCARD' }]
];

describe('T-CSRF-01 — Origin absent ou différent ⇒ 403', () => {
  const origins = {
    absent: null,
    différent: 'https://evil.example',
    'null': 'null',
    'suffixe trompeur': 'https://jokitsune.vercel.app.evil.com',
    'avec slash final': 'https://jokitsune.vercel.app/',
    'http au lieu de https': 'http://jokitsune.vercel.app'
  };
  for (const [name, origin] of Object.entries(origins)) {
    it(`Origin ${name}`, async () => {
      const { api, gh, config, logs } = setup();
      const cookie = await sessionCookieFor(config);
      for (const [method, path, json] of mutations) {
        const res = await api.handle(req(method, path, { cookie, origin, json }));
        expect(res.status, `${method} ${path}`).toBe(403);
        expect((await bodyOf(res)).error.code).toBe('CSRF');
      }
      expect(gh.calls).toHaveLength(0);
      expect(logs.filter(l => l.includes('csrf.reject'))).toHaveLength(mutations.length);
    });
  }
});

describe('T-CSRF-02 — en-tête custom et Content-Type', () => {
  it('sans X-JK-Admin ⇒ 403', async () => {
    const { api, config } = setup();
    const cookie = await sessionCookieFor(config);
    for (const [method, path, json] of mutations) {
      const res = await api.handle(req(method, path, { cookie, csrf: false, json }));
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('X-JK-Admin avec une autre valeur ⇒ 403', async () => {
    const { api, config } = setup();
    const cookie = await sessionCookieFor(config);
    const res = await api.handle(req('PUT', '/api/content/projects', { cookie, csrf: false, headers: { 'x-jk-admin': 'true' }, json: {} }));
    expect(res.status).toBe(403);
  });

  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
    it(`Content-Type ${type} ⇒ 415 (PUT contenu, publish)`, async () => {
      const { api, config } = setup();
      const cookie = await sessionCookieFor(config, { stepUp: true });
      const body = JSON.stringify({ baseSha: 'a'.repeat(40), data: {} });
      const put = await api.handle(req('PUT', '/api/content/projects', { cookie, body, headers: { 'content-type': type } }));
      expect(put.status).toBe(415);
      const pub = await api.handle(req('POST', '/api/publish', { cookie, body, headers: { 'content-type': type } }));
      expect(pub.status).toBe(415);
    });
  }
});

describe('T-HOST-01 — hôte différent de ADMIN_ORIGIN ⇒ 404', () => {
  for (const host of ['https://jokitsune-abc123-jokitsune.vercel.app', 'https://jokitsune-git-content-draft-jokitsune.vercel.app', 'http://jokitsune.vercel.app']) {
    it(host, async () => {
      const { api, gh } = setup();
      for (const path of ['/api/auth/login', '/api/auth/callback?code=x&state=y', '/api/auth/me']) {
        const res = await api.handle(req('GET', path, { host }));
        expect(res.status).toBe(404);
        expect(res.headers.getSetCookie()).toEqual([]);
      }
      expect(gh.calls).toHaveLength(0);
    });
  }
});

describe('T-CORS-01 — aucun en-tête CORS, OPTIONS ⇒ 405', () => {
  it('OPTIONS sur chaque route ⇒ 405 avec Allow, sans Access-Control-*', async () => {
    const { api } = setup();
    for (const path of ['/api/auth/login', '/api/auth/me', '/api/content', '/api/content/projects', '/api/upload', '/api/publish', '/api/publish/status', '/api/draft/reset']) {
      const res = await api.handle(new Request(`https://jokitsune.vercel.app${path}`, {
        method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'PUT' }
      }));
      expect(res.status, path).toBe(405);
      expect(res.headers.get('allow')).toBeTruthy();
      for (const [k] of res.headers) expect(k.startsWith('access-control-')).toBe(false);
    }
  });

  it('aucune réponse (succès ou erreur) ne contient Access-Control-Allow-Origin', async () => {
    const { api, config } = setup();
    const cookie = await sessionCookieFor(config);
    const responses = await Promise.all([
      api.handle(req('GET', '/api/auth/me', { cookie, headers: { origin: 'https://evil.example' } })),
      api.handle(req('GET', '/api/auth/me')),
      api.handle(req('GET', '/api/content/projects', { cookie })),
      api.handle(req('GET', '/api/auth/login'))
    ]);
    for (const res of responses) expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('méthode non prévue ⇒ 405 + Allow', async () => {
    const { api, config } = setup();
    const cookie = await sessionCookieFor(config);
    const res = await api.handle(req('DELETE', '/api/content/projects', { cookie }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, PUT');
  });
});

describe('T-ERR-01 — exception imprévue ⇒ 500 générique', () => {
  it('ni pile, ni chemin, ni message interne dans la réponse ; pile dans le log', async () => {
    const route = ROUTES.find(r => r.path === '/api/auth/me');
    const original = route.methods.GET.run;
    route.methods.GET.run = () => { throw new TypeError('détail interne /api/_lib/secret-path.js'); };
    try {
      const { api, config, logs } = setup();
      const res = await api.handle(req('GET', '/api/auth/me', { cookie: await sessionCookieFor(config) }));
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text).error).toEqual({ code: 'INTERNAL', message: 'Erreur interne.', requestId: expect.any(String) });
      expect(text).not.toMatch(/détail interne|_lib|secret-path|TypeError/);
      const logged = logs.find(l => l.includes('http.exception'));
      expect(JSON.parse(logged)).toMatchObject({ level: 'error', errorName: 'TypeError' });
      expect(logged).toContain('secret-path');
    } finally {
      route.methods.GET.run = original;
    }
  });

  it('erreur réseau vers GitHub ⇒ 502 UPSTREAM, message GitHub jamais transmis', async () => {
    const gh = createFakeGitHub();
    gh.fetch = () => Promise.reject(new TypeError('fetch failed: getaddrinfo api.github.com'));
    const { api, config } = setup({ gh });
    const res = await api.handle(req('GET', '/api/content/projects', { cookie: await sessionCookieFor(config) }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('getaddrinfo');
  });

  it('délai dépassé ⇒ 504 UPSTREAM_TIMEOUT', async () => {
    const gh = createFakeGitHub();
    gh.fetch = () => Promise.reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    const { api, config } = setup({ gh });
    const res = await api.handle(req('GET', '/api/content/projects', { cookie: await sessionCookieFor(config) }));
    expect(res.status).toBe(504);
    expect((await bodyOf(res)).error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('GitHub 403 ⇒ 502 UPSTREAM (détail non transmis)', async () => {
    const gh = createFakeGitHub();
    const base = gh.fetch;
    gh.fetch = (url, init) => (String(url).includes('/git/ref/') ? Promise.resolve(new Response('{"message":"Resource not accessible by integration"}', { status: 403 })) : base(url, init));
    const { api, config } = setup({ gh });
    const res = await api.handle(req('GET', '/api/content/projects', { cookie: await sessionCookieFor(config) }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('integration');
  });
});

describe('T-ORD-01 — requête non authentifiée : 401 sans lire le corps', () => {
  it('PUT de 10 Mo sans session ⇒ 401, corps jamais lu', async () => {
    const { api, gh } = setup();
    let pulled = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024 * 1024));
        if (pulled >= 10) controller.close();
      }
    }, { highWaterMark: 0 });
    const request = new Request('https://jokitsune.vercel.app/api/content/projects', {
      method: 'PUT', body: stream, duplex: 'half',
      headers: { origin: 'https://jokitsune.vercel.app', 'x-jk-admin': '1', 'content-type': 'application/json', 'content-length': String(10 * 1024 * 1024) }
    });
    const res = await api.handle(request);
    expect(res.status).toBe(401);
    expect(pulled).toBe(0);
    expect(request.bodyUsed).toBe(false);
    expect(gh.calls).toHaveLength(0);
  });

  it('session valide mais Content-Length > 256 Ko ⇒ 413 avant lecture', async () => {
    const { api, config } = setup();
    const cookie = await sessionCookieFor(config);
    const res = await api.handle(req('PUT', '/api/content/projects', { cookie, body: 'x', headers: { 'content-type': 'application/json', 'content-length': String(300 * 1024) } }));
    expect(res.status).toBe(413);
  });
});

describe('Limiteur de débit en mémoire', () => {
  it('au-delà du quota ⇒ 429 + Retry-After', async () => {
    const { api, logs } = setup({ rateLimits: { auth: { capacity: 2, perMs: 60_000 }, api: { capacity: 2, perMs: 60_000 } } });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await api.handle(req('GET', '/api/auth/login', { headers: { 'x-real-ip': '1.2.3.4' } }))).status);
    expect(statuses).toEqual([302, 302, 429]);
    const res = await api.handle(req('GET', '/api/auth/login', { headers: { 'x-real-ip': '1.2.3.4' } }));
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(logs.some(l => l.includes('ratelimit.hit'))).toBe(true);
    // Une autre IP n'est pas affectée
    expect((await api.handle(req('GET', '/api/auth/login', { headers: { 'x-real-ip': '5.6.7.8' } }))).status).toBe(302);
  });
});

describe('Routes protégées', () => {
  it('sans session ⇒ 401 et aucune requête GitHub', async () => {
    const { api, gh } = setup();
    for (const path of ['/api/auth/me', '/api/content', '/api/content/projects', '/api/publish/status']) {
      const res = await api.handle(req('GET', path));
      expect(res.status, path).toBe(401);
      expect((await bodyOf(res)).error.code).toBe('UNAUTHENTICATED');
    }
    expect(gh.calls).toHaveLength(0);
  });

  it('PUBLISH_MODE=direct : routes de publication en 404', async () => {
    const { api, config } = setup({ env: makeEnv({ PUBLISH_MODE: 'direct' }) });
    const cookie = await sessionCookieFor(config);
    expect((await api.handle(req('GET', '/api/publish/status', { cookie }))).status).toBe(404);
    expect((await api.handle(req('POST', '/api/publish', { cookie, json: {} }))).status).toBe(404);
    expect((await api.handle(req('POST', '/api/draft/reset', { cookie, json: {} }))).status).toBe(404);
  });

  it('logout : 204, cookie expiré, Clear-Site-Data', async () => {
    const { api, config } = setup();
    const cookie = await sessionCookieFor(config);
    const res = await api.handle(req('POST', '/api/auth/logout', { cookie }));
    expect(res.status).toBe(204);
    expect(res.headers.get('clear-site-data')).toBe('"cookies", "storage"');
    expect(res.headers.getSetCookie()[0]).toMatch(/^__Host-jk_admin=; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=0$/);
  });

  it('réponses JSON : Content-Type et Cache-Control: no-store', async () => {
    const { api } = setup();
    const res = await api.handle(req('GET', '/api/auth/me'));
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
