/* ================================================
   GARDE-FOUS DU CONTENU — partagés serveur (api/) et panneau /admin
   Pur, sans DOM ni Node : importable partout.

   Complète le schéma zod (src/lib/schema.js) avec les règles de la spec
   de sécurité de l'admin (§ 6.1 / 6.2) :
     - clés interdites (__proto__, constructor, prototype) ;
     - profondeur ≤ 6, nombre de nœuds ≤ 5 000, listes ≤ 200 éléments ;
     - chaînes normalisées NFC, <br> → "\n", tout autre balisage refusé ;
     - caractères de contrôle (hors "\n") et bidirectionnels refusés ;
     - `order` entier 0–9999 ; URL http: refusées (https uniquement).
   Les erreurs sont exprimées en { path, code } : jamais d'écho de la valeur.
   ================================================ */

import { fileSchemas, CONTENT_FILES } from './schema.js';

export const MAX_DEPTH = 6;
export const MAX_NODES = 5000;
export const MAX_LIST_ITEMS = 200;
export const MAX_ORDER = 9999;

/** Nom de fichier de contenu accepté dans une URL d'API (avant la liste blanche). */
export const CONTENT_FILE_RE = /^[a-z][a-z0-9-]{0,39}$/;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const URL_KEYS = new Set(['url', 'href', 'src']);

// <br>, <br/>, <br />, insensible à la casse
const BR_RE = /<br\s*\/?>/gi;
// Tout autre début de balise : « < » suivi d'une lettre, « / », « ! » ou « ? »
const TAG_RE = /<[A-Za-z/!?]/;
// Contrôles C0/C1 sauf \n (U+000A)
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;
// Marques et isolats bidirectionnels (usurpation visuelle)
const BIDI_RE = /[‎‏‪-‮⁦-⁩]/;

/** Le fichier fait-il partie de la liste blanche ? */
export function isContentFile(name) {
  return typeof name === 'string' && CONTENT_FILE_RE.test(name) && CONTENT_FILES.includes(name);
}

/**
 * JSON.parse durci : les clés interdites sont collectées (et retirées) au lieu
 * d'être recopiées. Lève SyntaxError si le JSON est illisible.
 * @param {string} text
 * @returns {{ value: unknown, forbiddenKeys: string[] }}
 */
export function parseJsonSafe(text) {
  const forbiddenKeys = [];
  const value = JSON.parse(text, function reviver(key, val) {
    if (FORBIDDEN_KEYS.has(key)) {
      forbiddenKeys.push(key);
      return undefined; // propriété supprimée
    }
    return val;
  });
  return { value, forbiddenKeys };
}

/**
 * Normalise une chaîne de contenu.
 * @returns {{ value: string, code?: string }}
 */
export function normalizeText(input) {
  const value = String(input).normalize('NFC').replace(/\r\n?/g, '\n').replace(BR_RE, '\n');
  if (TAG_RE.test(value)) return { value, code: 'html_forbidden' };
  if (BIDI_RE.test(value)) return { value, code: 'bidi_forbidden' };
  if (CONTROL_RE.test(value)) return { value, code: 'control_char' };
  return { value };
}

const joinPath = (base, key) =>
  typeof key === 'number' ? `${base}[${key}]` : base ? `${base}.${key}` : String(key);

/**
 * Parcourt et normalise une valeur JSON (copie profonde, sans prototype hérité dangereux).
 * @param {unknown} data
 * @returns {{ data: unknown, issues: { path: string, code: string }[] }}
 */
export function hardenContent(data) {
  const issues = [];
  let nodes = 0;
  let tooDeep = false;

  function walk(value, path, depth, key) {
    nodes += 1;
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'string') {
        const res = normalizeText(value);
        if (res.code) issues.push({ path, code: res.code });
        if (URL_KEYS.has(key) && /^\s*http:/i.test(res.value)) issues.push({ path, code: 'url_forbidden' });
        return res.value;
      }
      if (key === 'order' && typeof value === 'number' && !(Number.isInteger(value) && value >= 0 && value <= MAX_ORDER)) {
        issues.push({ path, code: 'out_of_range' });
      }
      return value;
    }
    if (depth > MAX_DEPTH) {
      tooDeep = true;
      return null;
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_LIST_ITEMS) issues.push({ path, code: 'too_many' });
      return value.slice(0, MAX_LIST_ITEMS).map((v, i) => walk(v, joinPath(path, i), depth + 1, i));
    }
    const out = {};
    for (const k of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(k)) {
        issues.push({ path: joinPath(path, k), code: 'forbidden_key' });
        continue;
      }
      out[k] = walk(value[k], joinPath(path, k), depth + 1, k);
    }
    return out;
  }

  const result = walk(data, '', 1, '');
  if (tooDeep) issues.push({ path: '', code: 'too_deep' });
  if (nodes > MAX_NODES) issues.push({ path: '', code: 'too_many_nodes' });
  return { data: result, issues };
}

