// Section « Certifications » : moteur coverflow pur, rendu pré-calculé et contrôleur client.
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  wrapOffset, wrapIndex, slideStyle, computeTransforms, layoutFor, dampStep, swipeTarget, monogram,
  CAROUSEL_MIN, AUTOPLAY_DELAY, SETTLE_EPSILON
} from '../../src/lib/coverflow.js';
import { renderPage, renderSections, buildDictionary, createContext } from '../../src/render/index.js';
import { initCertCarousel } from '../../src/js/modules/certifications.js';
import { initI18n, setLanguage } from '../../src/js/modules/i18n.js';
import { loadRealContent, loadTemplate, readRepoFile } from './helpers.js';

const parse = html => new DOMParser().parseFromString(html, 'text/html');
const LAYOUT = { size: 240, pitch: 240 * 0.68, win: 3 };

/* ==================== Moteur pur ==================== */
describe('coverflow — géométrie pure', () => {
  it('wrapOffset reste dans [−n/2, n/2[ et prend le chemin le plus court', () => {
    for (const n of [4, 5, 9]) {
      for (let pos = -20; pos <= 20; pos += 0.25) {
        for (let i = 0; i < n; i += 1) {
          const o = wrapOffset(i, pos, n);
          expect(o).toBeGreaterThanOrEqual(-n / 2);
          expect(o).toBeLessThan(n / 2);
          // même slide à un tour près
          expect(Math.abs(((i - pos - o) % n + n) % n) < 1e-9 || Math.abs(((i - pos - o) % n + n) % n - n) < 1e-9).toBe(true);
        }
      }
    }
    expect(wrapOffset(8, 0, 9)).toBe(-1);
    expect(wrapOffset(1, 0, 9)).toBe(1);
    expect(wrapIndex(-1, 9)).toBe(8);
    expect(wrapIndex(9, 9)).toBe(0);
    expect(wrapIndex(10.4, 9)).toBe(1);
  });

  it('slideStyle(0) : opacité 1, aucune rotation, profondeur 0, au premier plan', () => {
    const s = slideStyle(0, LAYOUT);
    expect(s.opacity).toBe(1);
    expect(s.rotation).toBe(0);
    expect(s.depth).toBe(0);
    expect(s.zIndex).toBe(5000);
    expect(s.hidden).toBe(false);
    expect(s.transform).toBe('translateX(0px) translateZ(0px) rotateY(0deg) scale(1)');
    expect(s.transform).not.toContain('-0');
  });

  it('formules de kexsio : rotation plafonnée à 74°, symétrique, profondeur et échelle', () => {
    expect(Math.abs(slideStyle(40, { ...LAYOUT, win: 100 }).rotation)).toBe(74);
    expect(slideStyle(1, LAYOUT).rotation).toBe(-35);
    expect(slideStyle(-1, LAYOUT).rotation).toBe(35);
    expect(slideStyle(1, LAYOUT).depth).toBeCloseTo(-240 * 0.4, 3);
    expect(slideStyle(1, LAYOUT).transform).toContain(`translateX(${Math.round(LAYOUT.pitch * 1000) / 1000}px)`);
    expect(slideStyle(10, { ...LAYOUT, win: 100 }).transform).toContain('scale(0.925)');
  });

  it('opacité nulle et carte masquée au-delà de win + 0,5 ; dégradé entre win et win + 0,5', () => {
    expect(slideStyle(3.5, LAYOUT).opacity).toBe(0);
    expect(slideStyle(3.5, LAYOUT).hidden).toBe(true);
    expect(slideStyle(-4, LAYOUT).hidden).toBe(true);
    expect(slideStyle(3, LAYOUT).opacity).toBeGreaterThan(0);
    expect(slideStyle(3.25, LAYOUT).opacity).toBeLessThan(slideStyle(3, LAYOUT).opacity);
    expect(slideStyle(2, LAYOUT).opacity).toBeCloseTo(0.64, 5);
    expect(slideStyle(3, LAYOUT).opacity).toBeCloseTo(0.46, 5);
  });

  it('computeTransforms : une entrée par slide, la slide courante au centre', () => {
    const styles = computeTransforms(2, 9, LAYOUT);
    expect(styles).toHaveLength(9);
    expect(styles[2].opacity).toBe(1);
    expect(styles.filter(s => s.hidden)).toHaveLength(2);
    // bouclage : à pos = 0, la dernière slide est juste à gauche
    expect(computeTransforms(0, 9, LAYOUT)[8].rotation).toBe(35);
    // pure : mêmes entrées → même sortie
    expect(computeTransforms(1.3, 9, LAYOUT)).toEqual(computeTransforms(1.3, 9, LAYOUT));
  });

  it('layoutFor : pas et fenêtre selon la largeur', () => {
    expect(layoutFor(1440, 260)).toEqual({ size: 260, pitch: 260 * 0.68, win: 3 });
    expect(layoutFor(680, 200)).toEqual({ size: 200, pitch: 200 * 0.72, win: 2 });
  });

  it('dampStep : amortissement exponentiel, dt plafonné, arrêt sous le seuil', () => {
    const a = dampStep(0, 1, 1 / 60);
    expect(a.pos).toBeCloseTo(1 - Math.exp(-8.8 / 60), 10);
    expect(dampStep(0, 1, 10).pos).toBeCloseTo(1 - Math.exp(-8.8 * 0.05), 10);
    expect(dampStep(1 - SETTLE_EPSILON / 2, 1, 0.016)).toEqual({ pos: 1, done: true });
    let pos = 0;
    let frames = 0;
    for (let done = false; !done; frames += 1) ({ pos, done } = dampStep(pos, 3, 1 / 60));
    expect(pos).toBe(3);
    expect(frames).toBeLessThan(200);
  });

  it('swipeTarget : seuil de distance ou de vitesse, plusieurs cartes d’un coup', () => {
    expect(swipeTarget(2, 10, 160, 0.1)).toBe(2);
    expect(swipeTarget(2, -60, 160, 0.1)).toBe(3);
    expect(swipeTarget(2, 60, 160, 0.1)).toBe(1);
    expect(swipeTarget(2, -20, 160, 0.9)).toBe(3);
    expect(swipeTarget(0, -480, 160, 0)).toBe(3);
  });

  it('monogram : initiales de repli', () => {
    expect(monogram('IBM')).toBe('IBM');
    expect(monogram('Red Team Leaders')).toBe('RTL');
    expect(monogram('United Nations Office on Drugs and Crime (ONU)')).toBe('UNODC');
    expect(monogram('')).toBe('?');
  });
});

