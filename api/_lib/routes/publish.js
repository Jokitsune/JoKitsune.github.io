/* ================================================
   ROUTES DE PUBLICATION (mode « pr ») — statut, publication, synchro, abandon
   Publication : PR brouillon → base, CI verte exigée, fusion squash avec
   le sha de tête attendu, puis brouillon réaligné sur la nouvelle base, puis
   PR de synchronisation base → develop (auto-merge en mode MERGE).
   La publication se fait souvent en DEUX TEMPS : le premier clic ouvre la PR
   (ou met à jour le brouillon) et lance la CI, le second fusionne.
   ================================================ */

import { ApiError, json } from '../http.js';
import { RepoConflictError } from '../github-api.js';
import { readJsonBody } from '../body.js';

const SHA_RE = /^[0-9a-f]{40}$/;
const MAX_BODY = 4 * 1024;
export const SYNC_PR_TITLE = 'chore: synchroniser develop avec la publication de contenu';

function auditTrailers(ctx) {
  return [
    `Admin-Actor: ${ctx.session.login} (id ${ctx.session.sub})`,
    `Admin-Session: ${ctx.session.sid.slice(0, 8)}`,
    `Admin-Request-Id: ${ctx.requestId}`
  ].join('\n');
}

/** PR de synchronisation base → develop ouverte, avec ses checks. */
async function syncStatus(ctx) {
  const { config } = ctx;
  if (!config.syncBranch) return null;
  const repo = ctx.repo();
  const pr = await repo.findOpenPr(config.baseBranch, config.syncBranch);
  if (!pr) return { open: false };
  const checks = pr.headSha ? await repo.getChecks(pr.headSha) : 'none';
  return { open: true, prUrl: pr.url ?? null, checks, autoMerge: pr.autoMerge === true, headSha: pr.headSha ?? null };
}

/**
 * Après une publication : ouvre (si besoin) la PR base → develop et active l'auto-merge.
 * Ne fait jamais échouer la publication (déjà fusionnée) : renvoie un statut.
 */
async function syncAfterPublish(ctx) {
  const { config, log } = ctx;
  if (!config.syncBranch) return { status: 'disabled' };
  const repo = ctx.repo();
  try {
    let pr = await repo.findOpenPr(config.baseBranch, config.syncBranch);
    if (!pr) {
      const { aheadBy } = await repo.compare(config.syncBranch, config.baseBranch);
      if (aheadBy === 0) return { status: 'up_to_date' };
      pr = await repo.createPr({
        head: config.baseBranch,
        base: config.syncBranch,
        title: SYNC_PR_TITLE,
        body: `Report automatique de la publication de contenu sur ${config.syncBranch} (merge commit, cf. CONTRIBUTING.md).\n\n${auditTrailers(ctx)}`
      });
    }
    if (pr.autoMerge) return { status: 'auto_merge', prUrl: pr.url ?? null };
    try {
      await repo.enableAutoMerge(pr.nodeId, 'MERGE');
      log.info('publish.sync', { ...ctx.logFields, prNumber: pr.number, reason: 'auto_merge' });
      return { status: 'auto_merge', prUrl: pr.url ?? null };
    } catch {
      // Option « Allow auto-merge » désactivée : fusion manuelle via POST /api/publish/sync
      log.warn('publish.sync', { ...ctx.logFields, prNumber: pr.number, reason: 'auto_merge_unavailable' });
      return { status: 'opened', prUrl: pr.url ?? null };
    }
  } catch (err) {
    log.warn('publish.sync', { ...ctx.logFields, reason: err?.reason ?? 'sync_failed' });
    return { status: 'failed' };
  }
}

/** GET /api/publish/status */
export async function publishStatus(ctx) {
  const { config } = ctx;
  const repo = ctx.repo();
  const sync = await syncStatus(ctx);
  const headSha = await repo.getRef(config.draftBranch);
  if (!headSha) {
    return json(200, { ahead: 0, behind: 0, prUrl: null, previewUrl: config.previewUrl, checks: 'none', headSha: null, draftExists: false, sync });
  }
  const [{ aheadBy, behindBy }, pr] = await Promise.all([
    repo.compare(config.baseBranch, config.draftBranch),
    repo.findOpenPr(config.draftBranch, config.baseBranch)
  ]);
  const checks = aheadBy > 0 ? await repo.getChecks(headSha) : 'none';
  return json(200, { ahead: aheadBy, behind: behindBy ?? 0, prUrl: pr?.url ?? null, previewUrl: config.previewUrl, checks, headSha, draftExists: true, sync });
}

