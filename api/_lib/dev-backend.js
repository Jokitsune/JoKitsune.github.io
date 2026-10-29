/* ================================================
   BACKEND FICHIER LOCAL — mode développement (ADMIN_DEV_MODE=1) uniquement
   Simule l'interface « repo » de github-api.js sans aucun appel réseau :
     - branche de base  = fichiers du dépôt local, surchargés par <dataDir>/main/
     - branche brouillon = <dataDir>/draft/ par-dessus la base
   Rien n'est jamais écrit dans content/ ni public/ du dépôt : tout reste
   dans <dataDir> (par défaut .admin-dev/, ignoré par Git).
   Refuse de s'initialiser hors développement (cf. assertDevModeAllowed).
   ================================================ */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertDevModeAllowed } from './config.js';
import { RepoConflictError, gitBlobSha } from './github-api.js';


/**
 * @param {{ config: object, env: Record<string,string|undefined>, rootDir?: string }} opts
 */
export function createDevRepo({ config, env, rootDir = process.cwd() }) {
  assertDevModeAllowed(env);
  const dataDir = path.resolve(rootDir, config.devDataDir);
  const { baseBranch, draftBranch } = config;
  const statePath = path.join(dataDir, 'state.json');
  mkdirSync(dataDir, { recursive: true });

  const dirFor = branch => path.join(dataDir, branch === baseBranch ? 'main' : 'draft');

  // Le dossier peut être supprimé pendant que le serveur tourne : état initial recréé à la volée
  function loadState() {
    if (!existsSync(statePath)) return { refs: { [baseBranch]: sha1('init'), [draftBranch]: null }, commits: 0, pr: null, prSeq: 0, sync: null };
    return JSON.parse(readFileSync(statePath, 'utf8'));
  }
  function saveState(s) {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(statePath, JSON.stringify(s, null, 2));
  }
  function sha1(s) {
    return createHash('sha1').update(s).digest('hex');
  }
  function safeJoin(base, rel) {
    const full = path.resolve(base, rel);
    if (!full.startsWith(path.resolve(base) + path.sep)) throw new Error('chemin hors du bac à sable');
    return full;
  }
  function readLayer(branch, rel) {
    const state = loadState();
    const layers = branch === baseBranch || !state.refs[draftBranch]
      ? [dirFor(baseBranch), rootDir]
      : [dirFor(draftBranch), dirFor(baseBranch), rootDir];
    for (const dir of layers) {
      const full = safeJoin(dir, rel);
      if (existsSync(full) && statSync(full).isFile()) return new Uint8Array(readFileSync(full));
    }
    return null;
  }
  function listLayer(branch, rel) {
    const state = loadState();
    const layers = branch === baseBranch || !state.refs[draftBranch]
      ? [dirFor(baseBranch), rootDir]
      : [dirFor(draftBranch), dirFor(baseBranch), rootDir];
    const names = new Set();
    for (const dir of layers) {
      const full = safeJoin(dir, rel);
      if (existsSync(full) && statSync(full).isDirectory()) readdirSync(full).forEach(n => names.add(n));
    }
    return [...names];
  }
  function copyTree(from, to) {
    if (!existsSync(from)) return;
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) copyTree(src, dst);
      else {
        mkdirSync(path.dirname(dst), { recursive: true });
        writeFileSync(dst, readFileSync(src));
      }
    }
  }

  return {
    devMode: true,

    async getRef(branch) {
      return loadState().refs[branch] ?? null;
    },

    async createRef(branch, sha) {
      const s = loadState();
      s.refs[branch] = sha;
      saveState(s);
    },

    async updateRef(branch, sha) {
      const s = loadState();
      if (branch === draftBranch && sha === s.refs[baseBranch]) {
        rmSync(dirFor(draftBranch), { recursive: true, force: true });
        s.commits = 0;
      }
      s.refs[branch] = sha;
      saveState(s);
    },

    async getFile(rel, ref) {
      const bytes = readLayer(ref, rel);
      return bytes ? { sha: gitBlobSha(bytes), size: bytes.byteLength, content: bytes } : null;
    },

    async listDir(rel, ref) {
      return listLayer(ref, rel).flatMap(name => {
        const bytes = readLayer(ref, `${rel}/${name}`);
        return bytes ? [{ name, sha: gitBlobSha(bytes), size: bytes.byteLength, type: 'file' }] : [];
      });
    },

    async putFile({ path: rel, branch, content, sha }) {
      const current = readLayer(branch, rel);
      const currentSha = current ? gitBlobSha(current) : null;
      if (currentSha !== (sha ?? null)) throw new RepoConflictError('dev_sha_mismatch');
      const full = safeJoin(dirFor(branch), rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
      const s = loadState();
      const blob = gitBlobSha(content);
      s.refs[branch] = sha1(`${s.refs[branch]}:${rel}:${blob}`);
      if (branch === draftBranch) s.commits += 1;
      saveState(s);
      return { sha: blob, commitSha: s.refs[branch] };
    },

    async compare(base, head) {
      const s = loadState();
      // PR de synchronisation base → develop : « en avance » tant qu'une publication n'est pas reportée
      if (head === baseBranch && base === config.syncBranch) return { aheadBy: s.syncPending ? 1 : 0, behindBy: 0 };
      return { aheadBy: head === draftBranch && s.refs[draftBranch] ? s.commits : 0, behindBy: 0 };
    },

    async findOpenPr(head, base) {
      const s = loadState();
      if (head === baseBranch && base === config.syncBranch) {
        return s.sync?.open ? { number: s.sync.number, url: null, headSha: s.refs[baseBranch], nodeId: 'dev-sync', autoMerge: s.sync.autoMerge } : null;
      }
      return s.pr && s.pr.open ? { number: s.pr.number, url: null, headSha: s.refs[draftBranch], nodeId: 'dev-pr', autoMerge: false } : null;
    },

    async createPr({ head }) {
      const s = loadState();
      s.prSeq += 1;
      if (head === baseBranch) s.sync = { number: s.prSeq, open: true, autoMerge: false };
      else s.pr = { number: s.prSeq, open: true };
      saveState(s);
      return { number: s.prSeq, url: null, headSha: s.refs[head], nodeId: `dev-${s.prSeq}`, autoMerge: false };
    },

    async closePr() {
      const s = loadState();
      if (s.pr) s.pr.open = false;
      saveState(s);
    },

    // En développement, la « CI » est considérée verte
    async getChecks() {
      return 'success';
    },

    // Rien à faire : le brouillon simulé n'est jamais en retard sur la base
    async updatePrBranch() {},

    // Auto-merge simulé : la « CI » étant verte, la synchro est fusionnée aussitôt
    async enableAutoMerge() {
      const s = loadState();
      if (s.sync) s.sync = { ...s.sync, open: false, autoMerge: true };
      s.syncPending = false;
      saveState(s);
    },

    async mergePr(number, { sha, method = 'squash' }) {
      const s = loadState();
      if (method === 'merge' && s.sync?.number === number) {
        s.sync.open = false;
        s.syncPending = false;
        saveState(s);
        return { sha: s.refs[baseBranch] };
      }
      if (sha !== s.refs[draftBranch]) throw new RepoConflictError('dev_head_moved');
      copyTree(dirFor(draftBranch), dirFor(baseBranch));
      s.refs[baseBranch] = sha1(`${s.refs[baseBranch]}:merge:${sha}`);
      if (s.pr) s.pr.open = false;
      s.syncPending = true;
      saveState(s);
      return { sha: s.refs[baseBranch] };
    }
  };
}