/* ==================== Rendu ==================== */
describe('rendu de #certifications', () => {
  const content = loadRealContent();
  const doc = parse(renderPage(loadTemplate(), content));
  const section = doc.querySelector('#certifications');
  const visible = content.cards.cards.filter(c => c.visible !== false).sort((a, b) => a.order - b.order);

  it('section placée après #formation, une slide par certification visible, triée par order', () => {
    expect(section).not.toBeNull();
    expect(doc.querySelector('#formation').nextElementSibling).toBe(section);
    expect(section.getAttribute('aria-labelledby')).toBe('certifications-title');
    expect([...section.querySelectorAll('li.cc-slide')].map(li => li.dataset.id)).toEqual(visible.map(c => c.id));
    expect(doc.querySelector('.nav-link-item[href="#certifications"]')).not.toBeNull();
  });

  it('aucun style inline, aucune classe d’état pré-rendue, contrôles masqués', () => {
    expect(section.outerHTML).not.toMatch(/\sstyle=|<style/);
    expect(section.querySelector('.is-current, .cc--enhanced')).toBeNull();
    expect(section.querySelector('.cc-controls').hidden).toBe(true);
    expect(section.querySelectorAll('.cc-dot')).toHaveLength(visible.length);
    expect(section.querySelector('.cc-track').getAttribute('role')).toBe('list');
  });

  it('logos locaux /images/uploads, alt localisé, chargement immédiat', () => {
    const imgs = [...section.querySelectorAll('.cc-plate img')];
    expect(imgs).toHaveLength(visible.length);
    for (const img of imgs) {
      expect(img.getAttribute('src')).toMatch(/^\/images\/uploads\/[a-z0-9-]+-[0-9a-f]{12}\.(svg|png|jpg|webp)$/);
      expect(img.getAttribute('loading')).toBe('eager');
      expect(img.getAttribute('alt')).toMatch(/\S/);
      expect(img.getAttribute('data-i18n-attr')).toMatch(/^alt:cards\.[a-z0-9-]+\.logoAlt$/);
    }
    expect(readRepoFile('src/render/sections.js')).not.toMatch(/style=/);
  });

  it('lien « Vérifier » : https, nouvel onglet, plateforme, décrit par le titre', () => {
    const links = [...section.querySelectorAll('a.cc-verify')];
    expect(links).toHaveLength(visible.filter(c => c.verifyUrl).length);
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\//);
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      const title = doc.getElementById(a.getAttribute('aria-describedby'));
      expect(title?.classList.contains('cc-title')).toBe(true);
      expect(a.querySelector('[data-i18n="certifications.verify"]').textContent).toBe('Vérifier le certificat');
      expect(a.querySelector('.sr-only[data-i18n="certifications.newTab"]')).not.toBeNull();
      expect(a.querySelector('.cc-platform').textContent).toMatch(/^via (Credly|Coursera|Red Team Leaders|UNODC)$/);
    }
    expect(section.textContent).not.toContain('⁠');
    expect(section.textContent).toContain('Office on Drugs');
  });

  it('attributs i18n différés : clés pré-rendues dans le HTML et présentes en FR/EN', () => {
    const dict = buildDictionary(content);
    const cc = section.querySelector('[data-cc]');
    expect(cc.getAttribute('data-i18n-attr')).toBe('aria-roledescription:certifications.carousel');
    expect(cc.hasAttribute('aria-roledescription')).toBe(false);
    const li = section.querySelector('li.cc-slide');
    expect(li.getAttribute('data-i18n-attr')).toBe(`aria-roledescription:certifications.slide;aria-label:cards.${visible[0].id}.position`);
    expect(dict.fr[`cards.${visible[0].id}.position`]).toBe(`1 sur ${visible.length}`);
    expect(dict.en[`cards.${visible[0].id}.position`]).toBe(`1 of ${visible.length}`);
    expect(dict.en['certifications.carousel']).toBe('carousel');
    for (const key of ['verify', 'newTab', 'prev', 'next', 'pause', 'play', 'dots']) {
      expect(dict.fr[`certifications.${key}`], key).toBeTypeOf('string');
      expect(dict.en[`certifications.${key}`], key).toBeTypeOf('string');
    }
  });

  it('repli : sans logo → monogramme ; sans verifyUrl → aucun lien', () => {
    const c = loadRealContent();
    delete c.cards.cards[0].logo;
    delete c.cards.cards[0].logoAlt;
    delete c.cards.cards[0].verifyUrl;
    const d = parse(renderSections(c).html.certifications);
    const first = d.querySelector('li.cc-slide');
    expect(first.querySelector('img')).toBeNull();
    expect(first.querySelector('.cc-monogram').textContent).toBe(monogram(c.cards.cards[0].org));
    expect(first.querySelector('.cc-monogram').getAttribute('aria-hidden')).toBe('true');
    expect(first.querySelector('a.cc-verify')).toBeNull();
  });

  it(`moins de ${CAROUSEL_MIN} certifications : grille statique sans contrôles ; aucune : ni section ni lien`, () => {
    const c = loadRealContent();
    c.cards.cards = c.cards.cards.slice(0, 3);
    const d = parse(renderSections(c).html.certifications);
    expect(d.querySelector('[data-cc]')).toBeNull();
    expect(d.querySelector('.cc-controls, .cc-status')).toBeNull();
    expect(d.querySelectorAll('li.cc-slide')).toHaveLength(3);

    c.cards.cards.forEach(card => { card.visible = false; });
    const page = parse(renderPage(loadTemplate(), c));
    expect(page.querySelector('#certifications')).toBeNull();
    expect(page.querySelector('.nav-link-item[href="#certifications"]')).toBeNull();
  });

  it('ctx.deferredAttrs : liste blanche et valeurs bilingues uniquement', () => {
    const ctx = createContext('fr');
    expect(ctx.deferredAttrs({ 'aria-label': ['x.y', { fr: 'a', en: 'b' }] })).toBe(' data-i18n-attr="aria-label:x.y"');
    expect(ctx.dictionary.en['x.y']).toBe('b');
    expect(() => ctx.deferredAttrs({ href: ['x.z', { fr: 'a', en: 'b' }] })).toThrow();
    expect(() => ctx.deferredAttrs({ 'aria-label': ['x.w', 'invariant'] })).toThrow();
  });
});

