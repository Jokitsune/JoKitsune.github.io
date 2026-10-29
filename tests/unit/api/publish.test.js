// Publication (T-GIT-05, step-up) et abandon du brouillon.
import { describe, it, expect, beforeEach } from 'vitest';
import { aggregateChecks } from '../../../api/_lib/github-api.js';
import { setup, req, sessionCookieFor, bodyOf, createFakeGitHub } from './helpers.js';

let ctx;
let cookie;

beforeEach(async () => {
  ctx = setup();
  cookie = await sessionCookieFor(ctx.config, { stepUp: true });
});

const status = async () => bodyOf(await ctx.api.handle(req('GET', '/api/publish/status', { cookie })));
const publish = expectedHeadSha => ctx.api.handle(req('POST', '/api/publish', { cookie, json: { expectedHeadSha } }));
/** Flux en deux temps : le 1er clic ouvre la PR (CHECKS_PENDING), le 2e fusionne. */
async function publishReady(expectedHeadSha) {
  const first = await publish(expectedHeadSha);
  expect(first.status).toBe(409);
  expect((await bodyOf(first)).error.code).toBe('CHECKS_PENDING');
  return publish(expectedHeadSha);
}

async function makeDraftChange() {
  const current = await bodyOf(await ctx.api.handle(req('GET', '/api/content/skills', { cookie })));
  const data = structuredClone(current.data);
  data.categories[0].visible = !data.categories[0].visible;
  const res = await ctx.api.handle(req('PUT', '/api/content/skills', { cookie, json: { baseSha: current.sha, data } }));
  expect(res.status).toBe(200);
}

