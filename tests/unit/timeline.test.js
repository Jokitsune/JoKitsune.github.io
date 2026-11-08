// Frise « Parcours » : schéma, tri, dates, rendu pré-calculé, géométrie et contrôleur.
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateFile, TIMELINE_KINDS } from '../../src/lib/schema.js';
import { validateForWrite } from '../../src/lib/content-guard.js';
import {
  sortTimeline, isOngoing, formatMonth, formatMonthLong, periodText, computeProgress, computeStates
} from '../../src/lib/timeline.js';
import { renderPage, buildDictionary, textToHtml } from '../../src/render/index.js';
import { initTimeline } from '../../src/js/modules/timeline.js';
import { loadRealContent, loadTemplate, readRepoFile } from './helpers.js';

const parse = html => new DOMParser().parseFromString(html, 'text/html');
const norm = s => s.replace(/\s+/g, ' ').trim();
const ITEM = { id: 'x', order: 1, visible: true, kind: 'formation', start: '2024-06', role: 'r', org: 'o', description: 'd' };

describe('timeline.json — schéma', () => {
  it('U1 : le contenu réel est valide (kind, start AAAA-MM, entrées en cours sans end)', () => {
    const { timeline } = loadRealContent();
    expect(validateFile('timeline', timeline).errors).toEqual([]);
    for (const it of timeline.items) {
      expect(TIMELINE_KINDS).toContain(it.kind);
      expect(it.start).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(it).not.toHaveProperty('date');
    }
    const byId = Object.fromEntries(timeline.items.map(i => [i.id, i]));
    expect(byId['consultant-cyber']).toMatchObject({ kind: 'experience', start: '2026-08' });
    expect(byId['consultant-cyber'].end).toBeUndefined();
    expect(byId['benevole-rpc'].end).toBeUndefined();
  });

  it('U2 : refuse catégorie inconnue, mois mal formés, fin avant début, ancien champ date', () => {
    const check = patch => validateForWrite('timeline', { items: [{ ...ITEM, ...patch }] }).issues;
    expect(check({ kind: 'stage' })).toContainEqual({ path: 'items[0].kind', code: 'invalid_enum' });
    for (const start of ['08/2026', '2026-8', '2026-13', '']) {
      expect(check({ start }), start).toContainEqual({ path: 'items[0].start', code: 'invalid_month' });
    }
    expect(check({ end: '2024-05' })).toContainEqual({ path: 'items[0].end', code: 'end_before_start' });
    expect(check({ date: '06/2024' })).toContainEqual({ path: 'items[0].date', code: 'unknown_key' });
    expect(check({ end: '2024-06' })).toEqual([]);
    expect(check({})).toEqual([]);
  });

  it('U3 : la règle description XOR bullets est conservée', () => {
    const issues = validateForWrite('timeline', { items: [{ ...ITEM, bullets: ['b'] }] }).issues;
    expect(issues.map(i => i.code)).toContain('description_xor_bullets');
  });

  it('ui.timeline et ui.sections.certifications sont requis', () => {
    const { ui } = loadRealContent();
    expect(validateFile('ui', ui).success).toBe(true);
    const noTl = structuredClone(ui);
    delete noTl.timeline;
    expect(validateFile('ui', noTl).success).toBe(false);
    const noCert = structuredClone(ui);
    delete noCert.sections.certifications;
    expect(validateFile('ui', noCert).success).toBe(false);
    expect(ui.nav.links.map(l => l.href)).toEqual(['#hero', '#skills', '#projects', '#formation', '#certifications', '#contact']);
  });
});

