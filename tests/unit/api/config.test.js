// Configuration « fail closed » (T-CFG-01, T-CFG-02) et verrou du mode développement.
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, assertDevModeAllowed, DevModeForbiddenError } from '../../../api/_lib/config.js';
import { createApi } from '../../../api/_lib/app.js';
import { createDevRepo } from '../../../api/_lib/dev-backend.js';
import { adminDevApi } from '../../../src/vite/admin-plugin.js';
import { makeEnv, req, bodyOf, setup, ROOT } from './helpers.js';

const ROUTES = [
  ['GET', '/api/auth/login'], ['GET', '/api/auth/callback?code=a&state=b'], ['POST', '/api/auth/logout'],
  ['GET', '/api/auth/me'], ['GET', '/api/content'], ['GET', '/api/content/projects'], ['PUT', '/api/content/projects'],
  ['POST', '/api/upload?kind=cv&lang=fr'], ['GET', '/api/publish/status'], ['POST', '/api/publish'], ['POST', '/api/draft/reset']
];

describe('T-CFG-01 — variable absente ou mal formée ⇒ 503 partout, log du NOM seulement', () => {
  const cases = {
    // Valeur hors alphabet hexadécimal : « abc » apparaissait parfois par hasard dans les UUID des requestId
    'ADMIN_GITHUB_ID non numérique': { ADMIN_GITHUB_ID: 'pas-un-id' },
    'ADMIN_GITHUB_ID absent': { ADMIN_GITHUB_ID: undefined },
    'SESSION_SECRET < 32 octets': { SESSION_SECRET: Buffer.alloc(16, 1).toString('base64url') },
    'ADMIN_ORIGIN avec slash final': { ADMIN_ORIGIN: 'https://jokitsune.vercel.app/' },
    'ADMIN_ORIGIN en http': { ADMIN_ORIGIN: 'http://jokitsune.vercel.app' },
    'clé privée invalide': { GITHUB_APP_PRIVATE_KEY_B64: Buffer.from('pas une clé').toString('base64') },
    'client secret trop court': { GITHUB_OAUTH_CLIENT_SECRET: 'court' },
    'brouillon hors content/*': { CONTENT_DRAFT_BRANCH: 'main' },
    'PUBLISH_MODE inconnu': { PUBLISH_MODE: 'yolo' }
  };
  for (const [name, overrides] of Object.entries(cases)) {
    it(name, async () => {
      const env = makeEnv(overrides);
      const { api, logs } = setup({ env });
      for (const [method, p] of ROUTES) {
        const res = await api.handle(req(method, p, { json: method === 'GET' ? undefined : {} }));
        expect(res.status, `${method} ${p}`).toBe(503);
        expect((await bodyOf(res)).error.code).toBe('ADMIN_DISABLED');
      }
      const configLogs = logs.filter(l => l.includes('config.invalid'));
      expect(configLogs.length).toBeGreaterThan(0);
      const varName = Object.keys(overrides)[0];
      expect(configLogs.some(l => JSON.parse(l).var === varName)).toBe(true);
      for (const v of Object.values(overrides)) if (v) expect(logs.join('\n')).not.toContain(v);
    });
  }

  it('ADMIN_ENABLED absent ou ≠ true ⇒ 503 (désactivé par défaut)', async () => {
    for (const value of [undefined, 'false', '1', 'TRUE']) {
      const { api } = setup({ env: makeEnv({ ADMIN_ENABLED: value }) });
      expect((await api.handle(req('GET', '/api/auth/me'))).status).toBe(503);
    }
  });

  it('configuration valide acceptée, clé PKCS#1 convertie en PKCS#8', () => {
    const res = loadConfig(makeEnv());
    expect(res.ok).toBe(true);
    expect(res.config.privateKeyPem).toMatch(/BEGIN PRIVATE KEY/);
    expect(res.config.secureCookies).toBe(true);
  });
});

describe('T-CFG-02 — VERCEL_ENV ≠ production ⇒ 503', () => {
  for (const value of ['preview', undefined, '', 'staging']) {
    it(`VERCEL_ENV=${value}`, async () => {
      const { api } = setup({ env: makeEnv({ VERCEL_ENV: value }) });
      expect((await api.handle(req('GET', '/api/auth/login'))).status).toBe(503);
    });
  }

  it('development autorise ADMIN_ORIGIN=http://localhost (cookies sans __Host-)', () => {
    const res = loadConfig(makeEnv({ VERCEL_ENV: 'development', ADMIN_ORIGIN: 'http://localhost:3000' }));
    expect(res.ok).toBe(true);
    expect(res.config.secureCookies).toBe(false);
  });

  it('production refuse ADMIN_ORIGIN=http://localhost', () => {
    expect(loadConfig(makeEnv({ ADMIN_ORIGIN: 'http://localhost:3000' })).ok).toBe(false);
  });
});

