/* ================================================
   FORMULAIRE GÉNÉRÉ DEPUIS LE JSON SCHEMA (content/schema/*.schema.json,
   dérivé du schéma zod partagé) — édition FR/EN côte à côte, listes avec
   ajout / suppression / réordonnancement / masquage.

   Le modèle (objet JSON) est modifié en place ; toute modification
   structurelle reconstruit le formulaire en conservant le focus.
   ================================================ */

import { h, mount, nextId } from './dom.js';
import { fieldLabel } from './labels.js';

/* -------- Introspection du schéma -------- */

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Texte traduisible : anyOf [string, { fr, en }]. */
export function isLocalizedSchema(schema) {
  return Array.isArray(schema?.anyOf)
    && schema.anyOf.some(s => s.type === 'string')
    && schema.anyOf.some(s => s.type === 'object' && s.properties?.fr && s.properties?.en);
}

/** Liste d'éléments gérés (id / order / visible). */
export function isManagedList(schema) {
  const p = schema?.items?.properties;
  return schema?.type === 'array' && Boolean(p?.id && p?.order && p?.visible);
}

const isRecord = schema => schema?.type === 'object' && !schema.properties && isObj(schema.additionalProperties);

// Champs affichés en zone de texte multi-ligne
const LONG_KEYS = new Set(['description', 'bio', 'ogDescription', 'keywords', 'success', 'error', 'messagePlaceholder']);

/** Valeur par défaut d'un nouveau nœud. */
export function defaultFor(schema, key) {
  if (isLocalizedSchema(schema)) return { fr: '', en: '' };
  if (Array.isArray(schema?.enum)) return schema.enum[0];
  switch (schema?.type) {
    case 'string': return '';
    case 'boolean': return key === 'visible';
    case 'integer':
    case 'number': return typeof schema.minimum === 'number' && schema.minimum > 0 ? schema.minimum : 0;
    case 'array': return [];
    case 'object': {
      if (isRecord(schema)) return {};
      const out = {};
      for (const k of schema.required ?? []) out[k] = defaultFor(schema.properties[k], k);
      return out;
    }
    default: return '';
  }
}

const joinPath = (base, key) => (typeof key === 'number' ? `${base}[${key}]` : base ? `${base}.${key}` : String(key));

/** Identifiant libre de la forme « nouveau-N ». */
function freshId(items) {
  const used = new Set(items.map(i => i?.id));
  let n = items.length + 1;
  while (used.has(`nouveau-${n}`)) n += 1;
  return `nouveau-${n}`;
}

/** Texte court résumant un élément (pour la ligne repliée). */
function summaryText(item) {
  for (const k of ['title', 'label', 'role', 'text', 'key', 'network', 'date']) {
    const v = item?.[k];
    if (typeof v === 'string' && v) return v;
    if (isObj(v) && (v.fr || v.en)) return v.fr || v.en;
  }
  return item?.id ?? '';
}

/**
 * @param {{ schema: object, data: object, onChange: () => void }} opts
 */
