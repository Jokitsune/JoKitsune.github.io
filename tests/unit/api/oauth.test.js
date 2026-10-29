// Flux OAuth (T-OAU-01 à T-OAU-06) avec un GitHub simulé.
import { describe, it, expect } from 'vitest';
import { cookieNames } from '../../../api/_lib/session.js';
import { pkceChallenge } from '../../../api/_lib/oauth.js';
import { setup, req, createFakeGitHub, ADMIN_ID, ADMIN_LOGIN, ORIGIN, OAUTH_CODE, USER_TOKEN } from './helpers.js';

/** Démarre un login et renvoie { cookie de transaction, state, challenge, URL GitHub }. */
async function startLogin(api, query = '') {
  const res = await api.handle(req('GET', `/api/auth/login${query}`));
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get('location'));
  const txCookie = res.headers.getSetCookie()[0];
  return { res, location, txCookie, cookie: txCookie.split(';')[0], state: location.searchParams.get('state') };
}

const callback = (api, { cookie, state, code = OAUTH_CODE, extra = '' }) => {
  const q = new URLSearchParams();
  if (code !== null) q.set('code', code);
  if (state !== null) q.set('state', state);
  return api.handle(req('GET', `/api/auth/callback?${q}${extra}`, { cookie }));
};

const githubCalls = gh => gh.calls.filter(c => /github\.com/.test(c.url));
const sessionSet = res => res.headers.getSetCookie().some(c => c.startsWith('__Host-jk_admin=') && !c.includes('Max-Age=0'));

