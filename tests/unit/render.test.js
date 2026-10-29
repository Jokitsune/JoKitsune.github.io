import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  renderPage, renderSections, buildDictionary, escapeHtml, textToHtml, safeUrl, localize, visibleSorted
} from '../../src/render/index.js';
import { clientPayload } from '../../src/vite/portfolio-content-plugin.js';
import { loadRealContent, loadTemplate, XSS } from './helpers.js';

const parse = html => new JSDOM(html).window.document;
const norm = s => s.replace(/\s+/g, ' ').trim();

describe('échappement', () => {
  it('échappe les caractères HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
  it('ne convertit que "\\n" en <br>', () => {
    expect(textToHtml('Arsenal\nTechnique')).toBe('Arsenal<br>Technique');
    expect(textToHtml('a<br>b')).toBe('a&lt;br&gt;b');
  });
  it('neutralise les URLs dangereuses', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('#');
    expect(safeUrl(' JAVASCRIPT:alert(1)')).toBe('#');
    expect(safeUrl('https://a.b')).toBe('https://a.b');
    expect(safeUrl('asset/cv.pdf')).toBe('asset/cv.pdf');
  });
  it('localize gère texte invariant et bilingue', () => {
    expect(localize('x', 'en')).toBe('x');
    expect(localize({ fr: 'a', en: 'b' }, 'en')).toBe('b');
  });
  it('visibleSorted trie par order et filtre visible', () => {
    const list = [{ id: 'b', order: 2, visible: true }, { id: 'h', order: 0, visible: false }, { id: 'a', order: 1, visible: true }];
    expect(visibleSorted(list).map(i => i.id)).toEqual(['a', 'b']);
  });
});

describe('rendu de la page', () => {
  const content = loadRealContent();
  const doc = parse(renderPage(loadTemplate(), content));

  it('remplace tous les marqueurs et produit le HTML en FR', () => {
    expect(doc.documentElement.outerHTML).not.toMatch(/render:[a-z]+-->/);
    expect(doc.documentElement.lang).toBe('fr');
    expect(doc.title).toBe(content.site.meta.title.fr);
    expect(doc.querySelector('meta[name="description"]').content).toBe(content.site.meta.description.fr);
  });

  it('rend chaque section avec le bon nombre d’éléments', () => {
    expect(doc.querySelectorAll('.boot-line')).toHaveLength(content.ui.boot.lines.length);
    expect(doc.querySelectorAll('.nav-link-item')).toHaveLength(content.ui.nav.links.length);
    expect(doc.querySelectorAll('.social-pile-item')).toHaveLength(content.site.socials.length);
    expect(doc.querySelectorAll('.skill-card')).toHaveLength(content.skills.categories.length);
    expect(doc.querySelectorAll('.project-card')).toHaveLength(content.projects.projects.length);
    expect(doc.querySelectorAll('.timeline-item')).toHaveLength(content.timeline.items.length);
    expect(doc.querySelectorAll('.card-3d-wrap')).toHaveLength(content.cards.cards.length);
    expect(doc.querySelectorAll('.contact-item')).toHaveLength(content.site.contact.items.length);
  });

  it('reproduit le balisage attendu (classes de variantes, numéros, <br>)', () => {
    expect(norm(doc.querySelector('#skills .section-title').innerHTML)).toBe('Arsenal<br>Technique');
    expect([...doc.querySelectorAll('.project-number')].map(e => e.textContent)).toEqual(
      content.projects.projects.map((_, i) => `PROJECT_0${i + 1}`)
    );
    const cyan = doc.querySelector('[data-card="experience"]');
    expect(cyan.querySelector('.sec-card').className).toBe('sec-card sec-card--cyan');
    expect(cyan.querySelector('.progress-bar-fill').getAttribute('data-fill')).toBe('80');
    expect(doc.querySelector('[data-card="formation"] .sec-card').className).toBe('sec-card');
    expect(doc.querySelector('.social-pile-item.github-item svg path')).not.toBeNull();
    expect(doc.querySelector('.hero-name').getAttribute('data-text')).toBe('de SOUZA');
    expect(norm(doc.querySelector('.nav-brand').textContent)).toBe('J.de SOUZA');
  });

  it('chaque clé data-i18n existe en FR et EN, et le HTML contient le FR', () => {
    const dict = buildDictionary(content);
    const els = [...doc.querySelectorAll('[data-i18n]')];
    expect(els.length).toBeGreaterThan(80);
    for (const el of els) {
      const key = el.getAttribute('data-i18n');
      expect(dict.fr[key], key).toBeTypeOf('string');
      expect(dict.en[key], key).toBeTypeOf('string');
      // Le texte pré-rendu = valeur FR du dictionnaire ("\n" -> <br>)
      const expected = doc.createElement('div');
      expected.innerHTML = textToHtml(dict.fr[key]);
      expect(el.innerHTML, key).toBe(expected.innerHTML);
    }
    for (const el of doc.querySelectorAll('[data-i18n-placeholder]')) {
      expect(el.placeholder).toBe(dict.fr[el.getAttribute('data-i18n-placeholder')]);
    }
  });

  it('respecte order et visible', () => {
    const c = loadRealContent();
    c.projects.projects[0].visible = false;
    c.skills.categories[3].order = -1;
    const d = parse(renderPage(loadTemplate(), c));
    expect(d.querySelectorAll('.project-card')).toHaveLength(c.projects.projects.length - 1);
    expect(d.querySelector('.project-number').textContent).toBe('PROJECT_01');
    expect(norm(d.querySelector('.project-name').textContent)).toBe(c.projects.projects[1].title.fr);
    expect(norm(d.querySelector('.skill-card-title').textContent)).toBe('Soft Skills');
  });

  it('peut rendre directement en anglais', () => {
    const d = parse(renderPage(loadTemplate(), content, 'en'));
    expect(d.documentElement.lang).toBe('en');
    expect(norm(d.querySelector('.hero-greeting').textContent)).toBe('// SYSTEM IDENTIFICATION');
  });

  it('lève une erreur sur un marqueur inconnu', () => {
    expect(() => renderPage('<!--render:inconnu-->', content)).toThrow(/inconnu/);
  });
});

