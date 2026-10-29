/* ================================================
   BRANCHES ET MESSAGES DE COMMIT
   Mode « pr » (recommandé) : lectures/écritures sur la branche brouillon,
   publication par PR vers la branche de base. Mode « direct » : base.
   ================================================ */

/** Branche où l'admin écrit. */
export function workBranch(config) {
  return config.publishMode === 'pr' ? config.draftBranch : config.baseBranch;
}

/**
 * Branche à lire. Une requête GET ne crée jamais la branche brouillon :
 * tant qu'elle n'existe pas, on lit la base (mêmes sha de blobs).
 * @param {'draft' | 'main'} which
 */
export async function readBranch(ctx, which) {
  const { config } = ctx;
  if (which === 'main' || config.publishMode !== 'pr') return { branch: config.baseBranch, ref: which, draftExists: false };
  const draftSha = await ctx.repo().getRef(config.draftBranch);
  return draftSha
    ? { branch: config.draftBranch, ref: 'draft', draftExists: true }
    : { branch: config.baseBranch, ref: 'draft', draftExists: false };
}

/** Crée la branche brouillon depuis la base si elle n'existe pas (mutations uniquement). */
export async function ensureWorkBranch(ctx) {
  const { config } = ctx;
  if (config.publishMode !== 'pr') return;
  const repo = ctx.repo();
  if (await repo.getRef(config.draftBranch)) return;
  const baseSha = await repo.getRef(config.baseBranch);
  await repo.createRef(config.draftBranch, baseSha);
}

/** Résumé fourni par l'admin : caractères autorisés seulement, 60 max, une ligne. */
export function sanitizeSummary(summary) {
  const s = String(summary ?? '')
    .replace(/[^\p{L}\p{N} .,'()-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  return s || 'mise à jour depuis /admin';
}

/** Message Conventional avec trailers d'audit (Admin-Actor / Admin-Session / Admin-Request-Id). */
export function buildCommitMessage(ctx, subject) {
  const { session, requestId } = ctx;
  return [
    subject.replace(/[\r\n]+/g, ' ').slice(0, 100),
    '',
    `Admin-Actor: ${session.login} (id ${session.sub})`,
    `Admin-Session: ${session.sid.slice(0, 8)}`,
    `Admin-Request-Id: ${requestId}`
  ].join('\n');
}
