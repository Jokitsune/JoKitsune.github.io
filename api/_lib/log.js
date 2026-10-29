/* ================================================
   JOURNALISATION STRUCTURÉE — une ligne JSON par événement
   Redaction par LISTE BLANCHE : seuls les champs ci-dessous sont émis,
   et uniquement s'ils sont des scalaires courts. Cookies, en-têtes, code,
   state, verifier, jetons, clés, corps de requête : jamais journalisés.
   ================================================ */

const ALLOWED_FIELDS = new Set([
  'route', 'method', 'status', 'durationMs', 'requestId', 'sid', 'actorId',
  'githubId', 'login', 'reason', 'file', 'path', 'kind', 'commitSha', 'ip',
  'var', 'code', 'size', 'mediaType', 'prNumber', 'checks', 'errorName', 'stack', 'devMode'
]);

const LEVELS = { info: 10, warn: 20, error: 30 };

// Garde-fou supplémentaire : motifs de secrets connus masqués même dans un champ autorisé
const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // jetons GitHub
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
];

function clean(value, key) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  let s = value.slice(0, key === 'stack' ? 2000 : 200);
  for (const re of SECRET_PATTERNS) s = s.replace(re, '[redacted]');
  return s;
}

/**
 * @param {{ level?: 'info'|'warn'|'error', sink?: (line: string) => void, now?: () => number }} [opts]
 */
export function createLogger({ level = 'info', sink = line => console.log(line), now = Date.now } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  function emit(lvl, event, fields = {}) {
    if (LEVELS[lvl] < min) return;
    const entry = { ts: new Date(now()).toISOString(), level: lvl, event };
    for (const [k, v] of Object.entries(fields)) {
      if (!ALLOWED_FIELDS.has(k)) continue;
      const c = clean(v, k);
      if (c !== undefined) entry[k] = c;
    }
    sink(JSON.stringify(entry));
  }
  return {
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
    /** Nouveau logger de même niveau (utile pour changer le niveau après lecture de la config). */
    withLevel: lvl => createLogger({ level: lvl, sink, now })
  };
}
