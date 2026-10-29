// Session JWT (T-SES-01 à T-SES-07), state et PKCE.
import { describe, it, expect } from 'vitest';
import { createHash, createHmac, generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { loadConfig } from '../../../api/_lib/config.js';
import {
  issueSession, verifySession, issueOAuthTx, deriveKey, SESSION_TYP, AUDIENCE, cookieNames, sessionCookie
} from '../../../api/_lib/session.js';
import { createPkcePair, pkceChallenge, safeEqual } from '../../../api/_lib/oauth.js';
import { makeEnv, ADMIN_ID, ADMIN_LOGIN, ORIGIN, setup, req, sessionCookieFor, bodyOf } from './helpers.js';

const config = loadConfig(makeEnv()).config;
const user = { id: ADMIN_ID, login: ADMIN_LOGIN };
const now = () => Math.floor(Date.now() / 1000);
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');

function claims(overrides = {}) {
  const t = now();
  return { login: ADMIN_LOGIN, sid: 'a'.repeat(32), ver: 1, auth_time: t, sub: ADMIN_ID, iss: ORIGIN, aud: AUDIENCE, iat: t, exp: t + 3600, ...overrides };
}

async function signWith(key, payload, header = { alg: 'HS256', typ: SESSION_TYP }) {
  return new SignJWT(payload).setProtectedHeader(header).sign(key);
}

describe('state et PKCE', () => {
  it('state et verifier de 43 caractères base64url, challenge = SHA-256(verifier)', () => {
    const { state, verifier, challenge } = createPkcePair();
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'); // RFC 7636 annexe B
  });

  it('deux paires successives sont différentes', () => {
    expect(createPkcePair().state).not.toBe(createPkcePair().state);
  });

  it('comparaison à temps constant : longueurs différentes, vide, non-chaîne ⇒ false', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
    expect(safeEqual(undefined, 'a')).toBe(false);
  });
});

describe('T-SES-01 — validité et expiration', () => {
  it('JWT valide accepté', async () => {
    const { token } = await issueSession(config, user, now());
    expect(await verifySession(config, token, now())).toMatchObject({ sub: ADMIN_ID, login: ADMIN_LOGIN });
  });

  it('exp dépassé de plus de 30 s refusé ; tolérance de 30 s respectée', async () => {
    const issued = now() - config.sessionTtl;
    const { token } = await issueSession(config, user, issued);
    expect(await verifySession(config, token, issued + config.sessionTtl + 20)).not.toBeNull();
    expect(await verifySession(config, token, issued + config.sessionTtl + 31)).toBeNull();
  });
});

describe('T-SES-02 — algorithmes refusés', () => {
  const key = deriveKey(config.sessionSecret, 'jk-admin/session/v1');

  it('alg: none', async () => {
    const token = `${b64({ alg: 'none', typ: SESSION_TYP })}.${b64(claims())}.`;
    expect(await verifySession(config, token, now())).toBeNull();
  });

  it('alg: HS512 avec la bonne clé', async () => {
    const head = `${b64({ alg: 'HS512', typ: SESSION_TYP })}.${b64(claims())}`;
    const sig = createHmac('sha512', key).update(head).digest('base64url');
    expect(await verifySession(config, `${head}.${sig}`, now())).toBeNull();
  });

  it('alg: RS256 (confusion de clé)', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = await signWith(privateKey, claims(), { alg: 'RS256', typ: SESSION_TYP });
    expect(await verifySession(config, token, now())).toBeNull();
  });
});

describe('T-SES-03 — falsification', () => {
  it('signature altérée d’un octet refusée', async () => {
    const { token } = await issueSession(config, user, now());
    const [h, p, s] = token.split('.');
    const sig = Buffer.from(s, 'base64url');
    sig[0] ^= 0x01;
    expect(await verifySession(config, `${h}.${p}.${sig.toString('base64url')}`, now())).toBeNull();
  });

  it('claims modifiés (signature d’origine conservée) refusés', async () => {
    const { token } = await issueSession(config, user, now());
    const [h, , s] = token.split('.');
    const forged = `${h}.${b64(claims({ login: 'attacker', exp: now() + 999999 }))}.${s}`;
    expect(await verifySession(config, forged, now())).toBeNull();
  });

  it('jeton signé avec une autre clé refusé', async () => {
    const other = loadConfig(makeEnv({ SESSION_SECRET: Buffer.alloc(32, 7).toString('base64url') })).config;
    const { token } = await issueSession(other, user, now());
    expect(await verifySession(config, token, now())).toBeNull();
  });
});

describe('T-SES-04 — ver, sub, iss, aud, typ', () => {
  const key = deriveKey(config.sessionSecret, 'jk-admin/session/v1');
  const cases = {
    'ver ≠ SESSION_VERSION': [claims({ ver: 2 })],
    'sub ≠ ADMIN_GITHUB_ID': [claims({ sub: '999' })],
    'mauvais iss': [claims({ iss: 'https://evil.example' })],
    'mauvais aud': [claims({ aud: 'autre' })],
    'mauvais typ': [claims(), { alg: 'HS256', typ: 'JWT' }]
  };
  for (const [name, [payload, header]] of Object.entries(cases)) {
    it(name, async () => {
      const token = await signWith(key, payload, header);
      expect(await verifySession(config, token, now())).toBeNull();
    });
  }

  it('contrôle : le même jeton bien formé est accepté', async () => {
    expect(await verifySession(config, await signWith(key, claims()), now())).not.toBeNull();
  });

  it('incrémenter SESSION_VERSION invalide les sessions existantes', async () => {
    const { token } = await issueSession(config, user, now());
    const bumped = loadConfig(makeEnv({ SESSION_VERSION: '2' })).config;
    expect(await verifySession(bumped, token, now())).toBeNull();
  });

  it('changer ADMIN_GITHUB_ID invalide les sessions existantes', async () => {
    const { token } = await issueSession(config, user, now());
    const other = loadConfig(makeEnv({ ADMIN_GITHUB_ID: '555' })).config;
    expect(await verifySession(other, token, now())).toBeNull();
  });
});

