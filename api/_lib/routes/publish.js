/* ================================================
   ROUTES DE PUBLICATION (mode « pr ») — statut, publication, abandon
   Publication : PR brouillon → base, CI verte exigée, fusion squash avec
   le sha de tête attendu, puis brouillon réaligné sur la nouvelle base.
   ================================================ */

import { ApiError, json } from '../http.js';
import { RepoConflictError } from '../github-api.js';
import { readJsonBody } from '../body.js';

const SHA_RE = /^[0-9a-f]{40}$/;
const MAX_BODY = 4 * 1024;

function auditTrailers(ctx) {
  return [
    `Admin-Actor: ${ctx.session.login} (id ${ctx.session.sub})`,
    `Admin-Session: ${ctx.session.sid.slice(0, 8)}`,
    `Admin-Request-Id: ${ctx.requestId}`
  ].join('\n');
}

/** GET /api/publish/status */
export async function publishStatus(ctx) {
  const { config } = ctx;
  const repo = ctx.repo();
  const headSha = await repo.getRef(config.draftBranch);
  if (!headSha) {
    return json(200, { ahead: 0, prUrl: null, previewUrl: config.previewUrl, checks: 'none', headSha: null, draftExists: false });
  }
  const [{ aheadBy }, pr] = await Promise.all([
    repo.compare(config.baseBranch, config.draftBranch),
    repo.findOpenPr(config.draftBranch, config.baseBranch)
  ]);
  const checks = aheadBy > 0 ? await repo.getChecks(headSha) : 'none';
  return json(200, { ahead: aheadBy, prUrl: pr?.url ?? null, previewUrl: config.previewUrl, checks, headSha, draftExists: true });
}

/** POST /api/publish — { expectedHeadSha } (step-up requis) */
export async function publish(ctx) {
  const { config, log } = ctx;
  const body = await readJsonBody(ctx.request, MAX_BODY);
  if (!body || typeof body !== 'object' || typeof body.expectedHeadSha !== 'string' || !SHA_RE.test(body.expectedHeadSha)) {
    throw new ApiError(400, 'BAD_REQUEST', { reason: 'bad_expected_head' });
  }
  const repo = ctx.repo();
  const headSha = await repo.getRef(config.draftBranch);
  if (!headSha) throw new ApiError(409, 'NOTHING_TO_PUBLISH');
  if (headSha !== body.expectedHeadSha) throw new ApiError(409, 'CONFLICT', { extra: { currentSha: headSha } });
  const { aheadBy } = await repo.compare(config.baseBranch, config.draftBranch);
  if (aheadBy === 0) throw new ApiError(409, 'NOTHING_TO_PUBLISH');

  const title = `content: publication de ${aheadBy} modification(s) depuis /admin`;
  const pr = (await repo.findOpenPr(config.draftBranch, config.baseBranch)) ?? (await repo.createPr({
    head: config.draftBranch,
    base: config.baseBranch,
    title,
    body: `Publication demandée depuis /admin.\n\n${auditTrailers(ctx)}`
  }));

  const checks = await repo.getChecks(headSha);
  if (checks === 'pending' || checks === 'none') {
    throw new ApiError(409, 'CHECKS_PENDING', { extra: { prUrl: pr.url ?? null } });
  }
  if (checks === 'failure') throw new ApiError(422, 'CHECKS_FAILED', { extra: { prUrl: pr.url ?? null } });

  let merged;
  try {
    merged = await repo.mergePr(pr.number, { sha: body.expectedHeadSha, title, message: auditTrailers(ctx) });
  } catch (err) {
    if (err instanceof RepoConflictError) {
      log.info('content.conflict', { ...ctx.logFields, reason: err.reason, prNumber: pr.number });
      throw new ApiError(409, 'CONFLICT', { extra: { currentSha: await repo.getRef(config.draftBranch).catch(() => null) } });
    }
    throw err;
  }
  const mainSha = merged.sha ?? (await repo.getRef(config.baseBranch));
  // Brouillon réaligné sur la nouvelle base (force autorisé sur CETTE branche uniquement)
  await repo.updateRef(config.draftBranch, mainSha, true);
  log.info('publish.done', { ...ctx.logFields, commitSha: mainSha, prNumber: pr.number });
  return json(200, { merged: true, mainSha, prUrl: pr.url ?? null });
}

/** POST /api/draft/reset — { confirm: "DISCARD" } (step-up requis) */
export async function resetDraft(ctx) {
  const { config, log } = ctx;
  const body = await readJsonBody(ctx.request, MAX_BODY);
  if (!body || body.confirm !== 'DISCARD') throw new ApiError(400, 'BAD_REQUEST', { reason: 'confirm_missing' });
  const repo = ctx.repo();
  const mainSha = await repo.getRef(config.baseBranch);
  const pr = await repo.findOpenPr(config.draftBranch, config.baseBranch);
  if (pr) await repo.closePr(pr.number);
  if (await repo.getRef(config.draftBranch)) await repo.updateRef(config.draftBranch, mainSha, true);
  else await repo.createRef(config.draftBranch, mainSha);
  log.info('draft.reset', { ...ctx.logFields, commitSha: mainSha });
  return json(200, { draftSha: mainSha });
}