describe('Mode développement (ADMIN_DEV_MODE=1) — impossible en production', () => {
  it('loadConfig refuse VERCEL_ENV=production et preview', () => {
    for (const VERCEL_ENV of ['production', 'preview']) {
      const res = loadConfig({ ADMIN_DEV_MODE: '1', VERCEL_ENV });
      expect(res).toMatchObject({ ok: false, reason: 'dev_mode_forbidden' });
    }
    expect(loadConfig({ ADMIN_DEV_MODE: '1', NODE_ENV: 'production' }).ok).toBe(false);
  });

  it('assertDevModeAllowed lève une erreur en production', () => {
    expect(() => assertDevModeAllowed({ VERCEL_ENV: 'production' })).toThrow(DevModeForbiddenError);
    expect(() => assertDevModeAllowed({ VERCEL: '1', VERCEL_ENV: 'preview' })).toThrow(DevModeForbiddenError);
    expect(() => assertDevModeAllowed({})).not.toThrow();
    expect(() => assertDevModeAllowed({ VERCEL_ENV: 'development' })).not.toThrow();
  });

  it('l’API répond 503 sur toutes les routes, même avec une configuration de production complète', async () => {
    const { api, logs } = setup({ env: makeEnv({ ADMIN_DEV_MODE: '1' }) });
    for (const [method, p] of ROUTES) {
      expect((await api.handle(req(method, p, { json: method === 'GET' ? undefined : {} }))).status).toBe(503);
    }
    expect(logs.some(l => l.includes('"var":"ADMIN_DEV_MODE"'))).toBe(true);
  });

  it('le backend fichier refuse de s’initialiser en production', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'jk-dev-'));
    expect(() => createDevRepo({ config: { devDataDir: dir, baseBranch: 'main', draftBranch: 'content/draft' }, env: { VERCEL_ENV: 'production' }, rootDir: ROOT }))
      .toThrow(DevModeForbiddenError);
  });

  it('le plugin Vite refuse de démarrer le serveur de développement', () => {
    const plugin = adminDevApi({ env: { ADMIN_DEV_MODE: '1', VERCEL_ENV: 'production' } });
    const fakeServer = { config: { logger: { info() {} }, root: ROOT }, middlewares: { use() {} } };
    expect(() => plugin.configureServer(fakeServer)).toThrow(DevModeForbiddenError);
  });

  it('en local, le mode dev fonctionne sans aucun appel réseau', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'jk-dev-'));
    const fetchSpy = () => { throw new Error('aucun appel réseau attendu'); };
    const api = createApi({ env: { ADMIN_DEV_MODE: '1', ADMIN_DEV_DATA_DIR: dir }, fetch: fetchSpy, rootDir: ROOT, logSink: () => {} });
    const O = 'http://localhost:5173';
    const login = await api.handle(new Request(`${O}/api/auth/login?stepup=1`));
    expect(login.status).toBe(302);
    const cookie = login.headers.getSetCookie()[0].split(';')[0];
    expect(cookie.startsWith('jk_admin=')).toBe(true);
    const got = await bodyOf(await api.handle(new Request(`${O}/api/content/skills`, { headers: { cookie } })));
    got.data.categories[0].visible = false;
    const put = await api.handle(new Request(`${O}/api/content/skills`, {
      method: 'PUT', headers: { cookie, origin: O, 'x-jk-admin': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ baseSha: got.sha, data: got.data })
    }));
    expect(put.status).toBe(200);
    const status = await bodyOf(await api.handle(new Request(`${O}/api/publish/status`, { headers: { cookie } })));
    expect(status.ahead).toBe(1);
    const publishOnce = () => api.handle(new Request(`${O}/api/publish`, {
      method: 'POST', headers: { cookie, origin: O, 'x-jk-admin': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ expectedHeadSha: status.headSha })
    }));
    // 1er clic : ouvre la PR (CI à venir) ; 2e clic : fusionne
    expect((await publishOnce()).status).toBe(409);
    const pub = await publishOnce();
    expect(pub.status).toBe(200);
    // La synchronisation main → develop est simulée
    expect((await bodyOf(pub)).sync.status).toBe('auto_merge');

    // .admin-dev/ supprimé pendant que le serveur tourne : recréé à la volée
    rmSync(dir, { recursive: true, force: true });
    const again = await bodyOf(await api.handle(new Request(`${O}/api/content/skills`, { headers: { cookie } })));
    const put2 = await api.handle(new Request(`${O}/api/content/skills`, {
      method: 'PUT', headers: { cookie, origin: O, 'x-jk-admin': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ baseSha: again.sha, data: { ...again.data, categories: again.data.categories.slice(1) } })
    }));
    expect(put2.status).toBe(200);
    expect(existsSync(path.join(dir, 'state.json'))).toBe(true);
  });
});