describe('tri et dates', () => {
  it('U4 : ordre du contenu réel, puis départage en cours > fin > order', () => {
    const { timeline } = loadRealContent();
    expect(sortTimeline(timeline.items).map(i => i.id))
      .toEqual(['consultant-cyber', 'stage-devsecops', 'benevole-rpc', 'licence-esgis', 'bac-d']);
    const items = [
      { id: 'a', order: 1, start: '2024-01', end: '2024-03' },
      { id: 'b', order: 2, start: '2024-01' },
      { id: 'c', order: 3, start: '2024-01', end: '2024-05' },
      { id: 'd', order: 0, start: '2024-01', end: '2024-05' },
      { id: 'h', order: 0, start: '2030-01', visible: false }
    ];
    expect(sortTimeline(items).map(i => i.id)).toEqual(['b', 'd', 'c', 'a']);
    expect(isOngoing({ start: '2024-01' })).toBe(true);
  });

  it('formats visible (MM/AAAA) et lu (mois en toutes lettres, localisé)', () => {
    expect(formatMonth('2024-06')).toBe('06/2024');
    expect(formatMonthLong('2024-06', 'fr')).toBe('juin 2024');
    expect(formatMonthLong('2026-08', 'en')).toBe('August 2026');
    const labels = { present: { fr: 'aujourd’hui', en: 'present' }, to: { fr: 'à', en: 'to' } };
    expect(periodText({ start: '2024-06' }, labels)).toEqual({ fr: 'juin 2024 à aujourd’hui', en: 'June 2024 to present' });
    expect(periodText({ start: '2026-03', end: '2026-06' }, labels).en).toBe('March 2026 to June 2026');
  });
});

describe('rendu de la frise', () => {
  const content = loadRealContent();
  const doc = parse(renderPage(loadTemplate(), content));
  const section = doc.querySelector('#formation');
  const items = [...section.querySelectorAll('ol.tl-list > li.tl-item')];

  it('U5 : section étiquetée par son h2, une entrée <li> par élément visible, h3 en premier', () => {
    expect(section.getAttribute('aria-labelledby')).toBe('formation-title');
    expect(doc.getElementById('formation-title').tagName).toBe('H2');
    expect(norm(doc.getElementById('formation-title').textContent)).toBe('Parcours');
    expect(items).toHaveLength(content.timeline.items.filter(i => i.visible).length);
    expect(section.querySelector('ol.tl-list').getAttribute('role')).toBe('list');
    for (const li of items) {
      expect(TIMELINE_KINDS).toContain(li.dataset.kind);
      expect(li.classList.contains(`tl-item--${li.dataset.kind}`)).toBe(true);
      const body = li.querySelector('.tl-body');
      expect(body.firstElementChild.matches('h3.tl-role')).toBe(true);
      expect([...body.children].map(e => e.classList[0]).slice(0, 4)).toEqual(['tl-role', 'tl-kind', 'tl-when', 'tl-org']);
    }
    expect(doc.querySelector('.timeline-item, .formation-layout')).toBeNull();
  });

  it('U6 : dates <time datetime> AAAA-MM, texte MM/AAAA, période lue en clair', () => {
    for (const li of items) {
      const src = content.timeline.items.find(i => i.id === li.dataset.id);
      const times = [...li.querySelectorAll('time')];
      expect(times[0].getAttribute('datetime')).toBe(src.start);
      expect(times[0].textContent).toBe(formatMonth(src.start));
      if (src.end) {
        expect(times).toHaveLength(2);
        expect(times[1].getAttribute('datetime')).toBe(src.end);
        expect(li.querySelector('.tl-ongoing')).toBeNull();
      } else {
        expect(times).toHaveLength(1);
        expect(li.querySelector('.tl-ongoing').getAttribute('data-i18n')).toBe('timelineUi.present');
      }
      // Le texte « 08/2026 — … » est masqué aux lecteurs d'écran, remplacé par la période en clair
      expect(li.querySelector('.tl-when-text').getAttribute('aria-hidden')).toBe('true');
      const sr = li.querySelector('.tl-when .sr-only');
      expect(sr.getAttribute('data-i18n')).toBe(`timeline.${src.id}.period`);
      expect(sr.textContent).toBe(periodText(src, content.ui.timeline).fr);
    }
    expect(norm(doc.querySelector('[data-id="consultant-cyber"] .tl-when .sr-only').textContent)).toBe('août 2026 à aujourd’hui');
  });

  it('U7 : décor en aria-hidden, aucune classe d’état pré-rendue, aucun style inline', () => {
    expect(section.querySelector('.tl-rail').getAttribute('aria-hidden')).toBe('true');
    for (const n of section.querySelectorAll('.tl-node')) expect(n.getAttribute('aria-hidden')).toBe('true');
    expect(section.outerHTML).not.toMatch(/is-enhanced|is-visible|is-reached|is-active|style=/);
    expect(readRepoFile('src/render/sections.js')).not.toMatch(/style=/);
  });

  it('U8 : dictionnaire FR/EN des libellés de la frise, plus aucune clé *.date', () => {
    const dict = buildDictionary(content);
    for (const l of ['fr', 'en']) {
      for (const k of ['timelineUi.kind.formation', 'timelineUi.kind.experience', 'timelineUi.kind.benevolat', 'timelineUi.present']) {
        expect(dict[l][k], `${l}:${k}`).toBeTypeOf('string');
      }
      expect(Object.keys(dict[l]).filter(k => /^timeline\..*\.date$/.test(k))).toEqual([]);
    }
    expect(dict.en['timelineUi.kind.benevolat']).toBe('Volunteering');
    const en = parse(renderPage(loadTemplate(), content, 'en'));
    expect([...en.querySelectorAll('.tl-kind')].map(e => e.textContent))
      .toEqual(['Experience', 'Experience', 'Volunteering', 'Education', 'Education']);
    expect(en.querySelector('.tl-ongoing').textContent).toBe('present');
    expect(en.querySelector('#formation-title').innerHTML).toBe(textToHtml('Journey'));
  });
});