describe('T-SES-05 — cookie de transaction OAuth présenté comme session', () => {
  it('refusé (clé HKDF et typ distincts)', async () => {
    const cookie = await issueOAuthTx(config, { state: 's', verifier: 'v', stepup: false }, now());
    const token = cookie.split(';')[0].split('=')[1];
    expect(await verifySession(config, token, now())).toBeNull();
    const { api } = setup();
    const res = await api.handle(req('GET', '/api/auth/me', { cookie: `${cookieNames(config).session}=${token}` }));
    expect(res.status).toBe(401);
  });
});

describe('T-SES-06 — attributs du cookie de session', () => {
  it('__Host-, Path=/, Secure, HttpOnly, SameSite=Strict, Max-Age, sans Domain', async () => {
    const { token } = await issueSession(config, user, now());
    const cookie = sessionCookie(config, token);
    const attrs = cookie.split('; ');
    expect(attrs[0].startsWith('__Host-jk_admin=')).toBe(true);
    expect(attrs).toEqual(expect.arrayContaining(['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Max-Age=14400']));
    expect(cookie).not.toMatch(/domain/i);
  });
});

describe('T-SES-07 — step-up pour publier et abandonner', () => {
  for (const [path, body] of [['/api/publish', { expectedHeadSha: 'a'.repeat(40) }], ['/api/draft/reset', { confirm: 'DISCARD' }]]) {
    it(`${path} : step-up > 900 s ⇒ 403 STEP_UP_REQUIRED, sans appel GitHub`, async () => {
      const { api, gh } = setup();
      const cookie = await sessionCookieFor(config, { authAgeSec: 901, stepUp: true });
      const res = await api.handle(req('POST', path, { cookie, json: body }));
      expect(res.status).toBe(403);
      expect((await bodyOf(res)).error.code).toBe('STEP_UP_REQUIRED');
      expect(gh.calls).toHaveLength(0);
    });

    it(`${path} : M1 — connexion ordinaire TOUTE FRAÎCHE ⇒ 403 STEP_UP_REQUIRED`, async () => {
      const { api, gh } = setup();
      const cookie = await sessionCookieFor(config, { authAgeSec: 0, stepUp: false });
      const res = await api.handle(req('POST', path, { cookie, json: body }));
      expect(res.status).toBe(403);
      expect((await bodyOf(res)).error.code).toBe('STEP_UP_REQUIRED');
      expect(gh.calls).toHaveLength(0);
    });
  }

  it('/api/auth/me signale stepUpValid (seulement après une connexion step-up récente)', async () => {
    const { api } = setup();
    const me = async opts => bodyOf(await api.handle(req('GET', '/api/auth/me', { cookie: await sessionCookieFor(config, opts) })));
    expect(await me({ stepUp: true })).toMatchObject({ login: ADMIN_LOGIN, id: ADMIN_ID, stepUpValid: true });
    expect((await me({ stepUp: false })).stepUpValid).toBe(false);
    expect((await me({ stepUp: true, authAgeSec: 1000 })).stepUpValid).toBe(false);
  });

  it('M1 — stepup_at falsifié (non entier) ⇒ session refusée', async () => {
    const key = deriveKey(config.sessionSecret, 'jk-admin/session/v1');
    expect(await verifySession(config, await signWith(key, claims({ stepup_at: 'now' })), now())).toBeNull();
  });
});

describe('M1 — le step-up n’est posé que par une transaction OAuth stepup=1', () => {
  async function loginAndCallback(query) {
    const { api } = setup();
    const login = await api.handle(req('GET', `/api/auth/login${query}`));
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    const cookie = login.headers.getSetCookie()[0].split(';')[0];
    const cb = await api.handle(req('GET', `/api/auth/callback?code=abc&state=${state}`, { cookie }));
    const session = cb.headers.getSetCookie().find(c => c.startsWith('__Host-jk_admin=')).split(';')[0];
    return bodyOf(await api.handle(req('GET', '/api/auth/me', { cookie: session })));
  }

  it('connexion normale ⇒ stepUpValid: false', async () => {
    expect((await loginAndCallback('')).stepUpValid).toBe(false);
  });

  it('connexion initiée par Publier (stepup=1) ⇒ stepUpValid: true', async () => {
    expect((await loginAndCallback('?stepup=1')).stepUpValid).toBe(true);
  });

  it('mode dev : même règle', async () => {
    const { createApi } = await import('../../../api/_lib/app.js');
    const { mkdtempSync } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const api = createApi({ env: { ADMIN_DEV_MODE: '1', ADMIN_DEV_DATA_DIR: mkdtempSync(path.join(os.tmpdir(), 'jk-')) }, logSink: () => {} });
    const O = 'http://localhost:5173';
    const meFor = async q => {
      const res = await api.handle(new Request(`${O}/api/auth/login${q}`));
      const cookie = res.headers.getSetCookie()[0].split(';')[0];
      return bodyOf(await api.handle(new Request(`${O}/api/auth/me`, { headers: { cookie } })));
    };
    expect((await meFor('')).stepUpValid).toBe(false);
    expect((await meFor('?stepup=1')).stepUpValid).toBe(true);
  });
});