/** Met le brouillon à jour avec la base puis signale que la CI repart. */
async function updateDraftBranch(ctx, pr, headSha) {
  try {
    await ctx.repo().updatePrBranch(pr.number, headSha);
  } catch (err) {
    if (err instanceof RepoConflictError) {
      throw new ApiError(409, 'CONFLICT', { extra: { prUrl: pr.url ?? null, reason: 'update_branch_conflict' }, reason: err.reason });
    }
    throw err;
  }
  ctx.log.info('publish.branch_updated', { ...ctx.logFields, prNumber: pr.number });
  throw new ApiError(409, 'CHECKS_PENDING', { extra: { prUrl: pr.url ?? null, branchUpdated: true } });
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
  const { aheadBy, behindBy } = await repo.compare(config.baseBranch, config.draftBranch);
  if (aheadBy === 0) throw new ApiError(409, 'NOTHING_TO_PUBLISH');

  const title = `content: publication de ${aheadBy} modification(s) depuis /admin`;
  const existingPr = await repo.findOpenPr(config.draftBranch, config.baseBranch);
  const pr = existingPr ?? (await repo.createPr({
    head: config.draftBranch,
    base: config.baseBranch,
    title,
    body: `Publication demandée depuis /admin.\n\n${auditTrailers(ctx)}`
  }));

  // Ruleset « branche à jour » (strict) : un brouillon en retard sur la base ne peut pas être fusionné
  if (behindBy > 0) await updateDraftBranch(ctx, pr, headSha);

  // PR tout juste créée : la CI requise (déclenchée par pull_request) n'a pas encore démarré.
  // Les checks déjà présents sur ce commit (ex. Vercel) ne suffisent pas à fusionner.
  if (!existingPr) throw new ApiError(409, 'CHECKS_PENDING', { extra: { prUrl: pr.url ?? null } });

  const checks = await repo.getChecks(headSha);
  if (checks === 'pending' || checks === 'none') {
    throw new ApiError(409, 'CHECKS_PENDING', { extra: { prUrl: pr.url ?? null } });
  }
  if (checks === 'failure') throw new ApiError(422, 'CHECKS_FAILED', { extra: { prUrl: pr.url ?? null } });

  let merged;
  try {
    merged = await repo.mergePr(pr.number, { sha: body.expectedHeadSha, title, message: auditTrailers(ctx) });
  } catch (err) {
    if (!(err instanceof RepoConflictError)) throw err;
    log.info('content.conflict', { ...ctx.logFields, reason: err.reason, prNumber: pr.number });
    if (err.reason === 'not_mergeable') {
      // 405 « non fusionnable » : soit la base a avancé entre-temps (⇒ mise à jour du brouillon),
      // soit un check requis n'est pas encore terminé (⇒ simplement patienter).
      const { behindBy: behindNow } = await repo.compare(config.baseBranch, config.draftBranch);
      if (behindNow > 0) await updateDraftBranch(ctx, pr, headSha);
      throw new ApiError(409, 'CHECKS_PENDING', { extra: { prUrl: pr.url ?? null } });
    }
    throw new ApiError(409, 'CONFLICT', { extra: { currentSha: await repo.getRef(config.draftBranch).catch(() => null) } });
  }
  const mainSha = merged.sha ?? (await repo.getRef(config.baseBranch));

  // F4 : ne JAMAIS écraser un brouillon qui a reçu de nouveaux commits pendant la fusion
  const draftNow = await repo.getRef(config.draftBranch);
  if (draftNow !== body.expectedHeadSha) {
    log.warn('content.conflict', { ...ctx.logFields, reason: 'draft_moved_after_merge', commitSha: mainSha });
    throw new ApiError(409, 'CONFLICT', { extra: { currentSha: draftNow, merged: true, mainSha, prUrl: pr.url ?? null } });
  }
  // Brouillon réaligné sur la nouvelle base (force autorisé sur CETTE branche uniquement)
  await repo.updateRef(config.draftBranch, mainSha, true);
  log.info('publish.done', { ...ctx.logFields, commitSha: mainSha, prNumber: pr.number });
  const sync = await syncAfterPublish(ctx);
  return json(200, { merged: true, mainSha, prUrl: pr.url ?? null, sync });
}

/** POST /api/publish/sync — fusionne la PR base → develop si sa CI est verte (repli sans auto-merge). */
export async function mergeSync(ctx) {
  const { config, log } = ctx;
  await readJsonBody(ctx.request, MAX_BODY, { allowEmpty: true });
  if (!config.syncBranch) throw new ApiError(404, 'NOT_FOUND', { reason: 'sync_disabled' });
  const repo = ctx.repo();
  const pr = await repo.findOpenPr(config.baseBranch, config.syncBranch);
  if (!pr) throw new ApiError(409, 'NOTHING_TO_PUBLISH', { reason: 'no_sync_pr' });
  const checks = await repo.getChecks(pr.headSha);
  if (checks === 'pending' || checks === 'none') throw new ApiError(409, 'CHECKS_PENDING', { extra: { prUrl: pr.url ?? null } });
  if (checks === 'failure') throw new ApiError(422, 'CHECKS_FAILED', { extra: { prUrl: pr.url ?? null } });
  try {
    await repo.mergePr(pr.number, { sha: pr.headSha, title: SYNC_PR_TITLE, message: auditTrailers(ctx), method: 'merge' });
  } catch (err) {
    if (err instanceof RepoConflictError) throw new ApiError(409, 'CONFLICT', { extra: { prUrl: pr.url ?? null } });
    throw err;
  }
  log.info('publish.sync', { ...ctx.logFields, prNumber: pr.number, reason: 'merged' });
  return json(200, { merged: true, prUrl: pr.url ?? null });
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
