// F1 (urlSchema) et F2 (safeUrl) : URL protocol-relative, barres obliques
// inverses, caractères de contrôle et chemins sortant de l'origine.
import { describe, it, expect } from 'vitest';
import { urlSchema, staysSameOriginIfRelative } from '../../src/lib/schema.js';
import { validateForWrite } from '../../src/lib/content-guard.js';
import { safeUrl } from '../../src/render/escape.js';
import { loadRealContent } from './helpers.js';

const DANGEROUS = [
  '//evil.example',
  '//evil.example/path',
  '/\\evil.example',
  '\\\\evil.example',
  '\\/evil.example',
  'files/..\\..\\x',
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  '\u0001javascript:alert(1)',
  '\u0000 javascript:alert(1)',
  ' javascript:alert(1)',
  '\u0085javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)'
];

const SAFE = ['https://github.com/JoKitsune', 'mailto:a@b.fr', 'tel:0164119794', '#contact', 'asset/Jordan_de_SOUZA_CV.pdf', '/files/cv-fr.pdf', '../x.pdf'];

describe('F1 — urlSchema', () => {
  for (const url of DANGEROUS) {
    it(`refuse ${JSON.stringify(url)}`, () => {
      expect(urlSchema.safeParse(url).success).toBe(false);
    });
  }
  for (const url of SAFE) {
    it(`accepte ${url}`, () => {
      expect(urlSchema.safeParse(url).success).toBe(true);
    });
  }
  it('chemins relatifs : restent sur la même origine', () => {
    expect(staysSameOriginIfRelative('/a/../../b')).toBe(true);
    expect(staysSameOriginIfRelative('//x')).toBe(false);
    expect(staysSameOriginIfRelative('/\\x')).toBe(false);
  });
  it('validateForWrite renvoie invalid_url sur le champ', () => {
    const c = loadRealContent();
    c.projects.projects[0].links[0].url = '//evil.example';
    expect(validateForWrite('projects', c.projects).issues).toContainEqual({ path: 'projects[0].links[0].url', code: 'invalid_url' });
  });
});

describe('F2 — safeUrl (rendu, défense en profondeur)', () => {
  for (const url of DANGEROUS) {
    it(`neutralise ${JSON.stringify(url)}`, () => {
      expect(safeUrl(url)).toBe('#');
    });
  }
  for (const url of SAFE) {
    it(`conserve ${url}`, () => {
      expect(safeUrl(url)).toBe(url);
    });
  }
});