export function createForm({ schema, data, onChange, advanced = [] }) {
  const root = h('div', { class: 'schema-form' });
  const openItems = new Set();
  // Champs techniques regroupés dans une section repliée « Avancé »
  const advancedPaths = new Set(advanced);
  let advancedNodes = [];
  let advancedOpen = false;

  function changed() {
    onChange();
  }

  const byFocusKey = key => [...root.querySelectorAll('[data-focus-key]')].find(el => el.dataset.focusKey === key);

  /**
   * Cible du focus après reconstruction. Si le bouton est devenu désactivé
   * (Monter en tête de liste, Descendre en fin), on passe au bouton inverse,
   * sinon à l'élément lui-même : le focus n'est jamais perdu.
   */
  function focusTarget(key) {
    let el = byFocusKey(key);
    if (!el || !el.disabled) return el;
    const alt = key.endsWith('#up') ? key.replace(/#up$/, '#down') : key.endsWith('#down') ? key.replace(/#down$/, '#up') : null;
    const altEl = alt ? byFocusKey(alt) : null;
    if (altEl && !altEl.disabled) return altEl;
    el = el.closest('details')?.querySelector('summary') ?? el.closest('li')?.querySelector('input, textarea, select');
    return el ?? null;
  }

  /** Reconstruit le formulaire en gardant le focus (même data-path / data-action). */
  function rerender(focusKey) {
    const active = document.activeElement;
    const key = focusKey ?? (active && root.contains(active) ? active.dataset.focusKey : null);
    advancedNodes = [];
    const main = renderObjectFields(data, schema, '');
    const section = advancedNodes.length
      ? h('details', { class: 'advanced', open: advancedOpen, onToggle: e => { advancedOpen = e.target.open; } },
        h('summary', { dataset: { focusKey: '#advanced' } }, 'Avancé ', h('span', { class: 'muted' }, '(réglages techniques : Formspree, robots, Open Graph, audio…)')),
        h('div', { class: 'group' }, advancedNodes))
      : null;
    mount(root, main, section);
    if (key) focusTarget(key)?.focus();
  }

  function structural(focusKey) {
    rerender(focusKey);
    changed();
  }

  /* -------- Champs élémentaires -------- */

  function errorSlot(path) {
    return h('p', { class: 'field-error', id: `err-${nextId()}`, dataset: { errorFor: path }, hidden: true });
  }

  function textInput(parent, key, schema, path, labelText) {
    const id = nextId();
    const value = parent[key] ?? '';
    const long = LONG_KEYS.has(key) || String(value).includes('\n') || String(value).length > 90;
    const err = errorSlot(path);
    const attrs = {
      id,
      class: 'input',
      dataset: { path, focusKey: path },
      'aria-describedby': err.id,
      maxlength: schema?.maxLength,
      spellcheck: 'true',
      onInput: e => {
        parent[key] = e.target.value;
        changed();
      }
    };
    const input = long ? h('textarea', { ...attrs, rows: Math.min(8, Math.max(3, String(value).split('\n').length + 1)) }) : h('input', { ...attrs, type: 'text' });
    input.value = value;
    return h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, labelText), input, err);
  }

  function localizedInput(parent, key, schema, path, labelText) {
    const value = parent[key];
    const same = typeof value === 'string';
    const groupId = nextId('grp');
    const toggle = h('input', {
      type: 'checkbox',
      checked: same,
      dataset: { focusKey: `${path}#same` },
      onChange: e => {
        const v = parent[key];
        if (e.target.checked) parent[key] = typeof v === 'string' ? v : (v?.fr ?? '');
        else parent[key] = typeof v === 'string' ? { fr: v, en: v } : v;
        structural(`${path}#same`);
      }
    });
    const head = h('div', { class: 'field-head' },
      h('span', { class: 'field-label', id: groupId }, labelText),
      h('label', { class: 'inline-check' }, toggle, ' Identique en FR et EN'));
    let body;
    if (same) {
      body = h('div', { class: 'i18n-grid i18n-grid--single' }, textInput(parent, key, schema.anyOf.find(s => s.type === 'string'), path, 'FR + EN'));
    } else {
      const obj = parent[key];
      const sub = schema.anyOf.find(s => s.type === 'object').properties;
      body = h('div', { class: 'i18n-grid' },
        h('div', { class: 'i18n-col', lang: 'fr' }, textInput(obj, 'fr', sub.fr, joinPath(path, 'fr'), 'FR')),
        h('div', { class: 'i18n-col', lang: 'en' }, textInput(obj, 'en', sub.en, joinPath(path, 'en'), 'EN')));
    }
    return h('div', { class: 'field field--i18n', role: 'group', 'aria-labelledby': groupId, dataset: { path } }, head, body, errorSlot(path));
  }

  function booleanInput(parent, key, path, labelText) {
    const id = nextId();
    const err = errorSlot(path);
    return h('div', { class: 'field field--check' },
      h('input', {
        id, type: 'checkbox', checked: Boolean(parent[key]), dataset: { path, focusKey: path }, 'aria-describedby': err.id,
        onChange: e => {
          parent[key] = e.target.checked;
          changed();
        }
      }),
      h('label', { for: id }, labelText), err);
  }

  function numberInput(parent, key, schema, path, labelText) {
    const id = nextId();
    const err = errorSlot(path);
    const input = h('input', {
      id, type: 'number', class: 'input input--number', inputmode: schema.type === 'integer' ? 'numeric' : 'decimal',
      step: schema.type === 'integer' ? '1' : 'any',
      min: schema.minimum > -1e15 ? schema.minimum : undefined,
      max: schema.maximum < 1e15 ? schema.maximum : undefined,
      dataset: { path, focusKey: path }, 'aria-describedby': err.id,
      onInput: e => {
        parent[key] = e.target.value === '' ? '' : Number(e.target.value);
        changed();
      }
    });
    input.value = parent[key] ?? '';
    return h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, labelText), input, err);
  }

  function enumInput(parent, key, schema, path, labelText) {
    const id = nextId();
    const err = errorSlot(path);
    const select = h('select', {
      id, class: 'input', dataset: { path, focusKey: path }, 'aria-describedby': err.id,
      onChange: e => {
        parent[key] = e.target.value;
        changed();
      }
    }, schema.enum.map(v => h('option', { value: v }, v)));
    select.value = parent[key];
    return h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, labelText), select, err);
  }

  /* -------- Dispatch -------- */

  function renderField(parent, key, schema, path, { optional = false, label } = {}) {
    const labelText = label ?? fieldLabel(key);
    let node;
    if (isLocalizedSchema(schema)) node = localizedInput(parent, key, schema, path, labelText);
    else if (Array.isArray(schema?.enum)) node = enumInput(parent, key, schema, path, labelText);
    else if (schema?.type === 'string') node = textInput(parent, key, schema, path, labelText);
    else if (schema?.type === 'boolean') node = booleanInput(parent, key, path, labelText);
    else if (schema?.type === 'integer' || schema?.type === 'number') node = numberInput(parent, key, schema, path, labelText);
    else if (isManagedList(schema)) node = renderManagedList(parent[key], schema, path, labelText);
    else if (schema?.type === 'array') node = renderSimpleList(parent[key], schema, path, labelText);
    else if (isRecord(schema)) node = renderRecord(parent[key], schema, path, labelText);
    else if (schema?.type === 'object') {
      node = h('fieldset', { class: 'group', dataset: { path } }, h('legend', {}, labelText), renderObjectFields(parent[key], schema, path), errorSlot(path));
    } else node = textInput(parent, key, { type: 'string' }, path, labelText);

    if (!optional) return node;
    return h('div', { class: 'optional' }, node,
      h('button', {
        type: 'button', class: 'btn btn--ghost btn--small', dataset: { focusKey: `${path}#add` },
        onClick: () => {
          delete parent[key];
          structural(`${path}#add`);
        }
      }, `Retirer « ${labelText} »`));
  }

  function renderObjectFields(obj, schema, path) {
    const required = new Set(schema.required ?? []);
    const out = [];
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key === '$schema') continue;
      const childPath = joinPath(path, key);
      if (!(key in obj)) {
        if (!required.has(key)) {
          out.push(h('button', {
            type: 'button', class: 'btn btn--ghost btn--small', dataset: { focusKey: `${childPath}#add` },
            onClick: () => {
              obj[key] = defaultFor(sub, key);
              structural(`${childPath}#add`);
            }
          }, `＋ Ajouter « ${fieldLabel(key)} »`));
        }
        continue;
      }
      if (advancedPaths.has(childPath)) {
        // Libellé complet (le champ est affiché hors de son groupe d'origine)
        const label = childPath.split('.').map(fieldLabel).join(' › ');
        advancedNodes.push(renderField(obj, key, sub, childPath, { optional: !required.has(key), label }));
        continue;
      }
      out.push(renderField(obj, key, sub, childPath, { optional: !required.has(key) }));
    }
    return out;
  }

  /* -------- Listes gérées (id / order / visible) -------- */

  function renumber(items) {
    items.forEach((it, i) => { it.order = i + 1; });
  }

  function renderManagedList(items, schema, path, labelText) {
    const itemSchema = schema.items;
    const headingId = nextId('lst');
    const list = h('ol', { class: 'items' });
    items.forEach((item, index) => {
      const itemPath = joinPath(path, index);
      const keyBase = `${path}@${item.id}`;
      const move = delta => () => {
        const target = index + delta;
        if (target < 0 || target >= items.length) return;
        [items[index], items[target]] = [items[target], items[index]];
        renumber(items);
        structural(`${path}@${item.id}#${delta < 0 ? 'up' : 'down'}`);
      };
      const details = h('details', {
        class: ['item', item.visible === false && 'item--hidden'], open: openItems.has(keyBase),
        onToggle: e => (e.target.open ? openItems.add(keyBase) : openItems.delete(keyBase))
      });
      const fields = Object.entries(itemSchema.properties)
        .filter(([k]) => k !== 'order' && k !== 'visible')
        .map(([k, sub]) => (k in item || (itemSchema.required ?? []).includes(k)
          ? renderField(item, k, sub, joinPath(itemPath, k), { optional: !(itemSchema.required ?? []).includes(k) })
          : h('button', {
            type: 'button', class: 'btn btn--ghost btn--small', dataset: { focusKey: `${itemPath}.${k}#add` },
            onClick: () => {
              item[k] = defaultFor(sub, k);
              structural(`${itemPath}.${k}#add`);
            }
          }, `＋ Ajouter « ${fieldLabel(k)} »`)));
      mount(details,
        h('summary', { dataset: { focusKey: `${keyBase}#summary` } },
          h('span', { class: 'item-order' }, String(index + 1).padStart(2, '0')),
          h('span', { class: 'item-title' }, summaryText(item) || '(sans titre)'),
          item.visible === false ? h('span', { class: 'badge badge--muted' }, 'masqué') : null),
        h('div', { class: 'item-toolbar', role: 'toolbar', 'aria-label': `Actions sur l’élément ${index + 1}` },
          h('button', { type: 'button', class: 'btn btn--ghost btn--small', disabled: index === 0, dataset: { focusKey: `${keyBase}#up` }, onClick: move(-1) }, '↑ Monter'),
          h('button', { type: 'button', class: 'btn btn--ghost btn--small', disabled: index === items.length - 1, dataset: { focusKey: `${keyBase}#down` }, onClick: move(1) }, '↓ Descendre'),
          h('label', { class: 'inline-check' },
            h('input', {
              type: 'checkbox', checked: item.visible !== false, dataset: { path: joinPath(itemPath, 'visible'), focusKey: `${keyBase}#visible` },
              onChange: e => {
                item.visible = e.target.checked;
                structural(`${keyBase}#visible`);
              }
            }), ' Visible'),
          h('button', {
            type: 'button', class: 'btn btn--danger btn--small',
            onClick: () => {
              if (!window.confirm(`Supprimer l’élément « ${summaryText(item) || item.id} » ?`)) return;
              items.splice(index, 1);
              renumber(items);
              openItems.delete(keyBase);
              structural(`${path}#add`);
            }
          }, 'Supprimer')),
        h('div', { class: 'item-fields' }, fields));
      list.append(h('li', {}, details));
    });
    return h('section', { class: 'list', 'aria-labelledby': headingId, dataset: { path } },
      h('div', { class: 'list-head' },
        h('h3', { id: headingId }, `${labelText} `, h('span', { class: 'count' }, `(${items.length})`)),
        h('button', {
          type: 'button', class: 'btn btn--small', dataset: { focusKey: `${path}#add` },
          onClick: () => {
            const item = defaultFor(itemSchema);
            item.id = freshId(items);
            item.visible = true;
            items.push(item);
            renumber(items);
            openItems.add(`${path}@${item.id}`);
            structural(`${path}@${item.id}#summary`);
          }
        }, '＋ Ajouter')),
      list, errorSlot(path));
  }

  /* -------- Listes simples (étiquettes, liens, puces…) -------- */

  function renderSimpleList(items, schema, path, labelText) {
    const headingId = nextId('lst');
    const rows = items.map((_, index) => {
      const itemPath = joinPath(path, index);
      const move = delta => () => {
        const target = index + delta;
        if (target < 0 || target >= items.length) return;
        [items[index], items[target]] = [items[target], items[index]];
        structural(`${joinPath(path, target)}#${delta < 0 ? 'up' : 'down'}`);
      };
      const sub = schema.items;
      const field = sub?.type === 'object' && !isLocalizedSchema(sub)
        ? h('div', { class: 'subgroup' }, renderObjectFields(items[index], sub, itemPath))
        : renderField(items, index, sub, itemPath, { label: `${labelText} n° ${index + 1}` });
      return h('li', { class: 'simple-item' }, field,
        h('div', { class: 'item-toolbar', role: 'toolbar', 'aria-label': `Actions sur l’entrée ${index + 1}` },
          h('button', { type: 'button', class: 'btn btn--ghost btn--small', disabled: index === 0, 'aria-label': `Monter l’entrée ${index + 1}`, dataset: { focusKey: `${itemPath}#up` }, onClick: move(-1) }, '↑'),
          h('button', { type: 'button', class: 'btn btn--ghost btn--small', disabled: index === items.length - 1, 'aria-label': `Descendre l’entrée ${index + 1}`, dataset: { focusKey: `${itemPath}#down` }, onClick: move(1) }, '↓'),
          h('button', {
            type: 'button', class: 'btn btn--danger btn--small', 'aria-label': `Supprimer l’entrée ${index + 1}`,
            onClick: () => {
              items.splice(index, 1);
              structural(`${path}#add`);
            }
          }, '✕')));
    });
    return h('section', { class: 'list list--simple', 'aria-labelledby': headingId, dataset: { path } },
      h('div', { class: 'list-head' },
        h('h3', { id: headingId }, `${labelText} `, h('span', { class: 'count' }, `(${items.length})`)),
        h('button', {
          type: 'button', class: 'btn btn--small', dataset: { focusKey: `${path}#add` },
          onClick: () => {
            items.push(defaultFor(schema.items));
            structural(`${joinPath(path, items.length - 1)}#up`);
          }
        }, '＋ Ajouter')),
      h('ol', { class: 'simple-items' }, rows), errorSlot(path));
  }

  /* -------- Dictionnaire clé → texte (a11y) -------- */

  function renderRecord(obj, schema, path, labelText) {
    const headingId = nextId('rec');
    const keyInputId = nextId();
    const rows = Object.keys(obj).map(k => h('div', { class: 'record-row' },
      renderField(obj, k, schema.additionalProperties, joinPath(path, k)),
      h('button', {
        type: 'button', class: 'btn btn--danger btn--small', 'aria-label': `Supprimer la clé ${k}`,
        onClick: () => {
          delete obj[k];
          structural(`${path}#add`);
        }
      }, '✕')));
    const keyInput = h('input', { id: keyInputId, class: 'input', type: 'text', pattern: '[A-Za-z0-9]+', autocomplete: 'off' });
    return h('section', { class: 'list', 'aria-labelledby': headingId, dataset: { path } },
      h('h3', { id: headingId }, labelText),
      rows,
      h('div', { class: 'record-add' },
        h('label', { for: keyInputId, class: 'field-label' }, 'Nouvelle clé (lettres et chiffres)'),
        keyInput,
        h('button', {
          type: 'button', class: 'btn btn--small', dataset: { focusKey: `${path}#add` },
          onClick: () => {
            const k = keyInput.value.trim();
            if (!/^[A-Za-z0-9]+$/.test(k) || k in obj) {
              keyInput.setAttribute('aria-invalid', 'true');
              keyInput.focus();
              return;
            }
            obj[k] = '';
            structural(joinPath(path, k));
          }
        }, '＋ Ajouter')),
      errorSlot(path));
  }

  /* -------- Erreurs de validation -------- */

  /**
   * Marque les champs en erreur.
   * @param {{ path: string, message: string }[]} issues
   */
  function setIssues(issues) {
    root.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
    root.querySelectorAll('[data-error-for]').forEach(el => {
      el.hidden = true;
      el.textContent = '';
    });
    for (const issue of issues) {
      const slot = [...root.querySelectorAll('[data-error-for]')].find(el => el.dataset.errorFor === issue.path);
      if (slot) {
        slot.hidden = false;
        slot.textContent = slot.textContent ? `${slot.textContent} · ${issue.message}` : issue.message;
      }
      const input = [...root.querySelectorAll('[data-path]')].find(el => el.dataset.path === issue.path && el.matches('input, textarea, select'));
      input?.setAttribute('aria-invalid', 'true');
    }
  }

  /** Donne le focus au champ d'un chemin (ouvre l'élément de liste parent). */
  function focusPath(path) {
    let target = [...root.querySelectorAll('[data-path]')].find(el => el.dataset.path === path);
    // Chemin sans champ dédié (ex. clé manquante) : on remonte au parent le plus proche
    let p = path;
    while (!target && p) {
      p = p.replace(/(\.[^.[\]]+|\[\d+\])$/, '');
      target = [...root.querySelectorAll('[data-path]')].find(el => el.dataset.path === p);
    }
    if (!target) return;
    for (let d = target.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    const focusable = target.matches('input, textarea, select') ? target : target.querySelector('input, textarea, select, button');
    focusable?.focus();
    target.scrollIntoView?.({ block: 'center' });
  }

  rerender();
  return { element: root, rerender, setIssues, focusPath };
}
