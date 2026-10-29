// Lecture / écriture du contenu (T-VAL-01 à T-VAL-08, T-GIT-01, T-GIT-03, T-GIT-04).
import { describe, it, expect, beforeEach } from 'vitest';
import { setup, req, sessionCookieFor, bodyOf, REPO_ID, INSTALLATION_TOKEN } from './helpers.js';

let ctx;
let cookie;

beforeEach(async () => {
  ctx = setup();
  cookie = await sessionCookieFor(ctx.config);
});

const get = (file, q = '') => ctx.api.handle(req('GET', `/api/content/${file}${q}`, { cookie }));
const put = (file, json) => ctx.api.handle(req('PUT', `/api/content/${file}`, { cookie, json }));

async function load(file = 'projects') {
  const res = await get(file);
  expect(res.status).toBe(200);
  return bodyOf(res);
}

async function expectValidation(mutate, expectedCode, file = 'projects') {
  const current = await load(file);
  const data = structuredClone(current.data);
  mutate(data);
  const res = await put(file, { baseSha: current.sha, data });
  expect(res.status).toBe(422);
  const body = await bodyOf(res);
  expect(body.error.code).toBe('VALIDATION');
  if (expectedCode) expect(body.error.details.map(d => d.code)).toContain(expectedCode);
  // Aucune écriture tentée
  expect(ctx.gh.calls.some(c => c.method === 'PUT')).toBe(false);
  return body;
}

describe('Lecture', () => {
  it('GET /api/content liste les fichiers (brouillon absent ⇒ base)', async () => {
    const body = await bodyOf(await ctx.api.handle(req('GET', '/api/content', { cookie })));
    expect(body.branch).toBe('main');
    expect(body.files.map(f => f.file)).toEqual(['site', 'ui', 'skills', 'projects', 'timeline', 'cards']);
    expect(body.files.every(f => /^[0-9a-f]{40}$/.test(f.sha))).toBe(true);
  });

  it('GET /api/content/:file renvoie data, sha et ETag ; ne crée pas la branche brouillon', async () => {
    const res = await get('projects');
    const body = await bodyOf(res);
    expect(body).toMatchObject({ file: 'projects', ref: 'draft' });
    expect(res.headers.get('etag')).toBe(`"${body.sha}"`);
    expect(body.data.projects.length).toBeGreaterThan(0);
    expect(ctx.gh.calls.some(c => c.method !== 'GET' && !c.url.includes('access_tokens'))).toBe(false);
  });

  it('?ref=main lit la base ; autre valeur ⇒ 400', async () => {
    expect((await bodyOf(await get('site', '?ref=main'))).branch).toBe('main');
    expect((await get('site', '?ref=../../x')).status).toBe(400);
  });
});

describe('T-VAL-01 — :file hors liste blanche ⇒ 404', () => {
  for (const file of ['../package', 'projects.json', '%2e%2e', '%2e%2e%2fpackage', 'PROJECTS', 'schema', 'secrets', '', 'projects/x', 'a'.repeat(41)]) {
    it(`« ${file} »`, async () => {
      const g = await ctx.api.handle(req('GET', `/api/content/${file}`, { cookie }));
      expect(g.status).toBe(404);
      const p = await ctx.api.handle(req('PUT', `/api/content/${file}`, { cookie, json: { baseSha: 'a'.repeat(40), data: {} } }));
      expect(p.status).toBe(404);
    });
  }
});

describe('T-VAL-02 — clés inconnues et prototype', () => {
  it('clé inconnue ⇒ 422 unknown_key', async () => {
    await expectValidation(d => { d.projects[0].evil = 'x'; }, 'unknown_key');
  });

  it('__proto__ et constructor ⇒ 422, aucune pollution de Object.prototype', async () => {
    const current = await load();
    const raw = JSON.stringify({ baseSha: current.sha, data: current.data })
      .replace('"projects":[{', '"projects":[{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},');
    const res = await ctx.api.handle(req('PUT', '/api/content/projects', { cookie, body: raw, headers: { 'content-type': 'application/json' } }));
    expect(res.status).toBe(422);
    const codes = (await bodyOf(res)).error.details.map(d => d.code);
    expect(codes).toContain('forbidden_key');
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
  });

  it('champ inconnu dans l’enveloppe ⇒ 400 ; JSON illisible ⇒ 400', async () => {
    const current = await load();
    expect((await put('projects', { baseSha: current.sha, data: current.data, extra: 1 })).status).toBe(400);
    const bad = await ctx.api.handle(req('PUT', '/api/content/projects', { cookie, body: '{"baseSha":', headers: { 'content-type': 'application/json' } }));
    expect(bad.status).toBe(400);
    expect((await bodyOf(bad)).error.code).toBe('BAD_REQUEST');
  });

  it('baseSha absent ou mal formé ⇒ 400', async () => {
    const current = await load();
    expect((await put('projects', { data: current.data })).status).toBe(400);
    expect((await put('projects', { baseSha: 'HEAD', data: current.data })).status).toBe(400);
  });
});