describe('géométrie du défilement', () => {
  it('U10 : computeProgress borné, 0 sous la ligne de lecture, 0,5 au milieu', () => {
    expect(computeProgress(600, 1000, 900)).toBe(0);
    expect(computeProgress(450, 1000, 900)).toBe(0);
    expect(computeProgress(-50, 1000, 900)).toBe(0.5);
    expect(computeProgress(-5000, 1000, 900)).toBe(1);
    expect(computeProgress(0, 0, 900)).toBe(1);
  });

  it('U11 : computeStates — égalité = atteint, -1 si rien, monotone', () => {
    const centers = [10, 200, 400];
    expect(computeStates(0, centers)).toEqual({ reachedCount: 0, activeIndex: -1 });
    expect(computeStates(200, centers)).toEqual({ reachedCount: 2, activeIndex: 1 });
    expect(computeStates(1000, centers)).toEqual({ reachedCount: 3, activeIndex: 2 });
    let prev = 0;
    for (let y = -10; y < 500; y += 7) {
      const { reachedCount } = computeStates(y, centers);
      expect(reachedCount).toBeGreaterThanOrEqual(prev);
      prev = reachedCount;
    }
    // Tête décalée (barre d'URL mobile : vh ≠ innerHeight) : seul le décalage compte
    expect(computeStates(199.5, centers).reachedCount).toBe(1);
  });
});

describe('contrôleur client', () => {
  let reduce = false;
  const listeners = new Set();
  const observed = [];

  function stubBrowser() {
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return reduce; },
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn)
    }));
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb) { this.cb = cb; observed.push(this); }
      observe() {}
      unobserve() {}
      disconnect() { this.disconnected = true; }
    });
    vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 0));
    vi.stubGlobal('cancelAnimationFrame', id => clearTimeout(id));
  }

  function mount() {
    const html = renderPage(loadTemplate(), loadRealContent());
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')); // gabarit de confiance
    return document.querySelector('[data-timeline]');
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    listeners.clear();
    observed.length = 0;
    reduce = false;
  });

  it('active l’animation, puis destroy() rend le HTML d’origine', () => {
    stubBrowser();
    const root = mount();
    const destroy = initTimeline(root);
    expect(root.classList.contains('is-enhanced')).toBe(true);
    expect(root.style.getPropertyValue('--tl-progress')).not.toBe('');
    destroy();
    expect(root.classList.contains('is-enhanced')).toBe(false);
    expect(root.querySelector('.is-visible, .is-reached, .is-active')).toBeNull();
    expect(root.getAttribute('style') ?? '').toBe('');
    expect(observed.every(o => o.disconnected)).toBe(true);
    expect(listeners.size).toBe(0);
  });

  it('mouvement réduit : rien n’est animé, bascule à chaud dans les deux sens', () => {
    stubBrowser();
    reduce = true;
    const root = mount();
    const destroy = initTimeline(root);
    expect(root.classList.contains('is-enhanced')).toBe(false);
    reduce = false;
    listeners.forEach(fn => fn());
    expect(root.classList.contains('is-enhanced')).toBe(true);
    reduce = true;
    listeners.forEach(fn => fn());
    expect(root.classList.contains('is-enhanced')).toBe(false);
    destroy();
  });

  it('sans IntersectionObserver ni frise : aucune erreur', () => {
    expect(() => initTimeline(null)()).not.toThrow();
  });
});
