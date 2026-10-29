/* ================================================
   DÉPÔT GITHUB — petites enveloppes REST (Contents, Git refs, Compare,
   Pulls, Check runs) avec un jeton d'installation.
   Mapping d'erreurs : 409 (et 422 « sha ») ⇒ RepoConflictError ;
   401/403/404/5xx ⇒ 502 UPSTREAM (le message GitHub n'est jamais transmis) ;
   délai dépassé ⇒ 504 UPSTREAM_TIMEOUT.

   Cette interface (« repo ») est aussi implémentée par le backend fichier
   du mode développement (dev-backend.js).
   ================================================ */

import { createHash } from 'node:crypto';
import { ApiError } from './http.js';
import { GITHUB_API, API_VERSION } from './oauth.js';

const TIMEOUT_MS = 8000;

/** SHA d'un blob Git (même calcul que GitHub) : détecte un doublon sans écrire. */
export function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

/** Conflit d'écriture (sha périmé, tête de PR déplacée…). */
export class RepoConflictError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'RepoConflictError';
    this.reason = reason;
  }
}

const encodePath = p => p.split('/').map(encodeURIComponent).join('/');

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

/**
 * @param {{ config: object, fetch: typeof fetch, getToken: () => Promise<string> }} deps
 */
export function createGitHubRepo({ config, fetch: fetchImpl, getToken }) {
  const repoPath = `/repos/${encodeURIComponent(config.repoOwner)}/${encodeURIComponent(config.repoName)}`;

  async function call(method, path, { body, allow = [] } = {}) {
    const token = await getToken();
    let res;
    try {
      res = await fetchImpl(`${GITHUB_API}${repoPath}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': API_VERSION,
          'User-Agent': 'jokitsune-admin',
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new ApiError(504, 'UPSTREAM_TIMEOUT', { reason: `github_timeout ${method} ${path.split('?')[0]}` });
      throw new ApiError(502, 'UPSTREAM', { reason: 'github_network' });
    }
    if (res.ok || allow.includes(res.status)) {
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      return { status: res.status, data };
    }
    // Le corps GitHub n'est lu que pour décider d'un conflit (jamais transmis au client)
    const errBody = await res.json().catch(() => null);
    if (res.status === 409) throw new RepoConflictError('github_409');
    if (res.status === 422 && /sha/i.test(String(errBody?.message ?? ''))) throw new RepoConflictError('github_422_sha');
    throw new ApiError(502, 'UPSTREAM', { reason: `github_${res.status}` });
  }

  return {
    /** SHA de la tête d'une branche, ou null si elle n'existe pas. */
    async getRef(branch) {
      const { status, data } = await call('GET', `/git/ref/heads/${encodePath(branch)}`, { allow: [404] });
      return status === 404 ? null : data?.object?.sha ?? null;
    },

    async createRef(branch, sha) {
      await call('POST', '/git/refs', { body: { ref: `refs/heads/${branch}`, sha } });
    },

    async updateRef(branch, sha, force = false) {
      await call('PATCH', `/git/refs/heads/${encodePath(branch)}`, { body: { sha, force } });
    },

    /** Fichier sur une branche : { sha, size, content (octets ou null si > 1 Mo) } ou null. */
    async getFile(path, ref) {
      const { status, data } = await call('GET', `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, { allow: [404] });
      if (status === 404 || !data || Array.isArray(data) || data.type !== 'file') return null;
      const content = data.encoding === 'base64' && typeof data.content === 'string'
        ? new Uint8Array(Buffer.from(data.content, 'base64'))
        : null;
      return { sha: data.sha, size: data.size, content };
    },

    /** Contenu d'un dossier : [{ name, sha, size, type }]. */
    async listDir(path, ref) {
      const { status, data } = await call('GET', `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, { allow: [404] });
      if (status === 404 || !Array.isArray(data)) return [];
      return data.map(e => ({ name: e.name, sha: e.sha, size: e.size, type: e.type }));
    },

    /**
     * Crée ou remplace un fichier ; GitHub vérifie lui-même `sha` (verrou optimiste).
     * Auteur/committer NON surchargés : commit attribué au bot de l'App et signé.
     */
    async putFile({ path, branch, content, sha, message }) {
      const body = { message, content: toBase64(content), branch };
      if (sha) body.sha = sha;
      const { data } = await call('PUT', `/contents/${encodePath(path)}`, { body });
      return { sha: data?.content?.sha, commitSha: data?.commit?.sha };
    },

    /** Nombre de commits de `head` absents de `base`. */
    async compare(base, head) {
      const { data } = await call('GET', `/compare/${encodePath(base)}...${encodePath(head)}`);
      return { aheadBy: Number(data?.ahead_by ?? 0) };
    },

    async findOpenPr(head, base) {
      const q = `?state=open&head=${encodeURIComponent(`${config.repoOwner}:${head}`)}&base=${encodeURIComponent(base)}&per_page=5`;
      const { data } = await call('GET', `/pulls${q}`);
      const pr = Array.isArray(data) ? data[0] : null;
      return pr ? { number: pr.number, url: pr.html_url, headSha: pr.head?.sha } : null;
    },

    async createPr({ head, base, title, body }) {
      const { data } = await call('POST', '/pulls', { body: { head, base, title, body, maintainer_can_modify: false } });
      return { number: data.number, url: data.html_url, headSha: data.head?.sha };
    },

    async closePr(number) {
      await call('PATCH', `/pulls/${Number(number)}`, { body: { state: 'closed' } });
    },

    /** Agrégat des check runs d'un commit : none | pending | success | failure. */
    async getChecks(sha) {
      const { data } = await call('GET', `/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`);
      return aggregateChecks(data?.check_runs ?? []);
    },

    /** Fusion squash ; `sha` = tête attendue (sinon 409 GitHub ⇒ RepoConflictError). */
    async mergePr(number, { sha, title, message }) {
      try {
        const { data } = await call('PUT', `/pulls/${Number(number)}/merge`, {
          body: { merge_method: 'squash', sha, commit_title: title, commit_message: message }
        });
        return { sha: data?.sha };
      } catch (err) {
        if (err instanceof ApiError && err.reason === 'github_405') throw new RepoConflictError('not_mergeable');
        throw err;
      }
    }
  };
}

/** Réduit une liste de check runs à un statut unique. */
export function aggregateChecks(runs) {
  if (!runs.length) return 'none';
  if (runs.some(r => r.status !== 'completed')) return 'pending';
  const ok = new Set(['success', 'neutral', 'skipped']);
  return runs.every(r => ok.has(r.conclusion)) ? 'success' : 'failure';
}
