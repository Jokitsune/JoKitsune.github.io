// T-LOG-01 — aucune valeur secrète dans les journaux, sur un parcours complet
// (succès et échecs) avec des sentinelles pour tous les secrets simulés.
import { describe, it, expect } from 'vitest';
import { createLogger } from '../../../api/_lib/log.js';
import {
  setup, req, createFakeGitHub, makeEnv, bodyOf, SENTINEL, SESSION_SECRET, CLIENT_SECRET, testPrivateKey
} from './helpers.js';

describe('T-LOG-01 — journaux sans secrets', () => {
  it('parcours complet : login, refus, écriture, conflit, upload, publication, erreurs', async () => {
    const gh = createFakeGitHub();
    const { api, logs } = setup({ gh });
    const secrets = [SENTINEL, SESSION_SECRET, CLIENT_SECRET, Buffer.from(testPrivateKey()).toString('base64').slice(0, 40), 'PRIVATE KEY'];

    // 1. Login + callback réussi
    const login = await api.handle(req('GET', '/api/auth/login?stepup=1'));
    const location = new URL(login.headers.get('location'));
    const state = location.searchParams.get('state');
    const challenge = location.searchParams.get('code_challenge');
    const txCookie = login.headers.getSetCookie()[0].split(';')[0];
    secrets.push(state, challenge, txCookie.split('=')[1]);
    const cb = await api.handle(req('GET', `/api/auth/callback?code=${SENTINEL}_CODE&state=${state}`, { cookie: txCookie }));
    const sessionCookie = cb.headers.getSetCookie().find(c => c.startsWith('__Host-jk_admin=')).split(';')[0];
    secrets.push(sessionCookie.split('=')[1]);
    const exchange = gh.calls.find(c => c.url.endsWith('/access_token'));
    secrets.push(exchange.body.code_verifier);

    // 2. Callback avec un state falsifié, puis compte refusé
    await api.handle(req('GET', `/api/auth/callback?code=${SENTINEL}_CODE2&state=${SENTINEL}_STATE`, { cookie: txCookie }));
    const ghBad = createFakeGitHub({ user: { id: 1, login: 'mallory', type: 'User' } });
    const other = setup({ gh: ghBad });
    const l2 = await other.api.handle(req('GET', '/api/auth/login'));
    const s2 = new URL(l2.headers.get('location')).searchParams.get('state');
    await other.api.handle(req('GET', `/api/auth/callback?code=${SENTINEL}_CODE3&state=${s2}`, { cookie: l2.headers.getSetCookie()[0].split(';')[0] }));

    // 3. Lecture, écriture, conflit, validation
    const cookie = sessionCookie;
    const cur = await bodyOf(await api.handle(req('GET', '/api/content/projects', { cookie })));
    const data = structuredClone(cur.data);
    data.projects[0].title.fr = `${SENTINEL}_CONTENT`;
    await api.handle(req('PUT', '/api/content/projects', { cookie, json: { baseSha: cur.sha, data, summary: `${SENTINEL} résumé` } }));
    await api.handle(req('PUT', '/api/content/projects', { cookie, json: { baseSha: cur.sha, data } }));
    data.projects[0].title.fr = `<script>${SENTINEL}</script>`;
    await api.handle(req('PUT', '/api/content/projects', { cookie, json: { baseSha: cur.sha, data } }));

    // 4. CSRF, upload accepté et refusé
    await api.handle(req('PUT', '/api/content/projects', { cookie, origin: 'https://evil.example', json: {} }));
    const png = new Uint8Array(300);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set(new TextEncoder().encode(SENTINEL), 20);
    await api.handle(req('POST', `/api/upload?kind=image&name=${SENTINEL}`, { cookie, body: png, headers: { 'content-type': 'image/png', 'content-length': '300' } }));
    await api.handle(req('POST', '/api/upload?kind=cv&lang=fr', { cookie, body: png, headers: { 'content-type': 'application/pdf', 'content-length': '300' } }));

    // 5. Publication
    const st = await bodyOf(await api.handle(req('GET', '/api/publish/status', { cookie })));
    // Flux en deux temps : ouverture de la PR, puis fusion
    await api.handle(req('POST', '/api/publish', { cookie, json: { expectedHeadSha: st.headSha } }));
    await api.handle(req('POST', '/api/publish', { cookie, json: { expectedHeadSha: st.headSha } }));

    // 6. Configuration invalide (valeur sentinelle dans la variable fautive)
    const bad = setup({ env: makeEnv({ ADMIN_GITHUB_ID: `${SENTINEL}_ID` }) });
    await bad.api.handle(req('GET', '/api/auth/me'));

    const all = [...logs, ...other.logs, ...bad.logs];
    expect(all.length).toBeGreaterThan(20);
    for (const line of all) {
      expect(() => JSON.parse(line)).not.toThrow();
      for (const secret of secrets) expect(line, `fuite de « ${secret.slice(0, 12)}… »`).not.toContain(secret);
      expect(line).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./); // aucun JWT
      expect(line).not.toMatch(/cookie|authorization/i);
    }
    // Les événements obligatoires sont bien émis
    const events = new Set(all.map(l => JSON.parse(l).event));
    for (const e of ['auth.login_start', 'auth.success', 'auth.denied', 'auth.state_invalid', 'csrf.reject', 'content.write', 'content.conflict', 'upload.accepted', 'upload.rejected', 'publish.done', 'config.invalid']) {
      expect(events, e).toContain(e);
    }
  });

  it('le logger ignore les champs hors liste blanche et masque les motifs de jetons', () => {
    const lines = [];
    const log = createLogger({ sink: l => lines.push(l) });
    log.info('test', { cookie: 'a=b', authorization: 'Bearer x', body: '{"x":1}', reason: 'ghs_abcdefghijklmnopqrstuvwxyz0123', file: 'projects' });
    const entry = JSON.parse(lines[0]);
    expect(entry).not.toHaveProperty('cookie');
    expect(entry).not.toHaveProperty('authorization');
    expect(entry).not.toHaveProperty('body');
    expect(entry.reason).toBe('[redacted]');
    expect(entry.file).toBe('projects');
  });
});