describe('T-VAL-03 — bilingue et longueurs', () => {
  it('« en » manquant ⇒ 422', async () => {
    await expectValidation(d => { d.projects[0].title = { fr: 'Titre' }; }, 'required');
  });
  it('« fr » manquant ⇒ 422', async () => {
    await expectValidation(d => { d.projects[0].title = { en: 'Title' }; });
  });
  it('champ trop long ⇒ 422 too_long', async () => {
    await expectValidation(d => { d.projects[0].description.fr = 'x'.repeat(2001); }, 'too_long');
  });
  it('les détails ne renvoient jamais la valeur soumise', async () => {
    const body = await expectValidation(d => { d.projects[0].title.fr = 'VALEUR_SECRETE<script>'; });
    expect(JSON.stringify(body)).not.toContain('VALEUR_SECRETE');
    expect(body.error.details[0]).toEqual({ path: 'projects[0].title.fr', code: 'html_forbidden' });
  });
});

describe('T-VAL-04 — HTML interdit, <br> normalisé', () => {
  for (const payload of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<a href="https://x">x</a>', '<svg onload=1>', '<!-- x -->', '<br onclick=x>', '</p>', '<?xml ?>']) {
    it(`« ${payload} » ⇒ 422 html_forbidden`, async () => {
      await expectValidation(d => { d.projects[0].title.fr = `Titre ${payload}`; }, 'html_forbidden');
    });
  }

  it('<br>, <BR/>, <br /> normalisés en \\n', async () => {
    const current = await load();
    const data = structuredClone(current.data);
    data.projects[0].description.fr = 'a<br>b<BR/>c<br />d';
    const res = await put('projects', { baseSha: current.sha, data });
    expect(res.status).toBe(200);
    const written = ctx.gh.state.files['content/draft'].get('content/projects.json').toString('utf8');
    expect(JSON.parse(written).projects[0].description.fr).toBe('a\nb\nc\nd');
  });

  it('« a < b » : refusé par le schéma existant (plus strict que la spec : aucun chevron)', async () => {
    await expectValidation(d => { d.projects[0].title.fr = 'a < b'; }, 'html_forbidden');
  });
});

describe('T-VAL-05 — URL', () => {
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>x</script>', 'http://example.com', '\u0001 https://example.com', ' https://example.com', 'vbscript:x']) {
    it(`« ${JSON.stringify(url)} » ⇒ 422`, async () => {
      await expectValidation(d => { d.projects[0].links[0].url = url; });
    });
  }

  it('https://github.com/JoKitsune accepté', async () => {
    const current = await load();
    const data = structuredClone(current.data);
    data.projects[0].links[0].url = 'https://github.com/JoKitsune/autre';
    expect((await put('projects', { baseSha: current.sha, data })).status).toBe(200);
  });
});

describe('T-VAL-06 — caractères bidi et de contrôle', () => {
  it('U+202E ⇒ 422 bidi_forbidden', async () => {
    await expectValidation(d => { d.projects[0].title.fr = 'abc‮def'; }, 'bidi_forbidden');
  });
  it('U+0007 ⇒ 422 control_char', async () => {
    await expectValidation(d => { d.projects[0].title.fr = 'abc\u0007'; }, 'control_char');
  });
});

describe('T-VAL-07 — listes', () => {
  it('id dupliqué ⇒ 422 duplicate_id', async () => {
    await expectValidation(d => { d.projects[1].id = d.projects[0].id; }, 'duplicate_id');
  });
  it('order négatif ⇒ 422', async () => {
    await expectValidation(d => { d.projects[0].order = -1; }, 'out_of_range');
  });
  it('order non entier ⇒ 422', async () => {
    await expectValidation(d => { d.projects[0].order = 1.5; });
  });
  it('visible: "true" (chaîne) ⇒ 422', async () => {
    await expectValidation(d => { d.projects[0].visible = 'true'; }, 'invalid_type');
  });
});

describe('T-VAL-08 — taille et profondeur', () => {
  it('corps > 256 Ko ⇒ 413', async () => {
    const current = await load();
    const data = structuredClone(current.data);
    data.projects[0].description.fr = 'x'.repeat(300 * 1024);
    const res = await put('projects', { baseSha: current.sha, data });
    expect(res.status).toBe(413);
  });

  it('corps > 256 Ko sans Content-Length (lecture bornée) ⇒ 413', async () => {
    const big = new TextEncoder().encode(JSON.stringify({ x: 'y'.repeat(300 * 1024) }));
    const stream = new ReadableStream({ start(c) { c.enqueue(big); c.close(); } });
    const request = new Request('https://jokitsune.vercel.app/api/content/projects', {
      method: 'PUT', body: stream, duplex: 'half',
      headers: { cookie, origin: 'https://jokitsune.vercel.app', 'x-jk-admin': '1', 'content-type': 'application/json' }
    });
    expect((await ctx.api.handle(request)).status).toBe(413);
  });

  it('profondeur > 6 ⇒ 422 too_deep', async () => {
    await expectValidation(d => { d.projects[0].links[0].label = { fr: { a: { b: 'x' } }, en: 'x' }; }, 'too_deep');
  });
});

