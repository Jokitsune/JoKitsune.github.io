/* ================================================
   VUE PUBLICATION — statut du brouillon, preview, publication (PR vers la
   branche de base, CI verte, ré-authentification dédiée), synchro develop, abandon.
   La publication se fait en deux temps : le 1er clic ouvre la PR et lance la
   CI (ou met le brouillon à jour), le 2e clic — CI verte — fusionne.
   ================================================ */

import { api, AdminApiError } from '../api.js';
import { externalLink, h, mount } from '../dom.js';

const CHECK_LABELS = {
  none: 'aucune vérification',
  pending: 'en cours',
  success: 'réussies',
  failure: 'en échec'
};

const SYNC_MESSAGES = {
  auto_merge: 'La synchronisation vers develop est ouverte et sera fusionnée automatiquement quand la CI sera verte.',
  opened: 'La synchronisation vers develop est ouverte : fusionnez-la ici quand sa CI sera verte (auto-merge indisponible sur le dépôt).',
  up_to_date: 'develop est déjà à jour.',
  failed: 'La synchronisation vers develop n’a pas pu être ouverte : faites-la à la main (voir CONTRIBUTING.md).',
  disabled: ''
};

const stepUpLink = () => h('a', { class: 'btn', href: '/api/auth/login?stepup=1' }, 'Se ré-authentifier avec GitHub');

export async function renderPublish(container, app, notice = null) {
  const heading = h('h1', { tabindex: '-1' }, 'Publication');
  const body = h('div', {}, h('p', { class: 'muted' }, 'Chargement du statut…'));
  const message = h('div', { 'aria-live': 'polite' });
  mount(container, heading, message, body);
  heading.focus();

  const showMessage = (text, kind = 'info', extra = null) =>
    mount(message, h('div', { class: `panel panel--${kind}`, role: kind === 'error' ? 'alert' : 'status' }, h('p', {}, text), extra));
  // Message conservé d'un rendu précédent (ex. succès juste avant le rechargement du statut)
  if (notice) showMessage(notice.text, notice.kind, notice.extra);

  let status;
  try {
    status = await api.publishStatus();
  } catch (err) {
    app.handleError(err);
    mount(body, h('p', { class: 'error' }, 'Statut indisponible.'));
    return;
  }

  const canPublish = status.ahead > 0;
  const publishBtn = h('button', { type: 'button', class: 'btn btn--primary', disabled: !canPublish, 'aria-describedby': 'publish-help' },
    canPublish ? 'Publier' : 'Publier (rien à publier)');
  publishBtn.addEventListener('click', async () => {
    if (!window.confirm(`Publier ${status.ahead} modification(s) sur le site en ligne ?`)) return;
    publishBtn.disabled = true;
    try {
      const res = await api.publish(status.headSha);
      const syncText = SYNC_MESSAGES[res.sync?.status] ?? '';
      app.toast('Publication effectuée : le site sera redéployé dans une minute environ.', 'ok');
      app.setDirty(false);
      await renderPublish(container, app, {
        text: `Publication effectuée. ${syncText}`.trim(),
        kind: 'ok',
        extra: externalLink(res.prUrl, 'Voir la pull request')
      });
      return;
    } catch (err) {
      if (!(err instanceof AdminApiError)) throw err;
      const prLink = externalLink(err.body.prUrl, 'Voir la pull request');
      switch (err.code) {
        case 'STEP_UP_REQUIRED':
          showMessage('Par sécurité, publier exige une ré-authentification GitHub lancée depuis ce bouton (valable 15 minutes). Une connexion ordinaire ne suffit pas.', 'warn', stepUpLink());
          break;
        case 'CHECKS_PENDING':
          if (err.body.branchUpdated) {
            await renderPublish(container, app, {
              text: 'Le brouillon était en retard sur la version publiée : il vient d’être mis à jour et la CI repart. Cliquez à nouveau sur « Publier » dans une à deux minutes.',
              kind: 'info',
              extra: prLink
            });
            return;
          }
          showMessage('Étape 1/2 faite : la pull request est ouverte et la CI tourne. Cliquez à nouveau sur « Publier » dans une à deux minutes.', 'info', prLink);
          break;
        case 'CHECKS_FAILED':
          showMessage('La CI a échoué : corrigez le contenu avant de publier.', 'error', prLink);
          break;
        case 'CONFLICT':
          if (err.body.merged) {
            await renderPublish(container, app, {
              text: 'Publication effectuée, mais le brouillon a reçu de nouvelles modifications pendant la fusion : il n’a pas été réinitialisé. Vérifiez le statut.',
              kind: 'warn'
            });
            return;
          }
          await renderPublish(container, app, { text: 'Le brouillon a changé depuis l’affichage : statut rechargé, vérifiez puis recommencez.', kind: 'warn' });
          return;
        case 'NOTHING_TO_PUBLISH':
          showMessage('Rien à publier.', 'info');
          break;
        default:
          app.handleError(err);
      }
    }
    publishBtn.disabled = !canPublish;
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
            showMessage('Abandonner le brouillon exige une ré-authentification GitHub dédiée.', 'warn', stepUpLink());
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

  // Synchronisation main → develop (repli quand l'auto-merge n'est pas disponible)
  let syncBlock = null;
  if (status.sync?.open) {
    const mergeSyncBtn = h('button', {
      type: 'button', class: 'btn btn--small', disabled: status.sync.autoMerge || status.sync.checks !== 'success',
      onClick: async () => {
        try {
          await api.mergeSync();
          app.toast('develop est synchronisé avec la version publiée.', 'ok');
          await renderPublish(container, app);
        } catch (err) {
          if (err instanceof AdminApiError && err.code === 'CHECKS_PENDING') showMessage('La CI de la synchronisation tourne encore : réessayez dans une minute.', 'info');
          else app.handleError(err);
        }
      }
    }, 'Fusionner la synchronisation');
    syncBlock = h('div', { class: 'panel panel--info' },
      h('p', {}, status.sync.autoMerge
        ? 'Synchronisation vers develop en attente de CI (fusion automatique).'
        : `Synchronisation vers develop ouverte — CI : ${CHECK_LABELS[status.sync.checks] ?? status.sync.checks}.`),
      h('div', { class: 'actions' }, externalLink(status.sync.prUrl, 'Voir la PR de synchronisation'), status.sync.autoMerge ? null : mergeSyncBtn));
  }

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
    h('div', { id: 'publish-help', class: 'muted publish-help' },
      h('p', {}, 'La publication se fait en deux temps : un premier clic ouvre la pull request et lance la CI (1 à 2 minutes) ; quand la CI est verte, un second clic fusionne et met le site en ligne.'),
      h('p', {}, 'Une ré-authentification GitHub dédiée, lancée depuis cette page et datant de moins de 15 minutes, est exigée. Après publication, une pull request synchronise develop.')),
    syncBlock,
    dialog);
}
