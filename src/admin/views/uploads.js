/* ================================================
   VUE FICHIERS — CV (PDF, FR/EN) et images (PNG/JPEG/WebP)
   Les JPEG sont ré-encodés via <canvas> avant envoi (suppression des
   métadonnées EXIF, dont la géolocalisation). Le serveur revérifie tout.
   ================================================ */

import { api, AdminApiError } from '../api.js';
import { h, mount, nextId } from '../dom.js';

const LIMITS = { cv: 3 * 1024 * 1024, image: 1.5 * 1024 * 1024 };
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const formatSize = n => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} Mo` : `${Math.ceil(n / 1024)} Ko`);

const UPLOAD_REASONS = {
  magic_mismatch: 'le contenu du fichier ne correspond pas à son type',
  pdf_active_content: 'le PDF contient du contenu actif (JavaScript, lancement…)',
  too_small: 'fichier trop petit'
};

function describeError(err) {
  if (!(err instanceof AdminApiError)) return 'Erreur inattendue.';
  if (err.code === 'UPLOAD_INVALID') return `Fichier refusé : ${UPLOAD_REASONS[err.details?.[0]?.code] ?? 'contenu invalide'}.`;
  if (err.code === 'UNSUPPORTED_MEDIA_TYPE') return 'Type de fichier non autorisé (PDF pour le CV ; PNG, JPEG ou WebP pour les images ; SVG interdit).';
  if (err.code === 'PAYLOAD_TOO_LARGE') return 'Fichier trop volumineux (3 Mo max. pour un PDF, 1,5 Mo pour une image).';
  return err.message;
}

/** Ré-encode un JPEG pour retirer ses métadonnées. */
async function stripJpegMetadata(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encodage'))), 'image/jpeg', 0.9));
}

function copyButton(text, app) {
  return h('button', {
    type: 'button', class: 'btn btn--ghost btn--small',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(text);
        app.toast('Chemin copié.', 'ok');
      } catch {
        app.toast(`Copie impossible : ${text}`, 'info');
      }
    }
  }, 'Copier le chemin');
}

function result(url, extra, app) {
  return h('p', { class: 'upload-result' }, h('span', { class: 'mono' }, url), ' ', copyButton(url, app), extra ? ` ${extra}` : '');
}

function cvCard(lang, app) {
  const id = nextId();
  const input = h('input', { id, type: 'file', accept: 'application/pdf', class: 'input-file' });
  const out = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { type: 'submit', class: 'btn' }, `Envoyer le CV ${lang.toUpperCase()}`);

  async function send(file, baseSha) {
    return api.upload({ kind: 'cv', lang }, file, 'application/pdf', baseSha);
  }

  return h('form', {
    class: 'card', onSubmit: async e => {
      e.preventDefault();
      const file = input.files?.[0];
      if (!file) return input.focus();
      if (file.type !== 'application/pdf') return mount(out, h('p', { class: 'error' }, 'Le CV doit être un PDF.'));
      if (file.size > LIMITS.cv) return mount(out, h('p', { class: 'error' }, `Fichier trop volumineux (${formatSize(file.size)} > 3 Mo).`));
      btn.disabled = true;
      try {
        let res;
        try {
          res = await send(file);
        } catch (err) {
          // Un CV existe déjà : remplacement explicite, sous verrou sha
          if (err instanceof AdminApiError && err.code === 'CONFLICT' && err.body.currentSha
            && window.confirm(`Un CV ${lang.toUpperCase()} existe déjà dans le brouillon. Le remplacer ?`)) {
            res = await send(file, err.body.currentSha);
          } else throw err;
        }
        mount(out, result(res.url, res.duplicate ? '(identique au fichier existant)' : '', app),
          h('p', { class: 'muted' }, 'Pour que le bouton « CV » du site pointe vers ce fichier, renseignez ce chemin dans Site › CV › URL.'));
        app.toast(`CV ${lang.toUpperCase()} envoyé dans le brouillon.`, 'ok');
        app.refreshStatus?.();
      } catch (err) {
        if (err instanceof AdminApiError && err.status === 401) return app.handleError(err);
        mount(out, h('p', { class: 'error', role: 'alert' }, describeError(err)));
      } finally {
        btn.disabled = false;
      }
    }
  },
  h('h2', {}, `CV ${lang === 'fr' ? 'français' : 'anglais'}`),
  h('div', { class: 'field' }, h('label', { for: id, class: 'field-label' }, 'Fichier PDF (3 Mo max.)'), input),
  btn, out);
}

function imageCard(app) {
  const fileId = nextId();
  const nameId = nextId();
  const input = h('input', { id: fileId, type: 'file', accept: IMAGE_TYPES.join(','), class: 'input-file' });
  const name = h('input', { id: nameId, type: 'text', class: 'input', maxlength: '60', autocomplete: 'off' });
  const strip = h('input', { type: 'checkbox', checked: true });
  const previewBox = h('div', { class: 'preview' });
  const out = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { type: 'submit', class: 'btn' }, 'Envoyer l’image');
  let objectUrl = null;

  input.addEventListener('change', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const file = input.files?.[0];
    previewBox.replaceChildren();
    if (!file || !IMAGE_TYPES.includes(file.type)) return;
    objectUrl = URL.createObjectURL(file);
    previewBox.append(h('img', { src: objectUrl, alt: 'Aperçu de l’image sélectionnée' }));
    if (!name.value) name.value = file.name.replace(/\.[^.]+$/, '');
  });

  return h('form', {
    class: 'card', onSubmit: async e => {
      e.preventDefault();
      let file = input.files?.[0];
      if (!file) return input.focus();
      if (!IMAGE_TYPES.includes(file.type)) return mount(out, h('p', { class: 'error' }, 'Formats acceptés : PNG, JPEG, WebP (SVG interdit).'));
      btn.disabled = true;
      try {
        let blob = file;
        if (file.type === 'image/jpeg' && strip.checked) blob = await stripJpegMetadata(file);
        if (blob.size > LIMITS.image) {
          mount(out, h('p', { class: 'error' }, `Image trop volumineuse (${formatSize(blob.size)} > 1,5 Mo).`));
          return;
        }
        const res = await api.upload({ kind: 'image', name: name.value }, blob, file.type);
        const warn = res.warnings?.includes('exif_present') ? '⚠ métadonnées EXIF présentes' : '';
        mount(out, result(res.url, res.duplicate ? '(déjà présente)' : warn, app));
        app.toast('Image envoyée dans le brouillon.', 'ok');
        app.refreshStatus?.();
      } catch (err) {
        if (err instanceof AdminApiError && err.status === 401) return app.handleError(err);
        mount(out, h('p', { class: 'error', role: 'alert' }, describeError(err)));
      } finally {
        btn.disabled = false;
      }
    }
  },
  h('h2', {}, 'Image'),
  h('div', { class: 'field' }, h('label', { for: fileId, class: 'field-label' }, 'Fichier PNG, JPEG ou WebP (1,5 Mo max.)'), input),
  h('div', { class: 'field' }, h('label', { for: nameId, class: 'field-label' }, 'Libellé (sert à nommer le fichier)'), name),
  h('label', { class: 'inline-check' }, strip, ' Retirer les métadonnées des JPEG (recommandé : géolocalisation)'),
  previewBox, btn, out);
}

export function renderUploads(container, app) {
  const heading = h('h1', { tabindex: '-1' }, 'Fichiers');
  mount(container,
    heading,
    h('p', { class: 'muted' }, 'Les fichiers sont commités dans le brouillon ; le nom est toujours généré par le serveur.'),
    h('div', { class: 'cards' }, cvCard('fr', app), cvCard('en', app), imageCard(app)));
  heading.focus();
}
