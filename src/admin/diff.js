/* ================================================
   DIFFÉRENCES ENTRE DEUX VERSIONS D'UN FICHIER (affichage des conflits)
   Pur, sans DOM : liste des chemins dont la valeur diffère.
   ================================================ */

const isObj = v => v !== null && typeof v === 'object';
const joinPath = (base, key) => (typeof key === 'number' ? `${base}[${key}]` : base ? `${base}.${key}` : String(key));

/**
 * @param {unknown} mine version locale
 * @param {unknown} theirs version distante
 * @param {number} [limit]
 * @returns {{ path: string, mine: unknown, theirs: unknown }[]}
 */
export function diffValues(mine, theirs, limit = 200) {
  const out = [];
  (function walk(a, b, path) {
    if (out.length >= limit) return;
    if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) {
      const keys = Array.isArray(a)
        ? [...Array(Math.max(a.length, b.length)).keys()]
        : [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (const k of keys) walk(a[k], b[k], joinPath(path, k));
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: path || '(racine)', mine: a, theirs: b });
  })(mine, theirs, '');
  return out;
}

/** Représentation textuelle courte d'une valeur. */
export function preview(value, max = 160) {
  if (value === undefined) return '(absent)';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
