// Garde-fous partagés du contenu, sérialisation canonique et script de
// validation (T-VAL-09 : le même schéma fait échouer scripts/validate-content.mjs).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hardenContent, normalizeText, parseJsonSafe, validateForWrite, isContentFile } from '../../src/lib/content-guard.js';
import { formatContentJson } from '../../src/lib/content-format.js';
import { fileSchemas, CONTENT_FILES } from '../../src/lib/schema.js';
import { loadRealContent, ROOT } from './helpers.js';

describe('normalizeText', () => {
  it('NFC, CRLF → LF, <br> → \\n', () => {
    expect(normalizeText('é').value).toBe('é');
    expect(normalizeText('a\r\nb').value).toBe('a\nb');
    expect(normalizeText('a<br>b<BR/>c<br />d').value).toBe('a\nb\nc\nd');
  });
  it('balises, bidi, contrôles', () => {
    expect(normalizeText('<b>x</b>').code).toBe('html_forbidden');
    expect(normalizeText('x⁦y').code).toBe('bidi_forbidden');
    expect(normalizeText('x‏y').code).toBe('bidi_forbidden');
    expect(normalizeText('x\ty').code).toBe('control_char');
    expect(normalizeText('a < b').code).toBeUndefined();
  });
});

describe('hardenContent / parseJsonSafe', () => {
  it('clés interdites retirées et signalées', () => {
    const { value, forbiddenKeys } = parseJsonSafe('{"a":1,"__proto__":{"x":1},"b":{"constructor":2}}');
    expect(forbiddenKeys.sort()).toEqual(['__proto__', 'constructor']);
    expect(Object.keys(value)).toEqual(['a', 'b']);
    const parsed = JSON.parse('{"__proto__":{"polluted":1}}');
    const res = hardenContent(parsed);
    expect(res.issues).toEqual([{ path: '__proto__', code: 'forbidden_key' }]);
    expect({}.polluted).toBeUndefined();
  });
  it('profondeur, nombre de nœuds, listes', () => {
    expect(hardenContent({ a: { b: { c: { d: { e: { f: 1 } } } } } }).issues).toEqual([]);
    expect(hardenContent({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }).issues).toContainEqual({ path: '', code: 'too_deep' });
    expect(hardenContent({ l: Array.from({ length: 201 }, () => 1) }).issues).toContainEqual({ path: 'l', code: 'too_many' });
    expect(hardenContent({ a: Array.from({ length: 150 }, () => Array.from({ length: 40 }, () => 1)) }).issues).toContainEqual({ path: '', code: 'too_many_nodes' });
  });
  it('liste blanche des fichiers', () => {
    expect(CONTENT_FILES.every(isContentFile)).toBe(true);
    for (const bad of ['../site', 'Site', 'site.json', 'constructor', '__proto__', 'toString']) expect(isContentFile(bad)).toBe(false);
  });
});

describe('validateForWrite', () => {
  it('le contenu actuel du dépôt est valide', () => {
    const content = loadRealContent();
    for (const file of CONTENT_FILES) expect(validateForWrite(file, content[file]).ok, file).toBe(true);
  });
  it('fichier inconnu', () => {
    expect(validateForWrite('evil', {}).issues).toEqual([{ path: '', code: 'unknown_file' }]);
  });
  it('T-PUB-02 : <img onerror> refusé', () => {
    const content = loadRealContent();
    content.site.hero.bio.fr = '<img src=x onerror=alert(1)>';
    expect(validateForWrite('site', content.site).issues).toContainEqual({ path: 'hero.bio.fr', code: 'html_forbidden' });
  });
  it('description XOR bullets (timeline)', () => {
    const content = loadRealContent();
    const item = content.timeline.items[0];
    item.description = { fr: 'a', en: 'b' };
    item.bullets = [{ fr: 'x', en: 'y' }];
    expect(validateForWrite('timeline', content.timeline).issues.map(i => i.code)).toContain('description_xor_bullets');
  });
});

describe('formatContentJson', () => {
  it('déterministe, idempotent, LF final, re-parsable', () => {
    const content = loadRealContent();
    for (const file of CONTENT_FILES) {
      const data = fileSchemas[file].parse(content[file]);
      const text = formatContentJson(data);
      expect(text.endsWith('\n')).toBe(true);
      expect(JSON.parse(text)).toEqual(data);
      expect(formatContentJson(JSON.parse(text))).toBe(text);
    }
  });
  it('lignes ≤ 120 caractères pour les conteneurs en ligne', () => {
    const text = formatContentJson({ a: { fr: 'x'.repeat(200), en: 'y' } });
    expect(text.split('\n').length).toBeGreaterThan(3);
  });
});

describe('T-VAL-09 — scripts/validate-content.mjs', () => {
  const run = dir => spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate-content.mjs'), '--dir', dir], { encoding: 'utf8' });

  function copyContent() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'jk-content-'));
    cpSync(path.join(ROOT, 'content'), dir, { recursive: true });
    return dir;
  }

  it('contenu valide ⇒ code 0', () => {
    expect(run(copyContent()).status).toBe(0);
  });

  it('JSON invalide pour le schéma ⇒ code ≠ 0', () => {
    const dir = copyContent();
    const file = path.join(dir, 'projects.json');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.projects[0].title.fr = '<img src=x onerror=alert(1)>';
    writeFileSync(file, JSON.stringify(data));
    const res = run(dir);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('projects.json');
  });

  it('caractère bidi (règle de l’admin) ⇒ code ≠ 0', () => {
    const dir = copyContent();
    const file = path.join(dir, 'skills.json');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.categories[0].tags.push('abc‮def');
    writeFileSync(file, JSON.stringify(data));
    const res = run(dir);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('bidi_forbidden');
  });
});
