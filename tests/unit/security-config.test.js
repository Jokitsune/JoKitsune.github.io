// Vérifications statiques : en-têtes vercel.json (T-HDR-*), absence de sinks
// HTML (T-PUB-01), variables d'environnement documentées, Pages sans admin.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { headersFor } from '../../src/vite/admin-plugin.js';
import { ROOT } from './helpers.js';

const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const ADMIN_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none'";
const get = (pathname, key) => headersFor(vercel, pathname).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];

describe('vercel.json — en-têtes', () => {
  it('T-HDR-01 : en-têtes globaux', () => {
    for (const p of ['/', '/index.html', '/admin/', '/api/auth/me']) {
      expect(get(p, 'Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains');
      expect(get(p, 'X-Content-Type-Options')).toBe('nosniff');
      expect(get(p, 'X-Frame-Options')).toBe('DENY');
      expect(get(p, 'Cross-Origin-Opener-Policy')).toBe('same-origin');
      expect(get(p, 'Permissions-Policy')).toContain('camera=()');
    }
    expect(get('/', 'Content-Security-Policy-Report-Only')).toContain("frame-ancestors 'none'");
  });

  it('T-HDR-02 : /admin et /admin/ — CSP exacte, noindex, no-store, no-referrer', () => {
    for (const p of ['/admin', '/admin/', '/admin/index.html']) {
      expect(get(p, 'Content-Security-Policy'), p).toBe(ADMIN_CSP);
      expect(get(p, 'X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
      expect(get(p, 'Cache-Control')).toBe('no-store');
      expect(get(p, 'Referrer-Policy')).toBe('no-referrer');
    }
    expect(ADMIN_CSP).not.toMatch(/unsafe-|https?:/);
  });

  it('/api : CSP fermée, noindex, no-store', () => {
    expect(get('/api/content/projects', 'Content-Security-Policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(get('/api/auth/me', 'X-Robots-Tag')).toBe('noindex, nofollow');
    expect(get('/api/auth/me', 'Cache-Control')).toBe('no-store');
  });

  it('PDF servis avec CSP sandbox', () => {
    for (const p of ['/files/cv-fr.pdf', '/asset/Jordan_de_SOUZA_CV.pdf']) {
      expect(get(p, 'Content-Security-Policy')).toMatch(/^sandbox;/);
      expect(get(p, 'Content-Type')).toBe('application/pdf');
    }
  });

  it('redirection /admin → /admin/ et aucun en-tête CORS', () => {
    expect(vercel.redirects).toContainEqual({ source: '/admin', destination: '/admin/', permanent: false });
    expect(JSON.stringify(vercel)).not.toMatch(/Access-Control-Allow/i);
  });
});

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('T-PUB-01 — aucun sink HTML dans le code applicatif', () => {
  it('src/, api/, admin/ : ni innerHTML, ni outerHTML, ni insertAdjacentHTML, ni document.write', () => {
    const files = ['src', 'api', 'admin'].flatMap(d => walk(path.join(ROOT, d))).filter(f => /\.(js|html)$/.test(f));
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, path.relative(ROOT, file)).not.toMatch(/\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write/);
    }
  });

  it('admin/index.html : aucun script ni style inline', () => {
    const html = readFileSync(path.join(ROOT, 'admin/index.html'), 'utf8');
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      expect(m[1]).toMatch(/\bsrc=/);
      expect(m[2].trim()).toBe('');
    }
    expect(html).not.toMatch(/<style\b|\sstyle=|\son[a-z]+=/i);
  });
});

describe('Variables d’environnement', () => {
  it('.env.example déclare toutes les variables lues par api/_lib/config.js, sans valeur secrète', () => {
    const example = readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    const config = readFileSync(path.join(ROOT, 'api/_lib/config.js'), 'utf8');
    const used = new Set([...config.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map(m => m[1]));
    for (const name of used) {
      if (['VERCEL', 'VERCEL_ENV', 'NODE_ENV'].includes(name)) continue;
      expect(example, name).toMatch(new RegExp(`^#?\\s*${name}=`, 'm'));
    }
    for (const secret of ['GITHUB_OAUTH_CLIENT_SECRET', 'GITHUB_APP_PRIVATE_KEY_B64', 'SESSION_SECRET']) {
      expect(example).toMatch(new RegExp(`^${secret}=$`, 'm'));
    }
  });

  it('aucune variable VITE_* (exposée au navigateur) dans le code admin', () => {
    const files = walk(path.join(ROOT, 'src/admin'));
    for (const f of files) expect(readFileSync(f, 'utf8')).not.toMatch(/import\.meta\.env\.VITE_|process\.env/);
  });
});

describe('T-PAGES-01 — le build GitHub Pages exclut /admin', () => {
  it('le workflow Pages construit avec BUILD_TARGET=pages et vérifie dist/', () => {
    const wf = readFileSync(path.join(ROOT, '.github/workflows/deploy-pages.yml'), 'utf8');
    expect(wf).toMatch(/BUILD_TARGET: pages/);
    expect(wf).toMatch(/check-dist\.mjs --pages/);
  });
});
