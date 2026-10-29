/* ================================================
   VUE ÉDITEUR — un fichier de contenu : formulaire, validation client
   (même schéma que le serveur), enregistrement sous verrou sha, conflits 409.
   ================================================ */

import { validateForWrite, ISSUE_LABELS } from '../../lib/content-guard.js';
import { api, AdminApiError } from '../api.js';
import { h, mount } from '../dom.js';
import { createForm } from '../form.js';
import { FILE_LABELS } from '../labels.js';
import { diffValues, preview } from '../diff.js';
import site from '../../../content/schema/site.schema.json';
import ui from '../../../content/schema/ui.schema.json';
import skills from '../../../content/schema/skills.schema.json';
import projects from '../../../content/schema/projects.schema.json';
import timeline from '../../../content/schema/timeline.schema.json';
import cards from '../../../content/schema/cards.schema.json';

const JSON_SCHEMAS = { site, ui, skills, projects, timeline, cards };

const toMessages = issues => issues.map(i => ({ path: i.path, message: ISSUE_LABELS[i.code] ?? i.code }));

/**
 * @param {HTMLElement} container
 * @param {string} file
 * @param {{ toast: Function, setDirty: Function, handleError: Function }} app
 */
export async function renderEditor(container, file, app) {
  const meta = FILE_LABELS[file];
  const heading = h('h1', { tabindex: '-1' }, meta.title, h('span', { class: 'muted' }, ` · content/${file}.json`));
  const status = h('p', { class: 'muted' }, 'Chargement…');
  mount(container, heading, status);
  heading.focus();

  let loaded;
  try {
    loaded = await api.getContent(file);
  } catch (err) {
    status.textContent = 'Impossible de charger le fichier.';
    app.handleError(err);
    return;
  }

  let baseSha = loaded.sha;
  let data = structuredClone(loaded.data);
  let savedJson = JSON.stringify(data);
  let validateTimer = null;

  const summaryInput = h('input', { id: 'commit-summary', class: 'input', type: 'text', maxlength: '60', autocomplete: 'off', placeholder: 'mise à jour depuis /admin' });
  const issuesBox = h('div', { class: 'issues', role: 'region', 'aria-label': 'Erreurs de validation', hidden: true });
  const conflictBox = h('div', { class: 'panel panel--warn', role: 'alert', hidden: true });
  const saveBtn = h('button', { type: 'submit', class: 'btn btn--primary' }, 'Enregistrer dans le brouillon');
  const shaInfo = h('span', { class: 'muted mono' });
  const updateShaInfo = () => { shaInfo.textContent = `sha ${baseSha.slice(0, 7)} · branche ${loaded.branch}`; };
  updateShaInfo();

  const form = createForm({ schema: JSON_SCHEMAS[file], data, onChange });

  function isDirty() {
    return JSON.stringify(data) !== savedJson;
  }

  function onChange() {
    app.setDirty(isDirty());
    clearTimeout(validateTimer);
    validateTimer = setTimeout(runValidation, 250);
  }

  /** Validation client (confort) : mêmes règles que le serveur. */
  function runValidation() {
    const res = validateForWrite(file, data);
    showIssues(res.ok ? [] : toMessages(res.issues));
    return res;
  }

  function showIssues(messages) {
    form.setIssues(messages);
    if (!messages.length) {
      issuesBox.hidden = true;
      issuesBox.replaceChildren();
      return;
    }
    issuesBox.hidden = false;
    mount(issuesBox,
      h('h2', {}, `${messages.length} erreur(s) à corriger`),
      h('ul', {}, messages.map(m => h('li', {},
        h('button', { type: 'button', class: 'link-btn', onClick: () => form.focusPath(m.path) }, m.path || '(fichier)'),
        ` : ${m.message}`))));
  }

  async function save(event) {
    event.preventDefault();
    const res = runValidation();
    if (!res.ok) {
      issuesBox.querySelector('button')?.focus();
      app.toast('Le contenu contient des erreurs : rien n’a été envoyé.', 'error');
      return;
    }
    saveBtn.disabled = true;
    try {
      const out = await api.putContent(file, { baseSha, data, summary: summaryInput.value || undefined });
      baseSha = out.sha;
      savedJson = JSON.stringify(data);
      app.setDirty(false);
      conflictBox.hidden = true;
      updateShaInfo();
      summaryInput.value = '';
      app.toast(out.unchanged ? 'Aucun changement : rien à enregistrer.' : 'Enregistré dans le brouillon.', 'ok');
      app.refreshStatus?.();
    } catch (err) {
      if (err instanceof AdminApiError && err.code === 'CONFLICT') showConflict(err.body.currentSha);
      else if (err instanceof AdminApiError && err.code === 'VALIDATION') {
        showIssues(toMessages(err.details));
        app.toast('Le serveur a refusé le contenu (validation).', 'error');
      } else app.handleError(err);
    } finally {
      saveBtn.disabled = false;
    }
  }

  /** Conflit : jamais de réécriture automatique ; l'utilisateur choisit. */
  function showConflict(currentSha) {
    conflictBox.hidden = false;
    const diffZone = h('div', { class: 'diff' });
    mount(conflictBox,
      h('h2', {}, 'Conflit : le fichier a été modifié ailleurs'),
      h('p', {}, `Version distante : ${currentSha ? currentSha.slice(0, 7) : 'inconnue'}. Vos modifications n’ont pas été enregistrées.`),
      h('div', { class: 'actions' },
        h('button', {
          type: 'button', class: 'btn', onClick: async () => {
            try {
              const remote = await api.getContent(file);
              const changes = diffValues(data, remote.data);
              mount(diffZone, changes.length
                ? h('table', { class: 'diff-table' },
                  h('caption', {}, `${changes.length} différence(s) entre votre version et la version distante`),
                  h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Chemin'), h('th', { scope: 'col' }, 'Votre version'), h('th', { scope: 'col' }, 'Version distante'))),
                  h('tbody', {}, changes.map(c => h('tr', {}, h('td', { class: 'mono' }, c.path), h('td', {}, preview(c.mine)), h('td', {}, preview(c.theirs))))))
                : h('p', {}, 'Aucune différence de contenu.'));
            } catch (err) {
              app.handleError(err);
            }
          }
        }, 'Voir les différences'),
        h('button', {
          type: 'button', class: 'btn btn--danger', onClick: () => {
            app.setDirty(false);
            renderEditor(container, file, app);
          }
        }, 'Recharger la version distante (abandonner mes modifications)'),
        h('button', {
          type: 'button', class: 'btn', onClick: () => {
            if (!currentSha) return;
            if (!window.confirm('Conserver VOS modifications et les appliquer par-dessus la version distante ? Les changements distants listés seront écrasés.')) return;
            baseSha = currentSha;
            updateShaInfo();
            conflictBox.hidden = true;
            app.toast('Base mise à jour : cliquez sur « Enregistrer » pour confirmer.', 'info');
            saveBtn.focus();
          }
        }, 'Garder mes modifications (base distante)')),
      diffZone);
    conflictBox.focus?.();
  }

  const formEl = h('form', { class: 'editor', novalidate: true, onSubmit: save },
    form.element,
    h('div', { class: 'savebar' },
      h('div', { class: 'field savebar-summary' },
        h('label', { for: 'commit-summary', class: 'field-label' }, 'Résumé du changement (facultatif)'),
        summaryInput),
      h('div', { class: 'savebar-actions' }, shaInfo, saveBtn)));

  mount(container,
    heading,
    h('p', { class: 'muted' }, meta.hint),
    conflictBox,
    issuesBox,
    formEl);
  heading.focus();
  runValidation();
}