describe('Écriture et verrou optimiste', () => {
  it('écriture réussie sur content/draft (créée depuis main), message Conventional + trailers', async () => {
    const current = await load();
    const data = structuredClone(current.data);
    data.projects[0].title.fr = 'Nouveau titre';
    const res = await put('projects', { baseSha: current.sha, data, summary: 'titre du scanner\nInjected: trailer' });
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body).toMatchObject({ file: 'projects', branch: 'content/draft', unchanged: false });
    expect(ctx.gh.calls.find(c => c.pathname.endsWith('/git/refs') && c.method === 'POST').body).toMatchObject({ ref: 'refs/heads/content/draft' });
    const putCall = ctx.gh.calls.find(c => c.method === 'PUT' && c.pathname.includes('/contents/'));
    expect(putCall.body.branch).toBe('content/draft');
    expect(putCall.body.sha).toBe(current.sha);
    expect(putCall.body.author).toBeUndefined();
    expect(putCall.body.committer).toBeUndefined();
    const lines = putCall.body.message.split('\n');
    expect(lines[0]).toBe('content(projects): titre du scannerInjected trailer');
    expect(putCall.body.message).toMatch(/\nAdmin-Actor: Jokitsune \(id 12345678\)\nAdmin-Session: [0-9a-f]{8}\nAdmin-Request-Id: /);
    expect(putCall.body.message.match(/Admin-Actor/g)).toHaveLength(1);
  });

  it('sérialisation canonique stable (LF final)', async () => {
    const current = await load();
    const data = structuredClone(current.data);
    data.projects[0].title.fr = 'Titre';
    await put('projects', { baseSha: current.sha, data });
    const written = ctx.gh.state.files['content/draft'].get('content/projects.json').toString('utf8');
    expect(written.endsWith('}\n')).toBe(true);
    expect(written).not.toContain('\r');
  });

  it('T-GIT-03 — jeton d’installation re-restreint au dépôt et aux permissions prévues, mis en cache', async () => {
    const current = await load();
    const data = structuredClone(current.data);
    data.projects[0].title.fr = 'A';
    await put('projects', { baseSha: current.sha, data });
    const tokenCalls = ctx.gh.calls.filter(c => c.pathname.endsWith('/access_tokens'));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0].pathname).toBe('/app/installations/7777777/access_tokens');
    expect(tokenCalls[0].body).toEqual({
      repository_ids: [Number(REPO_ID)],
      permissions: { contents: 'write', pull_requests: 'write', checks: 'read', metadata: 'read' }
    });
    // JWT d'application RS256, iss = GITHUB_APP_ID
    const jwt = tokenCalls[0].headers.get('authorization').replace('Bearer ', '');
    const [header, payload] = jwt.split('.').slice(0, 2).map(p => JSON.parse(Buffer.from(p, 'base64url').toString()));
    expect(header.alg).toBe('RS256');
    expect(payload.iss).toBe('424242');
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
    // Appels au dépôt avec le jeton d'installation
    const repoCalls = ctx.gh.calls.filter(c => c.pathname.startsWith('/repos/'));
    expect(repoCalls.every(c => c.headers.get('authorization') === `Bearer ${INSTALLATION_TOKEN}`)).toBe(true);
  });

  it('T-GIT-04 — JSON identique ⇒ unchanged: true, aucun appel d’écriture', async () => {
    const current = await load();
    const res = await put('projects', { baseSha: current.sha, data: current.data });
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).unchanged).toBe(true);
    expect(ctx.gh.calls.some(c => ['PUT', 'POST', 'PATCH'].includes(c.method) && c.pathname.startsWith('/repos/'))).toBe(false);
  });

  it('baseSha périmé ⇒ 409 CONFLICT avec currentSha, sans tentative d’écriture', async () => {
    const current = await load();
    const res = await put('projects', { baseSha: 'f'.repeat(40), data: current.data });
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error).toMatchObject({ code: 'CONFLICT', currentSha: current.sha });
    expect(ctx.gh.calls.some(c => c.method === 'PUT')).toBe(false);
  });

  it('T-GIT-01 — 409 de l’API Contents ⇒ 409 CONFLICT + currentSha relu, une seule tentative', async () => {
    const current = await load();
    const data = structuredClone(current.data);
    data.projects[0].title.fr = 'B';
    ctx.gh.state.putConflict = true;
    const res = await put('projects', { baseSha: current.sha, data });
    expect(res.status).toBe(409);
    const body = await bodyOf(res);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.currentSha).toMatch(/^[0-9a-f]{40}$/);
    expect(ctx.gh.calls.filter(c => c.method === 'PUT')).toHaveLength(1);
    expect(ctx.logs.some(l => l.includes('content.conflict'))).toBe(true);
  });

  it('deux écritures successives : la seconde avec l’ancien sha ⇒ 409', async () => {
    const current = await load();
    const a = structuredClone(current.data);
    a.projects[0].title.fr = 'A1';
    expect((await put('projects', { baseSha: current.sha, data: a })).status).toBe(200);
    const b = structuredClone(current.data);
    b.projects[0].title.fr = 'B1';
    expect((await put('projects', { baseSha: current.sha, data: b })).status).toBe(409);
  });
});
