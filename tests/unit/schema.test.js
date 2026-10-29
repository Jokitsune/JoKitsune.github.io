import { describe, it, expect } from 'vitest';
import { readRepoFile } from './helpers.js';
import { validateContent, validateFile, toJSONSchemas, CONTENT_FILES, formatIssues } from '../../src/lib/schema.js';
import { loadRealContent, XSS } from './helpers.js';

describe('schéma du contenu', () => {
  it('valide le contenu réel du dépôt', () => {
    const res = validateContent(loadRealContent());
    expect(res.errors).toEqual([]);
    expect(res.success).toBe(true);
  });

  it('expose un schéma par fichier', () => {
    expect(CONTENT_FILES).toEqual(['site', 'ui', 'skills', 'projects', 'timeline', 'cards']);
  });

  it('refuse « < » et « > » dans un texte (invariant ou traduit)', () => {
    const c = loadRealContent();
    c.projects.projects[0].title = { fr: XSS, en: 'ok' };
    c.skills.categories[1].tags.push('a > b');
    const res = validateContent(c);
    expect(res.success).toBe(false);
    const paths = res.errors.map(e => `${e.file}:${e.path}`);
    expect(paths.some(p => p.startsWith('projects:projects.0.title'))).toBe(true);
    expect(paths.some(p => p.startsWith('skills:categories.1.tags'))).toBe(true);
  });

  it('refuse les URLs dangereuses et accepte les URLs sûres', () => {
    for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', 'https://x.y/"onmouseover=1']) {
      const c = loadRealContent();
      c.projects.projects[0].links[0].url = url;
      expect(validateFile('projects', c.projects).success, url).toBe(false);
    }
    for (const url of ['https://github.com/JoKitsune', 'mailto:a@b.c', 'tel:+229 01', '#contact', 'asset/cv.pdf']) {
      const c = loadRealContent();
      c.projects.projects[0].links[0].url = url;
      expect(validateFile('projects', c.projects).success, url).toBe(true);
    }
  });

  it('refuse les identifiants en double', () => {
    const c = loadRealContent();
    c.cards.cards[1].id = c.cards.cards[0].id;
    const res = validateFile('cards', c.cards);
    expect(res.success).toBe(false);
    expect(res.errors[0]).toMatchObject({ file: 'cards', path: 'cards.1.id' });
    expect(formatIssues(res.errors)).toContain('content/cards.json › cards.1.id');
  });

  it('refuse une couleur de carte inconnue et un pourcentage hors bornes', () => {
    const c = loadRealContent();
    c.cards.cards[0].color = 'purple';
    c.cards.cards[1].progress.percent = 120;
    expect(validateFile('cards', c.cards).errors.length).toBe(2);
  });

  it('exige description OU bullets dans la timeline', () => {
    const c = loadRealContent();
    delete c.timeline.items[0].description;
    expect(validateFile('timeline', c.timeline).success).toBe(false);
    c.timeline.items[0].description = 'x';
    c.timeline.items[0].bullets = ['y'];
    expect(validateFile('timeline', c.timeline).success).toBe(false);
  });

  it('refuse les champs inconnus (fautes de frappe)', () => {
    const c = loadRealContent();
    c.site.hero.titel = 'oups';
    expect(validateFile('site', c.site).success).toBe(false);
  });

  it('les JSON Schema de content/schema/ sont à jour', () => {
    const schemas = toJSONSchemas();
    for (const name of CONTENT_FILES) {
      const file = JSON.parse(readRepoFile(`content/schema/${name}.schema.json`));
      expect(file, `${name}.schema.json obsolète : npm run validate:content -- --write-schemas`).toEqual(schemas[name]);
    }
  });
});
