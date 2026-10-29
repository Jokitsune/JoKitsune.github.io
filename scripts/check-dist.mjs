#!/usr/bin/env node
/* ================================================
   npm run check:dist — contrôles de sécurité du build (dist/)
   - T-SEC-03 : aucun secret ni nom de variable serveur dans le bundle ;
   - /admin : aucun script/style inline, aucun attribut on*, aucune ressource
     externe (compatibilité CSP stricte + Trusted Types) ;
   - T-PAGES-01 (option --pages) : le build GitHub Pages ne contient pas /admin.
   ================================================ */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const pages = process.argv.includes('--pages');
const errors = [];

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

if (!existsSync(DIST)) {
  console.error('✗ dist/ absent : lancer « npm run build » d’abord.');
  process.exit(1);
}

const files = walk(DIST).filter(f => /\.(html|js|css|json|txt|map)$/.test(f));
const FORBIDDEN = [
  /GITHUB_(OAUTH_CLIENT_SECRET|APP_PRIVATE_KEY|APP_ID|APP_INSTALLATION_ID|REPO_ID)/,
  /SESSION_(SECRET|VERSION)/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /api\/_lib/
];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const re of FORBIDDEN) {
    if (re.test(text)) errors.push(`${path.relative(ROOT, file)} contient ${re}`);
  }
}

const adminHtml = path.join(DIST, 'admin', 'index.html');
if (pages) {
  if (existsSync(path.join(DIST, 'admin'))) errors.push('dist/admin/ ne doit pas exister dans le build GitHub Pages');
} else if (!existsSync(adminHtml)) {
  errors.push('dist/admin/index.html absent du build Vercel');
} else {
  const html = readFileSync(adminHtml, 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc=/.test(m[1]) || m[2].trim()) errors.push('admin : script inline interdit');
  }
  if (/<style\b/i.test(html)) errors.push('admin : <style> inline interdit');
  if (/\sstyle=/i.test(html)) errors.push('admin : attribut style interdit');
  if (/\son[a-z]+=/i.test(html)) errors.push('admin : attribut on* interdit');
  for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:)?\/\//.test(m[1])) errors.push(`admin : ressource externe ${m[1]}`);
  }
  // Le bundle de l'admin ne doit utiliser aucun sink HTML
  for (const m of html.matchAll(/src="\/(assets\/[^"]+\.js)"/g)) {
    const js = readFileSync(path.join(DIST, m[1]), 'utf8');
    for (const sink of ['.innerHTML=', '.outerHTML=', 'insertAdjacentHTML(', 'document.write(']) {
      if (js.includes(sink)) errors.push(`admin : ${m[1]} utilise ${sink}`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ dist/ conforme (${files.length} fichiers vérifiés${pages ? ', build Pages sans /admin' : ', /admin sans inline'}).`);
