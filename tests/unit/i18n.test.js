// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderPage, buildDictionary, localize } from '../../src/render/index.js';
import { initI18n, setLanguage, setMultilineText } from '../../src/js/modules/i18n.js';
import { loadRealContent, loadTemplate, XSS } from './helpers.js';

const norm = s => s.replace(/\s+/g, ' ').trim();

function mountPage(content) {
  const html = renderPage(loadTemplate(), content);
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  document.body.innerHTML = body; // gabarit de test de confiance (rendu échappé)
}

describe('i18n côté client', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('CV localisé : le lien bascule entre cv.url.fr et cv.url.en (URL revalidée)', () => {
    const content = loadRealContent();
    content.site.cv.url = { fr: '/files/cv-fr.pdf', en: '/files/cv-en.pdf' };
    mountPage(content);
    localStorage.setItem('portfolio_lang', 'fr');
    initI18n(buildDictionary(content), { defaultLang: 'fr' });
    const link = document.querySelector('[data-i18n-href="cv.url"]');
    expect(link.getAttribute('href')).toBe('/files/cv-fr.pdf');
    setLanguage('en');
    expect(link.getAttribute('href')).toBe('/files/cv-en.pdf');
    // Dictionnaire altéré : jamais de javascript: dans le href
    const dict = buildDictionary(content);
    dict.en['cv.url'] = 'java\tscript:alert(1)';
    initI18n(dict, { defaultLang: 'fr' });
    setLanguage('en');
    expect(link.getAttribute('href')).toBe('#');
  });

  it('CV : le rendu FR garde exactement le même href qu’avant', () => {
    const html = renderPage(loadTemplate(), loadRealContent(), 'fr');
    expect(html).toContain('<a href="asset/Jordan_de_SOUZA_CV.pdf" data-i18n-href="cv.url" download="CV_Jordan_de_SOUZA.pdf"');
  });

  it('bascule tout le site en EN puis revient en FR', () => {
    const content = loadRealContent();
    mountPage(content);
    // Préférence mémorisée prioritaire sur la langue du navigateur (jsdom = en-US)
    localStorage.setItem('portfolio_lang', 'fr');
    initI18n(buildDictionary(content), { defaultLang: 'fr' });
    expect(document.documentElement.lang).toBe('fr');

    setLanguage('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('portfolio_lang')).toBe('en');
    expect(norm(document.querySelector('.hero-greeting').textContent)).toBe(localize(content.site.hero.greeting, 'en'));
    expect(document.querySelector('#skills .section-title').innerHTML).toBe('Technical<br>Arsenal');
    expect(document.querySelector('#form-name').placeholder).toBe('Your name...');
    expect(norm(document.querySelector('.nav-links').textContent)).toContain('./education');
    expect(document.querySelector('.lang-btn[data-lang="en"]').classList.contains('active')).toBe(true);

    setLanguage('fr');
    expect(document.querySelector('#skills .section-title').innerHTML).toBe('Arsenal<br>Technique');
    expect(document.querySelector('.lang-btn[data-lang="fr"]').classList.contains('active')).toBe(true);
  });

  it('sans préférence, suit la langue du navigateur (en-US -> en)', () => {
    const content = loadRealContent();
    mountPage(content);
    initI18n(buildDictionary(content), { defaultLang: 'fr' });
    expect(navigator.language.toLowerCase().startsWith('en')).toBe(true);
    expect(document.documentElement.lang).toBe('en');
  });

  it('langue inconnue -> langue par défaut', () => {
    const content = loadRealContent();
    mountPage(content);
    initI18n(buildDictionary(content), { defaultLang: 'fr' });
    setLanguage('de');
    expect(document.documentElement.lang).toBe('fr');
  });

  it(`insère "${XSS}" comme du texte (aucun innerHTML)`, () => {
    const content = loadRealContent();
    content.projects.projects[0].title = { fr: 'ok', en: XSS };
    content.ui.sections.skills.title = { fr: 'a\nb', en: `${XSS}\n<b>gras</b>` };
    mountPage(content);
    initI18n(buildDictionary(content), { defaultLang: 'fr' });
    setLanguage('en');

    const name = document.querySelector('.project-name');
    expect(name.textContent).toBe(XSS);
    expect(name.querySelector('img')).toBeNull();
    const title = document.querySelector('#skills .section-title');
    expect(title.querySelector('img, b')).toBeNull();
    expect(title.querySelectorAll('br')).toHaveLength(1);
    expect(title.textContent).toBe(`${XSS}<b>gras</b>`);
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('setMultilineText crée des <br> via le DOM', () => {
    const el = document.createElement('div');
    setMultilineText(el, 'a\n<i>b</i>\nc');
    expect(el.childNodes).toHaveLength(5);
    expect(el.innerHTML).toBe('a<br>&lt;i&gt;b&lt;/i&gt;<br>c');
  });
});
