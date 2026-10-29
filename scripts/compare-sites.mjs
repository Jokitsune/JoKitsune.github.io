#!/usr/bin/env node
/* ================================================
   Non-régression visuelle et DOM entre deux versions du site.

   Usage :
     node scripts/compare-sites.mjs <référence> <candidat> [dossierSortie]
   où <référence> / <candidat> sont une URL (http://…) ou un dossier local
   (servi par un mini serveur statique intégré).

   Pour chaque viewport (desktop, mobile) et chaque langue (fr, en) :
     - signature DOM (balise, id, classes, attributs visibles, texte normalisé)
       de la page et de l'écran de boot, avec diff ligne à ligne ;
     - capture pleine page + diff pixel (pixelmatch).
   Code de sortie 1 si une différence est détectée.
   ================================================ */

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [, , refArg, candArg, outArg = 'test-results/compare'] = process.argv;
if (!refArg || !candArg) {
  console.error('Usage : node scripts/compare-sites.mjs <référence> <candidat> [dossierSortie]');
  process.exit(2);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.pdf': 'application/pdf', '.svg': 'image/svg+xml', '.png': 'image/png' };

/** Mini serveur statique (évite une dépendance supplémentaire). */
async function serveDir(dir) {
  const root = path.resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root)) throw new Error('hors racine');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

async function resolveTarget(arg) {
  if (/^https?:\/\//.test(arg)) return { url: arg, close() {} };
  await stat(arg);
  return serveDir(arg);
}

/** Signature DOM : une ligne par élément visible dans l'arbre. */
function domSignature(rootSelector) {
  const ATTRS = ['href', 'title', 'aria-label', 'aria-hidden', 'aria-expanded', 'aria-controls', 'role', 'placeholder', 'data-card', 'data-lang', 'data-text', 'download', 'type', 'name', 'for', 'style', 'src', 'target', 'rel', 'viewBox', 'd'];
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const out = [];
  const walk = (el, depth) => {
    if (['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT'].includes(el.tagName)) return;
    const cls = [...el.classList].sort().join('.');
    const attrs = ATTRS.filter(a => el.hasAttribute(a)).map(a => `${a}=${norm(el.getAttribute(a))}`).join(' ');
    const own = norm([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' '));
    out.push(`${'  '.repeat(depth)}${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}${attrs ? ' [' + attrs + ']' : ''}${own ? ' "' + own + '"' : ''}`);
    [...el.children].forEach(c => walk(c, depth + 1));
  };
  const root = document.querySelector(rootSelector);
  if (root) walk(root, 0);
  const head = [`title "${document.title}"`, `html lang=${document.documentElement.lang}`,
    ...[...document.querySelectorAll('meta[name], meta[property]')].map(m => `meta ${m.getAttribute('name') || m.getAttribute('property')}=${m.content}`)];
  return [...head, ...out];
}

function diffLines(a, b) {
  const diffs = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) diffs.push(`  l.${i + 1}\n    - ${a[i] ?? '(absent)'}\n    + ${b[i] ?? '(absent)'}`);
    if (diffs.length > 30) { diffs.push('  …'); break; }
  }
  return diffs;
}

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { ...devices['iPhone 13'], defaultBrowserType: undefined }
};
delete VIEWPORTS.mobile.defaultBrowserType;

async function capture(browser, baseUrl, vpName, lang, { boot = false } = {}) {
  const context = await browser.newContext({ ...VIEWPORTS[vpName], locale: lang === 'en' ? 'en-US' : 'fr-FR' });
  await context.addInitScript(([l, skipBoot]) => {
    localStorage.setItem('portfolio_lang', l);
    if (skipBoot) sessionStorage.setItem('portfolio_boot_seen', 'true');
  }, [lang, !boot]);
  // Bloque l'audio distant (bruit réseau inutile pour la comparaison)
  await context.route(/cdn\.pixabay\.com/, r => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(baseUrl, { waitUntil: boot ? 'domcontentloaded' : 'networkidle' });
  if (boot) {
    await page.waitForSelector('#boot-screen');
    const sig = await page.evaluate(domSignature, '#boot-screen');
    await context.close();
    return { sig, errors };
  }
  await page.evaluate(() => document.fonts.ready);
  // Déclenche les IntersectionObserver (timeline, barres) puis revient en haut
  await page.evaluate(async () => {
    const step = window.innerHeight / 2;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2500);
  const sig = await page.evaluate(domSignature, 'body');
  const png = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
  await context.close();
  return { sig, png, errors };
}

function pixelDiff(aBuf, bBuf, outFile) {
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);
  if (a.width !== b.width || a.height !== b.height) {
    return { mismatch: Infinity, note: `tailles différentes ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const mismatch = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  return { mismatch, total: a.width * a.height, write: () => writeFile(outFile, PNG.sync.write(diff)) };
}

const ref = await resolveTarget(refArg);
const cand = await resolveTarget(candArg);
await mkdir(outArg, { recursive: true });
const browser = await chromium.launch();
let failures = 0;

try {
  for (const vp of Object.keys(VIEWPORTS)) {
    for (const lang of ['fr', 'en']) {
      const label = `${vp}/${lang}`;
      const [r, c] = [await capture(browser, ref.url, vp, lang), await capture(browser, cand.url, vp, lang)];
      const domDiffs = diffLines(r.sig, c.sig);
      const px = pixelDiff(r.png, c.png, path.join(outArg, `${vp}-${lang}-diff.png`));
      await writeFile(path.join(outArg, `${vp}-${lang}-ref.png`), r.png);
      await writeFile(path.join(outArg, `${vp}-${lang}-new.png`), c.png);
      if (px.write && px.mismatch) await px.write();
      const ok = !domDiffs.length && px.mismatch === 0 && !c.errors.length;
      if (!ok) failures++;
      console.log(`${ok ? '✓' : '✗'} ${label} — DOM : ${r.sig.length} lignes, ${domDiffs.length} diff ; pixels différents : ${px.note ?? `${px.mismatch} / ${px.total}`}${c.errors.length ? ` ; erreurs JS : ${c.errors.join(' | ')}` : ''}`);
      domDiffs.forEach(d => console.log(d));

      const [rb, cb] = [await capture(browser, ref.url, vp, lang, { boot: true }), await capture(browser, cand.url, vp, lang, { boot: true })];
      const bootDiffs = diffLines(rb.sig, cb.sig);
      if (bootDiffs.length) failures++;
      console.log(`${bootDiffs.length ? '✗' : '✓'} ${label} écran de boot — ${bootDiffs.length} diff`);
      bootDiffs.forEach(d => console.log(d));
    }
  }
} finally {
  await browser.close();
  ref.close();
  cand.close();
}

console.log(failures ? `\n${failures} différence(s) détectée(s) — voir ${outArg}` : '\nAucune différence détectée.');
process.exit(failures ? 1 : 0);
