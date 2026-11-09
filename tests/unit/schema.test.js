import { describe, it, expect } from 'vitest';
import { readRepoFile } from './helpers.js';
import { validateContent, validateFile, toJSONSchemas, CONTENT_FILES, formatIssues } from '../../src/lib/schema.js';
import { loadRealContent, XSS } from './helpers.js';
import { LOGO_PATH_RE } from '../../src/lib/schema.js';
import { PUBLIC_PATH_RE } from '../../api/_lib/upload.js';

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

  it('certifications : anciens champs refusés, U+2060 et « Office of » corrigés', () => {
    const c = loadRealContent();
    for (const card of c.cards.cards) {
      for (const k of ['color', 'icon', 'badge', 'date', 'progress', 'tags']) expect(card, `${card.id}.${k}`).not.toHaveProperty(k);
      expect(String(card.title)).not.toContain('⁠');
    }
    expect(c.cards.cards.find(x => x.id === 'onu-1').org).toContain('Office on Drugs');
    c.cards.cards[0].color = 'yellow';
    c.cards.cards[1].progress = { label: 'l', value: 'v', percent: 100 };
    expect(validateFile('cards', c.cards).errors.length).toBe(2);
  });

  it('certifications : logo local uniquement, lien de vérification en https', () => {
    const ok = card => validateFile('cards', { cards: [{ id: 'x', order: 1, visible: true, title: 't', org: 'o', ...card }] }).success;
    // Le chemin du logo suit la forme des fichiers produits par l'upload d'images
    for (const p of ['/images/uploads/a-0123456789ab.svg', '/images/uploads/a.png', '/images/uploads/b.jpg', '/images/uploads/c.webp']) {
      expect(LOGO_PATH_RE.test(p), p).toBe(PUBLIC_PATH_RE.test(p));
    }
    expect(ok({})).toBe(true); // ni logo ni lien : monogramme, pas de bouton
    expect(ok({ logo: '/images/uploads/ibm-6bdf7f8ccdb3.svg', verifyUrl: 'https://www.credly.com/badges/x', verifyPlatform: 'Credly' })).toBe(true);
    expect(ok({ logo: '/images/uploads/a-0123456789ab.webp', logoAlt: { fr: 'Logo', en: 'Logo' } })).toBe(true);
    for (const logo of ['https://evil.example/x.svg', '//evil.example/x.svg', '/images/uploads/x.gif', '/images/uploads/../x.svg',
      '/images/uploads/X.svg', 'images/uploads/x.svg', '/images/uploads/x.svg?a=1', 'data:image/svg+xml,<svg>']) {
      expect(ok({ logo }), logo).toBe(false);
    }
    for (const verifyUrl of ['http://www.credly.com/badges/x', 'javascript:alert(1)', 'https://', 'https://a.b/"onmouseover=x', '//credly.com/x', 'https://a.b/\\x']) {
      expect(ok({ verifyUrl }), verifyUrl).toBe(false);
    }
  });

  it('ui.certifications.position exige {n} et {total}', () => {
    const c = loadRealContent();
    c.ui.certifications.position = { fr: '{n} sur {total}', en: 'slide {n}' };
    expect(validateFile('ui', c.ui).success).toBe(false);
    c.ui.certifications.position = '{n} / {total}';
    expect(validateFile('ui', c.ui).success).toBe(true);
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