describe('T-OAU-05 / T-OAU-06 — URL d’autorisation', () => {
  it('sans scope, PKCE S256, redirect_uri fixe, login imposé, cookie de transaction Lax', async () => {
    const { api } = setup();
    const { location, txCookie } = await startLogin(api);
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(location.searchParams.has('scope')).toBe(false);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    expect(location.searchParams.get('allow_signup')).toBe('false');
    expect(location.searchParams.get('login')).toBe(ADMIN_LOGIN);
    expect(txCookie).toMatch(/^__Host-jk_oauth=/);
    expect(txCookie).toContain('SameSite=Lax');
    expect(txCookie).toContain('HttpOnly');
    expect(txCookie).toContain('Max-Age=600');
  });

  it('aucun paramètre ne choisit la destination (open redirect)', async () => {
    const { api } = setup();
    const { location } = await startLogin(api, '?returnTo=https://evil.example&redirect_uri=https://evil.example&next=//evil');
    expect(location.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback`);
    expect(location.toString()).not.toContain('evil');
    // Le callback renvoie toujours vers /admin/
    const { api: api2 } = setup();
    const login = await startLogin(api2);
    const res = await callback(api2, { cookie: login.cookie, state: login.state, extra: '&returnTo=https://evil.example' });
    expect(res.headers.get('location')).toBe('/admin/');
  });
});

describe('Connexion réussie', () => {
  it('échange avec code_verifier, session émise, jeton révoqué', async () => {
    const { api, gh } = setup();
    const login = await startLogin(api);
    const res = await callback(api, { cookie: login.cookie, state: login.state });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/admin/');
    expect(sessionSet(res)).toBe(true);
    const exchange = gh.calls.find(c => c.url.endsWith('/login/oauth/access_token'));
    expect(exchange.body.code).toBe(OAUTH_CODE);
    expect(exchange.body.redirect_uri).toBe(`${ORIGIN}/api/auth/callback`);
    // PKCE : le verifier envoyé correspond au challenge présenté à GitHub
    expect(pkceChallenge(exchange.body.code_verifier)).toBe(login.location.searchParams.get('code_challenge'));
    expect(gh.state.revoked).toEqual([USER_TOKEN]);
    const userCall = gh.calls.find(c => c.pathname === '/user');
    expect(userCall.headers.get('authorization')).toBe(`Bearer ${USER_TOKEN}`);
  });

  it('step-up : retour vers /admin/?stepup=ok', async () => {
    const { api } = setup();
    const login = await startLogin(api, '?stepup=1');
    const res = await callback(api, { cookie: login.cookie, state: login.state });
    expect(res.headers.get('location')).toBe('/admin/?stepup=ok');
  });
});

describe('T-OAU-01 / T-OAU-02 — state et cookie de transaction', () => {
  const failing = {
    'state absent': l => ({ cookie: l.cookie, state: null }),
    'state différent': l => ({ cookie: l.cookie, state: `${l.state.slice(0, -1)}${l.state.endsWith('A') ? 'B' : 'A'}` }),
    'state de longueur différente': l => ({ cookie: l.cookie, state: `${l.state}x` }),
    'cookie de transaction absent': l => ({ cookie: undefined, state: l.state }),
    'cookie de transaction falsifié': l => ({ cookie: `${l.cookie.slice(0, -2)}${l.cookie.endsWith('xx') ? 'yy' : 'xx'}`, state: l.state }),
    'refus utilisateur (error=access_denied)': l => ({ cookie: l.cookie, state: l.state, code: null, extra: '&error=access_denied' })
  };
  for (const [name, build] of Object.entries(failing)) {
    it(`${name} ⇒ échec générique, aucun appel GitHub, cookie de transaction supprimé`, async () => {
      const { api, gh } = setup();
      const login = await startLogin(api);
      const res = await callback(api, build(login));
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/admin/?e=auth');
      expect(githubCalls(gh)).toHaveLength(0);
      expect(res.headers.getSetCookie().some(c => c.startsWith('__Host-jk_oauth=;') && c.includes('Max-Age=0'))).toBe(true);
      expect(sessionSet(res)).toBe(false);
    });
  }

  it('cookie de transaction expiré (> 10 min) ⇒ échec', async () => {
    let t = Date.now();
    const { api, gh } = setup({ now: () => t });
    const login = await startLogin(api);
    t += 601_000;
    const res = await callback(api, { cookie: login.cookie, state: login.state });
    expect(res.headers.get('location')).toBe('/admin/?e=auth');
    expect(githubCalls(gh)).toHaveLength(0);
  });

  it('le cookie de transaction est aussi supprimé en cas de succès', async () => {
    const { api } = setup();
    const login = await startLogin(api);
    const res = await callback(api, { cookie: login.cookie, state: login.state });
    expect(res.headers.getSetCookie().some(c => c.startsWith(`${cookieNames({ secureCookies: true }).oauth}=;`))).toBe(true);
  });
});

describe('T-OAU-03 / T-OAU-04 — autorisation du compte et révocation', () => {
  const users = {
    'autre ID': { id: 999, login: 'mallory', type: 'User' },
    'même login, autre ID': { id: 999, login: ADMIN_LOGIN, type: 'User' },
    'même ID, login différent (compte renommé)': { id: Number(ADMIN_ID), login: 'renamed', type: 'User' },
    'type Organization': { id: Number(ADMIN_ID), login: ADMIN_LOGIN, type: 'Organization' }
  };
  for (const [name, user] of Object.entries(users)) {
    it(`${name} ⇒ refus, jeton révoqué`, async () => {
      const gh = createFakeGitHub({ user });
      const { api, logs } = setup({ gh });
      const login = await startLogin(api);
      const res = await callback(api, { cookie: login.cookie, state: login.state });
      expect(res.headers.get('location')).toBe('/admin/?e=auth');
      expect(sessionSet(res)).toBe(false);
      expect(gh.state.revoked).toEqual([USER_TOKEN]);
      const event = name.startsWith('même ID') ? 'auth.login_mismatch' : 'auth.denied';
      expect(logs.some(l => JSON.parse(l).event === event)).toBe(true);
    });
  }

  it('login insensible à la casse', async () => {
    const gh = createFakeGitHub({ user: { id: Number(ADMIN_ID), login: 'jokitsune', type: 'User' } });
    const { api } = setup({ gh });
    const login = await startLogin(api);
    expect(sessionSet(await callback(api, { cookie: login.cookie, state: login.state }))).toBe(true);
  });

  it('échec de l’échange (code invalide / verifier falsifié côté GitHub) ⇒ refus générique', async () => {
    const gh = createFakeGitHub();
    gh.state.tokenResponse = { error: 'bad_verification_code' };
    const { api } = setup({ gh });
    const login = await startLogin(api);
    const res = await callback(api, { cookie: login.cookie, state: login.state });
    expect(res.headers.get('location')).toBe('/admin/?e=auth');
    expect(gh.state.revoked).toEqual([]);
  });

  it('échec de révocation : connexion non bloquée, log warn sans le jeton', async () => {
    const gh = createFakeGitHub();
    const base = gh.fetch;
    gh.fetch = (url, init) => (/\/applications\//.test(String(url)) ? Promise.resolve(new Response('{}', { status: 500 })) : base(url, init));
    const { api, logs } = setup({ gh });
    const login = await startLogin(api);
    const res = await callback(api, { cookie: login.cookie, state: login.state });
    expect(sessionSet(res)).toBe(true);
    expect(logs.some(l => l.includes('auth.revoke_failed'))).toBe(true);
    expect(logs.join('\n')).not.toContain(USER_TOKEN);
  });
});
