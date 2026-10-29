/* ================================================
   ROUTE D'UPLOAD — POST /api/upload?kind=cv&lang=fr|en | ?kind=image&name=…
   Corps = octets bruts. Content-Type exact, Content-Length obligatoire,
   magic bytes, nom généré serveur, remplacement de CV sous verrou sha.
   ================================================ */

import { ApiError, getContentLength, json, readBoundedBody } from '../http.js';
import { requireMediaType } from '../guard.js';
import { RepoConflictError, gitBlobSha } from '../github-api.js';
import { buildCommitMessage, ensureWorkBranch, workBranch } from '../branches.js';
import { ALLOWED_TYPES, LIMITS, cvPath, imagePath, inspectUpload, publicUrl } from '../upload.js';

const SHA_RE = /^[0-9a-f]{40}$/;

export async function upload(ctx) {
  const { request, url, log } = ctx;
  const kind = url.searchParams.get('kind');
  if (kind !== 'cv' && kind !== 'image') throw new ApiError(400, 'BAD_REQUEST', { reason: 'bad_kind' });
  const lang = url.searchParams.get('lang');
  if (kind === 'cv' && lang !== 'fr' && lang !== 'en') throw new ApiError(400, 'BAD_REQUEST', { reason: 'bad_lang' });
  const label = url.searchParams.get('name') ?? '';
  if (label.length > 200) throw new ApiError(400, 'BAD_REQUEST', { reason: 'bad_name' });
  const baseSha = request.headers.get('x-base-sha');
  if (baseSha !== null && !SHA_RE.test(baseSha)) throw new ApiError(400, 'BAD_REQUEST', { reason: 'bad_base_sha' });

  const reject = (status, code, reason) => {
    log.info('upload.rejected', { ...ctx.logFields, kind, reason });
    throw new ApiError(status, code, { reason, ...(status === 422 ? { details: [{ path: '', code: reason }] } : {}) });
  };

  // Type déclaré : liste blanche stricte (SVG, GIF, HTML… ⇒ 415)
  let declared;
  try {
    declared = requireMediaType(request, Object.keys(ALLOWED_TYPES[kind]));
  } catch {
    reject(415, 'UNSUPPORTED_MEDIA_TYPE', 'type_not_allowed');
  }
  const length = getContentLength(request);
  if (length === null) reject(411, 'LENGTH_REQUIRED', 'length_missing');
  if (length > LIMITS[kind]) reject(413, 'PAYLOAD_TOO_LARGE', 'too_large');

  let bytes;
  try {
    // Lecture bornée au plus petit de la taille déclarée et de la limite (Content-Length mensonger ⇒ 413)
    bytes = await readBoundedBody(request, Math.min(length, LIMITS[kind]));
  } catch (err) {
    if (err instanceof ApiError && err.status === 413) reject(413, 'PAYLOAD_TOO_LARGE', 'too_large');
    throw err;
  }

  const check = inspectUpload(kind, declared, bytes);
  if (!check.ok) reject(check.status, check.code, check.reason);

  const repo = ctx.repo();
  const branch = workBranch(ctx.config);
  const path = kind === 'cv' ? cvPath(lang) : imagePath(label, bytes, check.detected);
  const fileUrl = publicUrl(path);
  await ensureWorkBranch(ctx);
  const existing = await repo.getFile(path, branch);

  // Doublon exact : pas de nouveau commit
  if (existing && existing.sha === gitBlobSha(bytes)) {
    return json(200, { path, url: fileUrl, duplicate: true });
  }
  if (kind === 'image' && existing) return json(200, { path, url: fileUrl, duplicate: true });
  if (kind === 'cv' && (existing?.sha ?? null) !== baseSha) {
    log.info('upload.rejected', { ...ctx.logFields, kind, reason: 'stale_base_sha' });
    throw new ApiError(409, 'CONFLICT', { extra: { currentSha: existing?.sha ?? null } });
  }

  const subject = existing ? `remplacement ${path.replace(/^public\//, '')}` : `ajout ${path.replace(/^public\//, '')}`;
  let written;
  try {
    written = await repo.putFile({
      path,
      branch,
      content: bytes,
      sha: existing?.sha,
      message: buildCommitMessage(ctx, `content(assets): ${subject}`)
    });
  } catch (err) {
    if (!(err instanceof RepoConflictError)) throw err;
    const latest = await repo.getFile(path, branch).catch(() => null);
    throw new ApiError(409, 'CONFLICT', { extra: { currentSha: latest?.sha ?? null } });
  }
  log.info('upload.accepted', { ...ctx.logFields, kind, path, size: bytes.length, mediaType: check.detected, commitSha: written.commitSha });
  return json(201, { path, url: fileUrl, sha: written.sha, commitSha: written.commitSha, warnings: check.warnings });
}