describe('Statut', () => {
  it('brouillon absent ⇒ ahead 0, aucune écriture', async () => {
    expect(await status()).toMatchObject({ ahead: 0, checks: 'none', headSha: null, draftExists: false, previewUrl: expect.stringMatching(/^https:/) });
    expect(ctx.gh.calls.some(c => c.method !== 'GET' && c.pathname.startsWith('/repos/'))).toBe(false);
  });

  it('après une modification ⇒ ahead 1, headSha, checks', async () => {
    await makeDraftChange();
    const s = await status();
    expect(s.ahead).toBe(1);
    expect(s.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(s.checks).toBe('success');
  });

  it('agrégat des checks', () => {
    expect(aggregateChecks([])).toBe('none');
    expect(aggregateChecks([{ status: 'in_progress' }])).toBe('pending');
    expect(aggregateChecks([{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'skipped' }])).toBe('success');
    expect(aggregateChecks([{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' }])).toBe('failure');
  });
});

describe('Publication', () => {
  it('flux complet : PR créée, fusion squash avec sha attendu, brouillon réaligné', async () => {
    await makeDraftChange();
    const { headSha } = await status();
    const res = await publishReady(headSha);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body).toMatchObject({ merged: true, prUrl: expect.stringContaining('/pull/12') });
    const create = ctx.gh.calls.find(c => c.method === 'POST' && c.pathname.endsWith('/pulls'));
    expect(create.body).toMatchObject({ head: 'content/draft', base: 'main', title: 'content: publication de 1 modification(s) depuis /admin' });
    const merge = ctx.gh.calls.find(c => c.pathname.endsWith('/merge'));
    expect(merge.body).toMatchObject({ merge_method: 'squash', sha: headSha });
    const reset = ctx.gh.calls.find(c => c.method === 'PATCH' && c.pathname.includes('/git/refs/heads/'));
    expect(reset.body).toEqual({ sha: body.mainSha, force: true });
    expect(reset.pathname).toContain('content/draft');
    expect(ctx.logs.some(l => l.includes('publish.done'))).toBe(true);
  });

  it('1er clic : PR tout juste créée ⇒ 409 CHECKS_PENDING sans fusion, même si les checks existants sont verts', async () => {
    await makeDraftChange();
    const { headSha, checks } = await status();
    expect(checks).toBe('success');
    const res = await publish(headSha);
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error).toMatchObject({ code: 'CHECKS_PENDING', prUrl: expect.stringContaining('/pull/') });
    expect(ctx.gh.calls.some(c => c.pathname.endsWith('/merge'))).toBe(false);
    expect(ctx.gh.calls.some(c => c.pathname.endsWith('/update-branch'))).toBe(false);
  });

  it('T-GIT-05 — expectedHeadSha périmé ⇒ 409 CONFLICT, rien de fusionné', async () => {
    await makeDraftChange();
    const res = await publish('0'.repeat(40));
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error.code).toBe('CONFLICT');
    expect(ctx.gh.calls.some(c => c.pathname.endsWith('/merge'))).toBe(false);
  });

  it('T-GIT-05 — checks en cours ⇒ 409 CHECKS_PENDING (avec lien de PR)', async () => {
    await makeDraftChange();
    ctx.gh.state.checks = [{ status: 'in_progress', conclusion: null }];
    const res = await publish((await status()).headSha);
    expect(res.status).toBe(409);
    const body = await bodyOf(res);
    expect(body.error.code).toBe('CHECKS_PENDING');
    expect(body.error.prUrl).toContain('/pull/');
    expect(ctx.gh.calls.some(c => c.pathname.endsWith('/merge'))).toBe(false);
  });

  it('aucun check encore créé ⇒ 409 CHECKS_PENDING', async () => {
    await makeDraftChange();
    ctx.gh.state.checks = [];
    expect((await bodyOf(await publish((await status()).headSha))).error.code).toBe('CHECKS_PENDING');
  });

  it('checks en échec ⇒ 422 CHECKS_FAILED', async () => {
    await makeDraftChange();
    ctx.gh.state.checks = [{ status: 'completed', conclusion: 'failure' }];
    const res = await publishReady((await status()).headSha);
    expect(res.status).toBe(422);
    expect((await bodyOf(res)).error.code).toBe('CHECKS_FAILED');
  });

  it('la tête bouge pendant la fusion (409 GitHub) ⇒ 409 CONFLICT', async () => {
    await makeDraftChange();
    ctx.gh.state.mergeConflict = true;
    expect((await publishReady((await status()).headSha)).status).toBe(409);
  });

  it('rien à publier ⇒ 409 NOTHING_TO_PUBLISH', async () => {
    const res = await publish('a'.repeat(40));
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error.code).toBe('NOTHING_TO_PUBLISH');
  });

  it('expectedHeadSha mal formé ⇒ 400', async () => {
    expect((await publish('HEAD')).status).toBe(400);
  });
});

describe('Ruleset « branche à jour » (strict) : brouillon en retard sur main', () => {
  it('behind > 0 ⇒ update-branch avec expected_head_sha, puis 409 CHECKS_PENDING (branchUpdated), sans fusion', async () => {
    await makeDraftChange();
    const { headSha } = await status();
    ctx.gh.state.behind = 2;
    const res = await publish(headSha);
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error).toMatchObject({ code: 'CHECKS_PENDING', branchUpdated: true, prUrl: expect.stringContaining('/pull/') });
    const update = ctx.gh.calls.find(c => c.pathname.endsWith('/update-branch'));
    expect(update.method).toBe('PUT');
    expect(update.body).toEqual({ expected_head_sha: headSha });
    expect(ctx.gh.calls.some(c => c.pathname.endsWith('/merge'))).toBe(false);
    // Le brouillon a bougé : le client doit relire le statut ; l'ancien sha est refusé
    expect((await publish(headSha)).status).toBe(409);
    const next = await status();
    expect(next.headSha).not.toBe(headSha);
    expect((await publish(next.headSha)).status).toBe(200);
  });

  it('405 « non fusionnable » sans retard (check requis pas encore terminé) ⇒ CHECKS_PENDING, sans update-branch', async () => {
    await makeDraftChange();
    const { headSha } = await status();
    await publish(headSha); // 1er clic : ouvre la PR
    ctx.gh.state.mergeNotMergeable = true;
    const res = await publish(headSha);
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error).toMatchObject({ code: 'CHECKS_PENDING' });
    expect(ctx.gh.calls.some(c => c.pathname.endsWith('/update-branch'))).toBe(false);
  });

  it('update-branch impossible (conflit) ⇒ 409 CONFLICT explicite', async () => {
    await makeDraftChange();
    ctx.gh.state.behind = 1;
    ctx.gh.state.updateBranchConflict = true;
    const res = await publish((await status()).headSha);
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error).toMatchObject({ code: 'CONFLICT', reason: 'update_branch_conflict' });
  });
});