/* -------- Traduction des issues zod en { path, code } -------- */

function pathToString(segments) {
  return segments.reduce((acc, seg) => joinPath(acc, seg), '');
}

function mapIssue(issue, prefix = []) {
  const segs = [...prefix, ...issue.path];
  const path = pathToString(segs);
  switch (issue.code) {
    case 'too_big':
      return [{ path, code: issue.origin === 'string' ? 'too_long' : issue.origin === 'array' ? 'too_many' : 'too_big' }];
    case 'too_small':
      return [{ path, code: issue.origin === 'string' ? 'too_short' : 'too_small' }];
    case 'invalid_format': {
      const last = segs[segs.length - 1];
      if (URL_KEYS.has(last)) return [{ path, code: 'invalid_url' }];
      return [{ path, code: /[<>]/.test(String(issue.pattern ?? '')) ? 'html_forbidden' : 'invalid_format' }];
    }
    case 'unrecognized_keys':
      return (issue.keys ?? []).map(k => ({ path: joinPath(path, k), code: 'unknown_key' }));
    case 'invalid_value':
      return [{ path, code: 'invalid_enum' }];
    case 'invalid_type':
      // zod n'expose pas la valeur reçue (et c'est voulu) : on lit le message par défaut
      return [{ path, code: /received undefined/i.test(issue.message ?? '') ? 'required' : 'invalid_type' }];
    case 'invalid_union': {
      // Texte traduisible (chaîne | {fr,en}) : on remonte la branche la plus pertinente,
      // c.-à-d. celle qui n'échoue pas dès le type racine.
      const branches = (issue.errors ?? []).filter(b => !b.some(i => i.code === 'invalid_type' && i.path.length === 0));
      const best = (branches.length ? branches : issue.errors ?? [])
        .slice()
        .sort((a, b) => a.length - b.length)[0];
      if (best?.length) return best.flatMap(i => mapIssue(i, segs));
      return [{ path, code: 'invalid_union' }];
    }
    case 'custom':
      if (URL_KEYS.has(segs[segs.length - 1]) || URL_KEYS.has(segs[segs.length - 2])) return [{ path, code: 'invalid_url' }];
      if (/double/i.test(issue.message ?? '')) return [{ path, code: 'duplicate_id' }];
      if (/description|bullets/.test(issue.message ?? '')) return [{ path, code: 'description_xor_bullets' }];
      return [{ path, code: 'invalid' }];
    default:
      return [{ path, code: issue.code ?? 'invalid' }];
  }
}

/**
 * Validation complète avant écriture (serveur, et client pour le confort).
 * @param {string} file nom du fichier de contenu (sans .json)
 * @param {unknown} input contenu déjà parsé
 * @returns {{ ok: true, data: any, issues: [] } | { ok: false, data: null, issues: { path: string, code: string }[] }}
 */
export function validateForWrite(file, input) {
  const schema = fileSchemas[file];
  if (!schema) return { ok: false, data: null, issues: [{ path: '', code: 'unknown_file' }] };
  const hardened = hardenContent(input);
  if (hardened.issues.length) return { ok: false, data: null, issues: dedupe(hardened.issues) };
  const res = schema.safeParse(hardened.data);
  if (!res.success) return { ok: false, data: null, issues: dedupe(res.error.issues.flatMap(i => mapIssue(i))) };
  return { ok: true, data: res.data, issues: [] };
}

function dedupe(issues) {
  const seen = new Set();
  return issues.filter(i => {
    const k = `${i.path}|${i.code}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 100);
}

/** Libellés français des codes d'erreur (affichage admin). */
export const ISSUE_LABELS = {
  html_forbidden: 'Balisage HTML interdit (seuls les retours à la ligne sont permis ; « < » et « > » sont refusés)',
  bidi_forbidden: 'Caractère bidirectionnel interdit',
  control_char: 'Caractère de contrôle interdit',
  url_forbidden: 'URL non sécurisée (https:// obligatoire)',
  invalid_url: 'URL non autorisée',
  out_of_range: 'Valeur hors limites (0 à 9999)',
  too_many: 'Trop d’éléments',
  forbidden_key: 'Clé interdite',
  too_deep: 'Structure trop profonde',
  too_many_nodes: 'Contenu trop volumineux',
  too_long: 'Texte trop long',
  too_short: 'Valeur trop courte',
  too_big: 'Valeur trop grande',
  too_small: 'Valeur trop petite',
  invalid_format: 'Format invalide',
  unknown_key: 'Champ inconnu',
  invalid_enum: 'Valeur non autorisée',
  required: 'Champ obligatoire',
  invalid_type: 'Type de valeur incorrect',
  duplicate_id: 'Identifiant en double',
  description_xor_bullets: 'Renseigner soit la description, soit les puces (exactement l’un des deux)',
  unknown_file: 'Fichier inconnu',
  invalid: 'Valeur invalide'
};
