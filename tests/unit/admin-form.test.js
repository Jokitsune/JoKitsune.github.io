// @vitest-environment jsdom
// Formulaire généré depuis le JSON Schema : FR/EN côte à côte, listes
// (ajout, suppression, réordonnancement, masquage), erreurs, aucun HTML interprété.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createForm, defaultFor, isLocalizedSchema, isManagedList } from '../../src/admin/form.js';
import { diffValues, preview } from '../../src/admin/diff.js';
import { validateForWrite } from '../../src/lib/content-guard.js';
import { loadRealContent, readRepoFile, XSS } from './helpers.js';

const schemas = Object.fromEntries(['site', 'ui', 'skills', 'projects', 'timeline', 'cards']
  .map(f => [f, JSON.parse(readRepoFile(`content/schema/${f}.schema.json`))]));

let data;
let changes;
let form;

function build(file = 'projects') {
  data = loadRealContent()[file];
  changes = 0;
  form = createForm({ schema: schemas[file], data, onChange: () => { changes += 1; } });
  document.body.replaceChildren(form.element);
  return form;
}

const byPath = p => [...document.querySelectorAll('[data-path]')].find(el => el.dataset.path === p && el.matches('input, textarea, select'));
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);

function type(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('confirm', () => true);
});

describe('Introspection du schéma', () => {
  it('texte traduisible et liste gérée détectés', () => {
    const item = schemas.projects.properties.projects;
    expect(isManagedList(item)).toBe(true);
    expect(isLocalizedSchema(item.items.properties.title)).toBe(true);
    expect(defaultFor(item.items)).toMatchObject({ id: '', order: 0, visible: true, title: { fr: '', en: '' }, stack: [], links: [] });
  });

  it('chaque fichier se rend sans erreur et chaque champ a un libellé', () => {
    for (const file of Object.keys(schemas)) {
      build(file);
      for (const input of document.querySelectorAll('input:not([type=checkbox]), textarea, select')) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        expect(label, `${file} › ${input.dataset.path}`).not.toBeNull();
      }
    }
  });
});

describe('Édition FR / EN', () => {
  it('deux champs côte à côte, la saisie met à jour le modèle', () => {
    build();
    const fr = byPath('projects[0].title.fr');
    const en = byPath('projects[0].title.en');
    expect(fr.closest('.i18n-grid')).toBe(en.closest('.i18n-grid'));
    type(fr, 'Nouveau');
    expect(data.projects[0].title.fr).toBe('Nouveau');
    expect(changes).toBe(1);
  });

  it('« Identique en FR et EN » convertit chaîne ⇄ { fr, en }', () => {
    build('skills');
    const tagPath = 'categories[0].tags[0]';
    const original = data.categories[0].tags[0];
    const group = [...document.querySelectorAll('.field--i18n')].find(g => g.dataset.path === tagPath);
    const toggle = group.querySelector('input[type=checkbox]');
    const wasString = typeof original === 'string';
    toggle.checked = !wasString;
    toggle.dispatchEvent(new Event('change'));
    expect(typeof data.categories[0].tags[0]).toBe(wasString ? 'object' : 'string');
  });

  it('le texte saisi n’est jamais interprété comme du HTML', () => {
    build();
    const fr = byPath('projects[0].title.fr');
    type(fr, XSS);
    form.rerender();
    expect(document.querySelector('img')).toBeNull();
    expect(byPath('projects[0].title.fr').value).toBe(XSS);
    expect(validateForWrite('projects', data).ok).toBe(false);
  });
});

describe('Listes gérées', () => {
  it('ajout : identifiant unique, visible, ordre en fin de liste', () => {
    build();
    const n = data.projects.length;
    button('＋ Ajouter').click();
    expect(data.projects).toHaveLength(n + 1);
    const added = data.projects.at(-1);
    expect(added.id).toMatch(/^nouveau-\d+$/);
    expect(added.visible).toBe(true);
    expect(added.order).toBe(n + 1);
    expect(byPath(`projects[${n}].title.fr`)).toBeTruthy();
  });

  it('réordonnancement : « Descendre » échange et renumérote order', () => {
    build();
    const [a, b] = data.projects.map(p => p.id);
    const toolbar = document.querySelector('.item > .item-toolbar');
    [...toolbar.querySelectorAll('button')].find(x => x.textContent.includes('Descendre')).click();
    expect(data.projects.slice(0, 2).map(p => p.id)).toEqual([b, a]);
    expect(data.projects.map(p => p.order)).toEqual(data.projects.map((_, i) => i + 1));
  });

  it('masquage : la case « Visible » bascule visible', () => {
    build();
    const box = document.querySelector('.item > .item-toolbar input[type=checkbox]');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(data.projects[0].visible).toBe(false);
    expect(document.querySelector('.item').classList.contains('item--hidden')).toBe(true);
  });

  it('suppression avec confirmation', () => {
    build();
    const n = data.projects.length;
    const id = data.projects[0].id;
    document.querySelector('.item > .item-toolbar .btn--danger').click();
    expect(data.projects).toHaveLength(n - 1);
    expect(data.projects.some(p => p.id === id)).toBe(false);
  });

  it('suppression annulée si l’utilisateur refuse', () => {
    vi.stubGlobal('confirm', () => false);
    build();
    const n = data.projects.length;
    document.querySelector('.item > .item-toolbar .btn--danger').click();
    expect(data.projects).toHaveLength(n);
  });

  it('listes simples : ajout et suppression d’une technologie', () => {
    build();
    const stack = data.projects[0].stack;
    const n = stack.length;
    const section = [...document.querySelectorAll('.list--simple')].find(s => s.dataset.path === 'projects[0].stack');
    section.querySelector('.list-head button').click();
    expect(data.projects[0].stack).toHaveLength(n + 1);
  });

  it('le focus est conservé après une modification structurelle', () => {
    build();
    const toolbar = document.querySelectorAll('.item > .item-toolbar')[1];
    const down = [...toolbar.querySelectorAll('button')].find(x => x.textContent.includes('Descendre'));
    down.focus();
    down.click();
    expect(document.activeElement?.dataset.focusKey).toMatch(/#down$/);
  });
});

describe('Erreurs de validation', () => {
  it('setIssues marque le champ (aria-invalid) et affiche le message', () => {
    build();
    form.setIssues([{ path: 'projects[0].title.fr', message: 'Balisage HTML interdit' }]);
    const input = byPath('projects[0].title.fr');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const slot = document.getElementById(input.getAttribute('aria-describedby'));
    expect(slot.hidden).toBe(false);
    expect(slot.textContent).toBe('Balisage HTML interdit');
    form.setIssues([]);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('focusPath ouvre l’élément replié et donne le focus', () => {
    build();
    form.focusPath('projects[2].description.en');
    expect(document.activeElement).toBe(byPath('projects[2].description.en'));
    expect(document.activeElement.closest('details').open).toBe(true);
  });
});

describe('Différences (conflits)', () => {
  it('liste les chemins modifiés', () => {
    const a = { x: { fr: 'a', en: 'b' }, l: [1, 2] };
    const b = { x: { fr: 'a', en: 'c' }, l: [1], y: true };
    expect(diffValues(a, b)).toEqual([
      { path: 'x.en', mine: 'b', theirs: 'c' },
      { path: 'l[1]', mine: 2, theirs: undefined },
      { path: 'y', mine: undefined, theirs: true }
    ]);
    expect(preview(undefined)).toBe('(absent)');
    expect(preview('x'.repeat(300))).toHaveLength(161);
  });
});