describe('F4 — brouillon modifié pendant la fusion', () => {
  it('ne réinitialise PAS content/draft (aucun PATCH force) et répond 409 avec merged: true', async () => {
    await makeDraftChange();
    ctx.gh.state.pushDuringMerge = true;
    const res = await publishReady((await status()).headSha);
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error).toMatchObject({ code: 'CONFLICT', merged: true, currentSha: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(ctx.gh.calls.some(c => c.method === 'PATCH' && c.pathname.includes('/git/refs/heads/'))).toBe(false);
  });
});

describe('Synchronisation main → develop après publication', () => {
  it('ouvre la PR « chore: synchroniser develop… » et active l’auto-merge en mode MERGE', async () => {
    await makeDraftChange();
    const body = await bodyOf(await publishReady((await status()).headSha));
    expect(body.sync).toEqual({ status: 'auto_merge', prUrl: expect.stringContaining('/pull/13') });
    const create = ctx.gh.calls.filter(c => c.method === 'POST' && c.pathname.endsWith('/pulls'))[1];
    expect(create.body).toMatchObject({ head: 'main', base: 'develop', title: 'chore: synchroniser develop avec la publication de contenu' });
    expect(ctx.gh.state.autoMergeRequests).toEqual([{ id: 'PR_node_13', method: 'MERGE' }]);
    const gql = ctx.gh.calls.find(c => c.pathname === '/graphql');
    expect(gql.headers.get('authorization')).toMatch(/^Bearer /);
  });

  it('PR de synchro déjà ouverte ⇒ aucune nouvelle PR', async () => {
    await makeDraftChange();
    await publishReady((await status()).headSha);
    await makeDraftChange();
    const res = await bodyOf(await publishReady((await status()).headSha));
    expect(res.sync.status).toBe('auto_merge');
    const syncCreates = ctx.gh.calls.filter(c => c.method === 'POST' && c.pathname.endsWith('/pulls') && c.body.base === 'develop');
    expect(syncCreates).toHaveLength(1);
  });

  it('auto-merge indisponible ⇒ sync « opened », puis POST /api/publish/sync fusionne (merge commit) quand la CI est verte', async () => {
    ctx.gh.state.autoMergeAvailable = false;
    await makeDraftChange();
    const body = await bodyOf(await publishReady((await status()).headSha));
    expect(body.sync.status).toBe('opened');
    const st = await status();
    expect(st.sync).toMatchObject({ open: true, checks: 'success', autoMerge: false });

    ctx.gh.state.checks = [{ status: 'in_progress' }];
    const pending = await ctx.api.handle(req('POST', '/api/publish/sync', { cookie }));
    expect((await bodyOf(pending)).error.code).toBe('CHECKS_PENDING');

    ctx.gh.state.checks = [{ status: 'completed', conclusion: 'success' }];
    const merged = await ctx.api.handle(req('POST', '/api/publish/sync', { cookie }));
    expect(merged.status).toBe(200);
    expect(ctx.gh.state.syncMerged).toEqual(['merge']);
    expect((await status()).sync).toEqual({ open: false });
  });

  it('/api/publish/sync : mutation (CSRF exigé)', async () => {
    const res = await ctx.api.handle(req('POST', '/api/publish/sync', { cookie, origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
  });

  it('CONTENT_SYNC_BRANCH=none ⇒ aucune synchro', async () => {
    const { makeEnv, setup: mk } = await import('./helpers.js');
    ctx = mk({ env: makeEnv({ CONTENT_SYNC_BRANCH: 'none' }) });
    cookie = await sessionCookieFor(ctx.config, { stepUp: true });
    await makeDraftChange();
    const body = await bodyOf(await publishReady((await status()).headSha));
    expect(body.sync).toEqual({ status: 'disabled' });
    expect(ctx.gh.calls.some(c => c.pathname === '/graphql')).toBe(false);
  });

  it('un échec de la synchro ne fait pas échouer la publication', async () => {
    const gh = createFakeGitHub();
    const base = gh.fetch;
    gh.fetch = (url, init) => (String(url).includes('/compare/develop...main')
      ? Promise.resolve(new Response('{}', { status: 500 }))
      : base(url, init));
    ctx = setup({ gh });
    await makeDraftChange();
    const res = await publishReady((await status()).headSha);
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).sync).toEqual({ status: 'failed' });
    expect(ctx.logs.some(l => l.includes('publish.sync'))).toBe(true);
  });
});

describe('Abandon du brouillon', () => {
  it('confirm absent ⇒ 400', async () => {
    const res = await ctx.api.handle(req('POST', '/api/draft/reset', { cookie, json: { confirm: 'yes' } }));
    expect(res.status).toBe(400);
  });

  it('réaligne content/draft sur main et ferme la PR ouverte', async () => {
    await makeDraftChange();
    await publish((await status()).headSha).catch(() => {});
    await makeDraftChange();
    ctx.gh.state.checks = [];
    await publish((await status()).headSha); // ouvre la PR, CHECKS_PENDING
    const res = await ctx.api.handle(req('POST', '/api/draft/reset', { cookie, json: { confirm: 'DISCARD' } }));
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.draftSha).toBe(ctx.gh.state.refs.main);
    expect(ctx.gh.state.pr).toBeNull();
    expect((await status()).ahead).toBe(0);
  });
});
