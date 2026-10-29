// Publication (T-GIT-05, step-up) et abandon du brouillon.
import { describe, it, expect, beforeEach } from 'vitest';
import { aggregateChecks } from '../../../api/_lib/github-api.js';
import { setup, req, sessionCookieFor, bodyOf } from './helpers.js';

let ctx;
let cookie;

beforeEach(async () => {
  ctx = setup();
  cookie = await sessionCookieFor(ctx.config, { stepUp: true });
});

const status = async () => bodyOf(await ctx.api.handle(req('GET', '/api/publish/status', { cookie })));
const publish = expectedHeadSha => ctx.api.handle(req('POST', '/api/publish', { cookie, json: { expectedHeadSha } }));

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
    const res = await publish(headSha);
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
    const res = await publish((await status()).headSha);
    expect(res.status).toBe(422);
    expect((await bodyOf(res)).error.code).toBe('CHECKS_FAILED');
  });

  it('la tête bouge pendant la fusion (409 GitHub) ⇒ 409 CONFLICT', async () => {
    await makeDraftChange();
    ctx.gh.state.mergeConflict = true;
    expect((await publish((await status()).headSha)).status).toBe(409);
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
