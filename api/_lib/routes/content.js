/* ================================================
   ROUTES DE CONTENU — liste, lecture, écriture (verrou optimiste par sha)
   ================================================ */

import { CONTENT_FILES, fileSchemas } from '../../../src/lib/schema.js';
import { validateForWrite } from '../../../src/lib/content-guard.js';
import { formatContentJson } from '../../../src/lib/content-format.js';
import { ApiError, json } from '../http.js';
import { RepoConflictError } from '../github-api.js';
import { readJsonBody } from '../body.js';
import { buildCommitMessage, ensureWorkBranch, readBranch, sanitizeSummary, workBranch } from '../branches.js';

const SHA_RE = /^[0-9a-f]{40}$/;
export const MAX_JSON_BODY = 256 * 1024;

const contentPath = file => `content/${file}.json`;

/** GET /api/content — fichiers de contenu de la branche de travail. */
export async function listContent(ctx) {
  const { branch } = await readBranch(ctx, 'draft');
  const entries = await ctx.repo().listDir('content', branch);
  const files = CONTENT_FILES.map(file => {
    const e = entries.find(x => x.name === `${file}.json`);
    return { file, sha: e?.sha ?? null, size: e?.size ?? 0 };
  });
  return json(200, { branch, files });
}

/** GET /api/content/:file?ref=draft|main */
export async function getContent(ctx) {
  const { file } = ctx.params;
  const refParam = ctx.url.searchParams.get('ref') ?? 'draft';
  if (refParam !== 'draft' && refParam !== 'main') throw new ApiError(400, 'BAD_REQUEST', { reason: 'bad_ref' });
  const { branch, ref } = await readBranch(ctx, refParam);
  const current = await ctx.repo().getFile(contentPath(file), branch);
  if (!current || !current.content) throw new ApiError(404, 'NOT_FOUND', { reason: 'file_absent' });
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(current.content));
  } catch {
    throw new ApiError(502, 'UPSTREAM', { reason: 'stored_json_invalid' });
  }
  return json(200, { file, ref, branch, sha: current.sha, data }, { ETag: `"${current.sha}"` });
}

/** Contenu stocké déjà canonique ? (comparaison après normalisation par le schéma) */
function canonicalOf(file, bytes) {
  try {
    const parsed = fileSchemas[file].safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? formatContentJson(parsed.data) : null;
  } catch {
    return null;
  }
}

/** PUT /api/content/:file — { baseSha, data, summary? } */
export async function putContent(ctx) {
  const { file } = ctx.params;
  const body = await readJsonBody(ctx.request, MAX_JSON_BODY);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'BAD_REQUEST', { reason: 'body_not_object' });
  const keys = Object.keys(body);
  if (keys.some(k => !['baseSha', 'data', 'summary'].includes(k))) throw new ApiError(400, 'BAD_REQUEST', { reason: 'unknown_field' });
  if (typeof body.baseSha !== 'string' || !SHA_RE.test(body.baseSha)) throw new ApiError(400, 'BAD_REQUEST', { reason: 'bad_base_sha' });
  if (body.summary !== undefined && (typeof body.summary !== 'string' || body.summary.length > 200)) {
    throw new ApiError(400, 'BAD_REQUEST', { reason: 'bad_summary' });
  }
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    throw new ApiError(422, 'VALIDATION', { details: [{ path: '', code: 'invalid_type' }] });
  }

  const result = validateForWrite(file, body.data);
  if (!result.ok) {
    ctx.log.info('content.invalid', { ...ctx.logFields, file, code: result.issues[0]?.code });
    throw new ApiError(422, 'VALIDATION', { details: result.issues });
  }

  const repo = ctx.repo();
  const path = contentPath(file);
  const { branch: readFrom } = await readBranch(ctx, 'draft');
  const current = await repo.getFile(path, readFrom);
  if (!current) throw new ApiError(409, 'CONFLICT', { extra: { currentSha: null }, reason: 'file_absent' });
  if (current.sha !== body.baseSha) {
    ctx.log.info('content.conflict', { ...ctx.logFields, file, reason: 'stale_base_sha' });
    throw new ApiError(409, 'CONFLICT', { extra: { currentSha: current.sha } });
  }

  const text = formatContentJson(result.data);
  const branch = workBranch(ctx.config);
  if (current.content && canonicalOf(file, current.content) === text) {
    return json(200, { file, sha: current.sha, commitSha: null, branch, unchanged: true });
  }

  await ensureWorkBranch(ctx);
  let written;
  try {
    written = await repo.putFile({
      path,
      branch,
      content: new TextEncoder().encode(text),
      sha: body.baseSha,
      message: buildCommitMessage(ctx, `content(${file}): ${sanitizeSummary(body.summary)}`)
    });
  } catch (err) {
    if (!(err instanceof RepoConflictError)) throw err;
    // Aucune nouvelle tentative : on relit le sha courant et on rend la main à l'utilisateur
    const latest = await repo.getFile(path, branch).catch(() => null);
    ctx.log.info('content.conflict', { ...ctx.logFields, file, reason: err.reason });
    throw new ApiError(409, 'CONFLICT', { extra: { currentSha: latest?.sha ?? null } });
  }
  ctx.log.info('content.write', { ...ctx.logFields, file, commitSha: written.commitSha });
  return json(200, { file, sha: written.sha, commitSha: written.commitSha, branch, unchanged: false });
}
