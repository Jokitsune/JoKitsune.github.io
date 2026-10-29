/* ================================================
   LIMITEUR DE DÉBIT EN MÉMOIRE (best-effort)
   Seau à jetons par (groupe, IP). Par instance de fonction, perdu à chaque
   démarrage à froid : défense en profondeur uniquement. Le contrôle
   principal est le pare-feu Vercel (WAF), cf. docs/ADMIN.md.
   ================================================ */

export const DEFAULT_LIMITS = {
  auth: { capacity: 10, perMs: 60_000 },
  api: { capacity: 60, perMs: 60_000 }
};

const MAX_KEYS = 5000;

/**
 * @param {{ limits?: typeof DEFAULT_LIMITS, now?: () => number }} [opts]
 */
export function createRateLimiter({ limits = DEFAULT_LIMITS, now = Date.now } = {}) {
  const buckets = new Map();
  return {
    /**
     * Consomme un jeton.
     * @returns {{ ok: true } | { ok: false, retryAfter: number }}
     */
    take(group, ip) {
      const { capacity, perMs } = limits[group] ?? limits.api;
      const key = `${group}|${ip}`;
      const t = now();
      let b = buckets.get(key);
      if (!b) {
        if (buckets.size >= MAX_KEYS) buckets.clear(); // borne mémoire
        b = { tokens: capacity, last: t };
        buckets.set(key, b);
      }
      const rate = capacity / perMs;
      b.tokens = Math.min(capacity, b.tokens + (t - b.last) * rate);
      b.last = t;
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return { ok: true };
      }
      return { ok: false, retryAfter: Math.max(1, Math.ceil((1 - b.tokens) / rate / 1000)) };
    }
  };
}
