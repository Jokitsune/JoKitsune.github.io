/* ================================================
   VUE PUBLICATION — statut du brouillon, preview, publication (PR vers la
   branche de base, CI verte, ré-authentification récente), abandon.
   ================================================ */

import { api, AdminApiError } from '../api.js';
import { externalLink, h, mount } from '../dom.js';

const CHECK_LABELS = {
  none: 'aucune vérification',
  pending: 'en cours',
  success: 'réussies',
  failure: 'en échec'
};

export async function renderPublish(container, app) {
  const heading = h('h1', { tabindex: '-1' }, 'Publication');
  const body = h('div', {}, h('p', { class: 'muted' }, 'Chargement du statut…'));
  const message = h('div', { 'aria-live': 'polite' });
  mount(container, heading, message, body);
  heading.focus();

  let status;
  try {
    status = await api.publishStatus();
  } catch (err) {
    app.handleError(err);
    mount(body, h('p', { class: 'error' }, 'Statut indisponible.'));
    return;
  }

  const showMessage = (text, kind = 'info', extra = null) =>
    mount(message, h('div', { class: `panel panel--${kind}`, role: kind === 'error' ? 'alert' : 'status' }, h('p', {}, text), extra));

  const publishBtn = h('button', { type: 'button', class: 'btn btn--primary', disabled: status.ahead === 0 }, 'Publier');
  publishBtn.addEventListener('click', async () => {
    if (!window.confirm(`Publier ${status.ahead} modification(s) sur le site en ligne ?`)) return;
    publishBtn.disabled = true;
    try {
      const res = await api.publish(status.headSha);
      showMessage('Publication effectuée. Le site sera redéployé dans une minute environ.', 'ok', externalLink(res.prUrl, 'Voir la pull request'));
      app.setDirty(false);
      await renderPublish(container, app);
      return;
    } catch (err) {
      if (!(err instanceof AdminApiError)) throw err;
      const prLink = externalLink(err.body.prUrl, 'Voir la pull request');
      switch (err.code) {
        case 'STEP_UP_REQUIRED':
          showMessage('Par sécurité, publier exige une connexion GitHub de moins de 15 minutes.', 'warn',
            h('a', { class: 'btn', href: '/api/auth/login?stepup=1' }, 'Se ré-authentifier avec GitHub'));
          break;
        case 'CHECKS_PENDING':
          showMessage('La pull request est ouverte et la CI tourne. Réessayez dans une minute.', 'info', prLink);
          break;
        case 'CHECKS_FAILED':
          showMessage('La CI a échoué : corrigez le contenu avant de publier.', 'error', prLink);
          break;
        case 'CONFLICT':
          showMessage('Le brouillon a changé depuis l’affichage : statut rechargé, vérifiez puis recommencez.', 'warn');
          await renderPublish(container, app);
          return;
        case 'NOTHING_TO_PUBLISH':
          showMessage('Rien à publier.', 'info');
          break;
        default:
          app.handleError(err);
      }
    } finally {
      publishBtn.disabled = status.ahead === 0;
    }
  });

  // Abandon du brouillon : confirmation explicite par saisie de « DISCARD »
  const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'reset-title' });
  const confirmInput = h('input', { id: 'reset-confirm', class: 'input', type: 'text', autocomplete: 'off' });
  mount(dialog,
    h('form', {
      method: 'dialog', onSubmit: async e => {
        e.preventDefault();
        if (confirmInput.value !== 'DISCARD') {
          confirmInput.setAttribute('aria-invalid', 'true');
          confirmInput.focus();
          return;
        }
        dialog.close();
        try {
          await api.resetDraft();
          app.toast('Brouillon réaligné sur la version publiée.', 'ok');
          await renderPublish(container, app);
        } catch (err) {
          if (err instanceof AdminApiError && err.code === 'STEP_UP_REQUIRED') {
            showMessage('Abandonner le brouillon exige une connexion GitHub récente.', 'warn',
              h('a', { class: 'btn', href: '/api/auth/login?stepup=1' }, 'Se ré-authentifier avec GitHub'));
          } else app.handleError(err);
        }
      }
    },
    h('h2', { id: 'reset-title' }, 'Abandonner le brouillon ?'),
    h('p', {}, 'Toutes les modifications non publiées seront perdues. Tapez DISCARD pour confirmer.'),
    h('label', { for: 'reset-confirm', class: 'field-label' }, 'Confirmation'),
    confirmInput,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn--ghost', onClick: () => dialog.close() }, 'Annuler'),
      h('button', { type: 'submit', class: 'btn btn--danger' }, 'Abandonner'))));

  mount(body,
    h('dl', { class: 'status-grid' },
      h('dt', {}, 'Modifications en attente'), h('dd', {}, String(status.ahead)),
      h('dt', {}, 'Vérifications CI'), h('dd', {}, h('span', { class: `badge badge--${status.checks}` }, CHECK_LABELS[status.checks] ?? status.checks)),
      h('dt', {}, 'Tête du brouillon'), h('dd', { class: 'mono' }, status.headSha ? status.headSha.slice(0, 7) : '—'),
      h('dt', {}, 'Pull request'), h('dd', {}, externalLink(status.prUrl, 'Ouvrir sur GitHub') ?? '—'),
      h('dt', {}, 'Preview du brouillon'), h('dd', {}, externalLink(status.previewUrl, 'Ouvrir la preview Vercel') ?? 'non configurée (DRAFT_PREVIEW_URL)')),
    h('div', { class: 'actions' },
      publishBtn,
      h('button', { type: 'button', class: 'btn btn--danger', disabled: !status.draftExists, onClick: () => { confirmInput.value = ''; dialog.showModal(); confirmInput.focus(); } }, 'Abandonner le brouillon'),
      h('button', { type: 'button', class: 'btn btn--ghost', onClick: () => renderPublish(container, app) }, 'Actualiser')),
    h('p', { class: 'muted' }, 'Publier ouvre (ou réutilise) une pull request du brouillon vers la branche publiée, attend que la CI soit verte puis la fusionne. Une connexion GitHub de moins de 15 minutes est exigée.'),
    dialog);
}