describe('sécurité du rendu au build', () => {
  it(`rend "${XSS}" comme du texte, jamais comme du HTML`, () => {
    // Contenu NON validé (simule un contournement du schéma) : le rendu doit rester sûr
    const c = loadRealContent();
    c.projects.projects[0].title = { fr: XSS, en: XSS };
    c.skills.categories[1].tags[0] = XSS;
    c.site.footer.prompt = XSS;
    c.site.identity.lastName = `"><script>alert(1)</script>`;
    c.ui.a11y.navToggle = `" onfocus="alert(1)`;
    c.projects.projects[0].links[0].url = 'javascript:alert(1)';
    const { html } = renderSections(c);
    const doc = parse(renderPage(loadTemplate(), c));

    expect(Object.values(html).join('')).not.toContain('<img');
    expect(doc.querySelectorAll('main img, footer img, script:not([src])')).toHaveLength(0);
    expect(norm(doc.querySelector('.project-name').textContent)).toBe(XSS);
    expect(norm(doc.querySelector('.skill-card:nth-child(2) .skill-tag').textContent)).toBe(XSS);
    expect(doc.querySelector('footer').textContent).toContain(XSS);
    expect(doc.querySelector('.hero-name').getAttribute('data-text')).toBe(`"><script>alert(1)</script>`);
    expect(doc.querySelector('#navToggle').getAttribute('onfocus')).toBeNull();
    expect(doc.querySelector('.project-btn').getAttribute('href')).toBe('#');
  });

  it('le dictionnaire client ne contient que du texte brut', () => {
    const c = loadRealContent();
    c.projects.projects[0].title = { fr: XSS, en: XSS };
    const payload = clientPayload(c);
    expect(payload.dictionary.fr['projects.network-scanner.title']).toBe(XSS);
    expect(payload.formspreeId).toBe('xpqbjwpo');
    expect(JSON.stringify(payload.dictionary)).not.toContain('<br>');
  });
});