/* ==================== Contrôleur client ==================== */
describe('contrôleur client', () => {
  let reduce = false;
  const mqlListeners = new Set();
  const observers = [];

  function stubBrowser() {
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return reduce; },
      addEventListener: (_, fn) => mqlListeners.add(fn),
      removeEventListener: (_, fn) => mqlListeners.delete(fn)
    }));
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb) { this.cb = cb; observers.push(this); }
      observe(el) { this.el = el; }
      disconnect() { this.disconnected = true; }
      show(on) {
        this.cb([{ isIntersecting: on, intersectionRatio: on ? 1 : 0, intersectionRect: { height: on ? 400 : 0 } }]);
      }
    });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() { this.disconnected = true; }
    });
    vi.stubGlobal('requestAnimationFrame', fn => setTimeout(() => fn(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', id => clearTimeout(id));
  }

  function mount() {
    const content = loadRealContent();
    const html = renderPage(loadTemplate(), content);
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')); // gabarit de confiance
    localStorage.setItem('portfolio_lang', 'fr');
    initI18n(buildDictionary(content), { defaultLang: 'fr' });
    return document.querySelector('[data-cc]');
  }

  const q = (root, sel) => root.querySelector(sel);
  const currentId = root => q(root, '.cc-slide.is-current')?.dataset.id;
  const ids = root => [...root.querySelectorAll('.cc-slide')].map(li => li.dataset.id);
  const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    mqlListeners.clear();
    observers.length = 0;
    reduce = false;
    localStorage.clear();
  });

  it('activation : rôles, attributs traduits appliqués, contrôles révélés, styles via le CSSOM', () => {
    stubBrowser();
    const root = mount();
    const destroy = initCertCarousel(root);
    expect(root.classList.contains('cc--enhanced')).toBe(true);
    expect(root.getAttribute('role')).toBe('group');
    expect(root.getAttribute('aria-roledescription')).toBe('carrousel');
    expect(root.getAttribute('aria-labelledby')).toBe('certifications-title');
    expect(q(root, '.cc-track').getAttribute('role')).toBe('presentation');
    const slides = [...root.querySelectorAll('.cc-slide')];
    expect(slides[1].getAttribute('role')).toBe('group');
    expect(slides[1].getAttribute('aria-roledescription')).toBe('certification');
    expect(slides[1].getAttribute('aria-label')).toBe(`2 sur ${slides.length}`);
    expect(q(root, '.cc-controls').hidden).toBe(false);
    expect(slides[0].classList.contains('is-current')).toBe(true);
    expect(slides.filter(li => li.getAttribute('aria-hidden') === 'true')).toHaveLength(slides.length - 1);
    expect(slides[0].hasAttribute('aria-hidden')).toBe(false);
    expect(q(root, '.cc-dot').getAttribute('aria-current')).toBe('true');
    expect([...root.querySelectorAll('.cc-dot')].map(d => d.tabIndex)).toEqual(slides.map((_, i) => (i ? -1 : 0)));
    const card = q(slides[0], '.cc-card');
    expect(card.style.transform).toContain('rotateY(0deg)');
    expect(card.style.opacity).toBe('1');
    // les slides lointaines sont masquées (fenêtre)
    expect(slides.filter(li => q(li, '.cc-card').style.visibility === 'hidden').length).toBeGreaterThan(0);
    destroy();
  });

  it('bascule FR → EN : aria-roledescription, position et noms des boutons traduits', () => {
    stubBrowser();
    const root = mount();
    const destroy = initCertCarousel(root);
    setLanguage('en');
    expect(root.getAttribute('aria-roledescription')).toBe('carousel');
    expect(q(root, '.cc-slide').getAttribute('aria-label')).toMatch(/^1 of \d+$/);
    expect(q(root, '.cc-next .sr-only').textContent).toBe('Next certification');
    expect(q(root, '.cc-verify [data-i18n="certifications.verify"]').textContent).toBe('Verify the certificate');
    setLanguage('fr');
    destroy();
  });

  it('boutons ‹ › et bouclage ; mouvement réduit : transform final appliqué sans interpolation', () => {
    stubBrowser();
    reduce = true;
    const root = mount();
    const destroy = initCertCarousel(root);
    const order = ids(root);
    q(root, '.cc-prev').click();
    expect(currentId(root)).toBe(order.at(-1));
    expect(q(root, '.cc-slide.is-current .cc-card').style.transform).toContain('rotateY(0deg)');
    for (let i = 0; i < order.length; i += 1) q(root, '.cc-next').click();
    expect(currentId(root)).toBe(order.at(-1));
    q(root, '.cc-next').click();
    expect(currentId(root)).toBe(order[0]);
    expect(q(root, '[data-cc-current]').textContent).toBe('01');
    destroy();
  });

  it('clavier sur les contrôles : ← → Origine Fin ; le focus suit le point actif', () => {
    stubBrowser();
    reduce = true;
    const root = mount();
    const destroy = initCertCarousel(root);
    const order = ids(root);
    const dots = [...root.querySelectorAll('.cc-dot')];
    dots[0].focus();
    key(dots[0], 'ArrowRight');
    expect(currentId(root)).toBe(order[1]);
    expect(document.activeElement).toBe(dots[1]);
    key(dots[1], 'End');
    expect(currentId(root)).toBe(order.at(-1));
    expect(document.activeElement).toBe(dots.at(-1));
    key(dots.at(-1), 'Home');
    expect(currentId(root)).toBe(order[0]);
    key(dots[0], 'ArrowLeft');
    expect(currentId(root)).toBe(order.at(-1));
    // touches avec modificateur ou hors liste : ignorées, pas de preventDefault
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true });
    dots.at(-1).dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(currentId(root)).toBe(order.at(-1));
    // les flèches ne sont pas écoutées hors des contrôles (le lien garde son comportement)
    const link = q(root, '.cc-slide.is-current .cc-verify');
    link.focus();
    key(link, 'ArrowRight');
    expect(currentId(root)).toBe(order.at(-1));
    destroy();
  });

  it('focus conservé : si la slide qui contient le focus sort, il passe au lien de la nouvelle', () => {
    stubBrowser();
    reduce = true;
    const root = mount();
    const destroy = initCertCarousel(root);
    const link = q(root, '.cc-slide.is-current .cc-verify');
    link.focus();
    const wheel = new WheelEvent('wheel', { deltaX: 40, deltaY: 0, bubbles: true, cancelable: true });
    q(root, '.cc-stage').dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q(root, '.cc-slide.is-current .cc-verify'));
    expect(document.activeElement).not.toBe(link);
    expect(root.contains(document.activeElement)).toBe(true);
    destroy();
  });

  it('molette verticale : aucune action, aucun preventDefault, rien sur window', () => {
    stubBrowser();
    const spy = vi.spyOn(window, 'addEventListener');
    const root = mount();
    const destroy = initCertCarousel(root);
    expect(spy.mock.calls.some(([type]) => type === 'wheel')).toBe(false);
    const wheel = new WheelEvent('wheel', { deltaX: 0, deltaY: 120, bubbles: true, cancelable: true });
    q(root, '.cc-stage').dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    expect(currentId(root)).toBe(ids(root)[0]);
    spy.mockRestore();
    destroy();
  });

  it('autoplay : seulement à l’écran, retenu au survol et au focus, aria-live off ; pause → polite', () => {
    vi.useFakeTimers();
    stubBrowser();
    const root = mount();
    const destroy = initCertCarousel(root);
    const status = q(root, '.cc-status');
    const order = ids(root);
    expect(status.getAttribute('aria-live')).toBe('off');
    // hors écran : rien ne bouge
    vi.advanceTimersByTime(AUTOPLAY_DELAY * 3);
    expect(currentId(root)).toBe(order[0]);
    // à l'écran : avance après le délai, puis message de statut en fin d'animation
    observers[0].show(true);
    vi.advanceTimersByTime(AUTOPLAY_DELAY + 50);
    expect(currentId(root)).toBe(order[1]);
    vi.advanceTimersByTime(3000);
    expect(status.textContent).toContain(`2 sur ${order.length}`);
    expect(status.textContent).toContain(q(root, '.cc-slide.is-current .cc-title').textContent);
    expect(status.textContent).not.toMatch(/cert --show|Vérifier/);
    // survol souris : retenu
    root.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    vi.advanceTimersByTime(AUTOPLAY_DELAY * 2);
    expect(currentId(root)).toBe(order[1]);
    root.dispatchEvent(Object.assign(new Event('pointerleave'), { pointerType: 'mouse' }));
    // focus dans le carrousel : retenu
    q(root, '.cc-next').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.advanceTimersByTime(AUTOPLAY_DELAY * 2);
    expect(currentId(root)).toBe(order[1]);
    q(root, '.cc-next').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    vi.advanceTimersByTime(AUTOPLAY_DELAY + 50);
    expect(currentId(root)).toBe(order[2]);
    vi.advanceTimersByTime(3000);
    // pause : plus aucun changement, statut annoncé poliment, libellé « Lancer » affiché
    q(root, '[data-cc-toggle]').click();
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(q(root, '[data-cc-label="pause"]').hidden).toBe(true);
    expect(q(root, '[data-cc-label="play"]').hidden).toBe(false);
    vi.advanceTimersByTime(AUTOPLAY_DELAY * 3);
    expect(currentId(root)).toBe(order[2]);
    destroy();
  });

  it('geste manuel : arrête définitivement l’autoplay', () => {
    vi.useFakeTimers();
    stubBrowser();
    const root = mount();
    const destroy = initCertCarousel(root);
    observers[0].show(true);
    q(root, '.cc-next').click();
    vi.advanceTimersByTime(AUTOPLAY_DELAY * 4);
    expect(currentId(root)).toBe(ids(root)[1]);
    expect(q(root, '.cc-status').getAttribute('aria-live')).toBe('polite');
    destroy();
  });

  it('mouvement réduit : pas d’autoplay au démarrage, bouton « Lancer » affiché', () => {
    vi.useFakeTimers();
    stubBrowser();
    reduce = true;
    const root = mount();
    const destroy = initCertCarousel(root);
    observers[0].show(true);
    vi.advanceTimersByTime(AUTOPLAY_DELAY * 3);
    expect(currentId(root)).toBe(ids(root)[0]);
    expect(q(root, '[data-cc-label="play"]').hidden).toBe(false);
    expect(q(root, '.cc-status').getAttribute('aria-live')).toBe('polite');
    destroy();
  });

  it('destroy() rend le HTML d’origine ; un nouvel init n’avance pas deux fois', () => {
    vi.useFakeTimers();
    stubBrowser();
    const root = mount();
    const destroy = initCertCarousel(root);
    observers[0].show(true);
    destroy();
    expect(root.classList.contains('cc--enhanced')).toBe(false);
    expect(root.hasAttribute('role')).toBe(false);
    expect(q(root, '.cc-track').getAttribute('role')).toBe('list');
    expect(q(root, '.cc-controls').hidden).toBe(true);
    expect(root.querySelector('.is-current, [aria-hidden="true"].cc-slide, [aria-current]')).toBeNull();
    for (const card of root.querySelectorAll('.cc-card')) expect(card.getAttribute('style') ?? '').toBe('');
    expect(observers.every(o => o.disconnected)).toBe(true);
    expect(mqlListeners.size).toBe(0);
    // ancien timer annulé : aucune avance
    vi.advanceTimersByTime(AUTOPLAY_DELAY * 2);
    expect(root.querySelector('.is-current')).toBeNull();

    const destroy2 = initCertCarousel(root);
    observers.at(-1).show(true);
    vi.advanceTimersByTime(AUTOPLAY_DELAY + 50);
    expect(currentId(root)).toBe(ids(root)[1]);
    destroy2();
  });

  it('sans racine ou avec trop peu de slides : aucune amélioration, aucune erreur', () => {
    expect(() => initCertCarousel(null)()).not.toThrow();
    document.body.innerHTML = '<div data-cc><ul class="cc-track"><li data-cc-slide></li></ul></div>';
    const root = document.querySelector('[data-cc]');
    initCertCarousel(root)();
    expect(root.classList.contains('cc--enhanced')).toBe(false);
  });
});
