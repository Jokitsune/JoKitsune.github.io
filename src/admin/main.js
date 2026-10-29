/* ================================================
   PANNEAU /admin — point d'entrée
   Vanilla JS, aucune dépendance tierce à l'exécution hormis le schéma zod
   partagé, aucun innerHTML, aucun stockage navigateur.
   ================================================ */

import { z } from 'zod';
import { CONTENT_FILES } from '../lib/schema.js';
import { api, AdminApiError } from './api.js';
import { h, mount } from './dom.js';
import { FILE_LABELS } from './labels.js';
import { renderEditor } from './views/editor.js';
import { renderUploads } from './views/uploads.js';
import { renderPublish } from './views/publish.js';
import './admin.css';

// CSP sans 'unsafe-eval' : zod ne doit pas tenter de compiler du code (new Function)
z.config({ jitless: true });

const app = document.getElementById('app');
const toastRegion = document.getElementById('toast');
let dirty = false;
let me = null;
let toastTimer = null;

/* -------- Utilitaires d'interface -------- */

function toast(message, kind = 'info') {
  clearTimeout(toastTimer);
  mount(toastRegion, h('p', { class: `toast toast--${kind}` }, message));
  toastTimer = setTimeout(() => toastRegion.replaceChildren(), 6000);
}

function setDirty(value) {
  dirty = value;
  document.title = `${value ? '● ' : ''}Admin · JoKitsune`;
}

window.addEventListener('beforeunload', e => {
  if (dirty) e.preventDefault();
});

/** Erreurs génériques : session expirée, CSRF, admin désactivé… */
function handleError(err) {
  if (!(err instanceof AdminApiError)) {
    toast('Erreur inattendue.', 'error');
    return;
  }
  if (err.status === 401) {
    setDirty(false);
    toast('Session expirée : reconnectez-vous.', 'error');
    renderLogin();
    return;
  }
  if (err.code === 'ADMIN_DISABLED') {
    renderDisabled();
    return;
  }
  toast(`${err.message}${err.body?.requestId ? ` (réf. ${err.body.requestId})` : ''}`, 'error');
}

/* -------- Écrans -------- */

function brand() {
  return h('p', { class: 'brand' }, h('span', { class: 'prompt' }, 'jk@admin'), ':', h('span', { class: 'path' }, '~'), '$ ', h('span', { class: 'cursor', 'aria-hidden': 'true' }));
}

function renderLogin() {
  const params = new URLSearchParams(location.search);
  const heading = h('h1', { tabindex: '-1' }, 'Administration du portfolio');
  mount(app,
    h('main', { id: 'main', class: 'login' },
      h('div', { class: 'login-card' },
        brand(),
        heading,
        params.get('e') === 'auth'
          ? h('p', { class: 'panel panel--error', role: 'alert' }, 'Connexion refusée. Seul le compte propriétaire peut accéder à cet espace.')
          : null,
        h('p', { class: 'muted' }, 'Connexion par GitHub (identité uniquement, aucun accès au dépôt n’est demandé).'),
        h('a', { class: 'btn btn--primary', href: '/api/auth/login' }, 'Se connecter avec GitHub'))));
  heading.focus();
}

function renderDisabled() {
  mount(app,
    h('main', { id: 'main', class: 'login' },
      h('div', { class: 'login-card' },
        brand(),
        h('h1', {}, 'Administration indisponible'),
        h('p', { class: 'muted' }, 'Le panneau est désactivé sur ce déploiement (configuration absente ou invalide).'))));
}

const ROUTES = ['edit', 'uploads', 'publish'];

function parseHash() {
  const [, view = 'edit', arg] = location.hash.match(/^#\/([a-z]+)(?:\/([a-z-]+))?$/) ?? [];
  if (!ROUTES.includes(view)) return { view: 'edit', arg: CONTENT_FILES[0] };
  if (view === 'edit') return { view, arg: CONTENT_FILES.includes(arg) ? arg : CONTENT_FILES[0] };
  return { view };
}

function renderShell() {
  const nav = h('nav', { class: 'sidenav', 'aria-label': 'Sections de l’administration' },
    h('p', { class: 'sidenav-title' }, 'Contenu'),
    h('ul', {}, CONTENT_FILES.map(file => h('li', {}, h('a', { href: `#/edit/${file}`, dataset: { route: `edit/${file}` } }, FILE_LABELS[file].title)))),
    h('p', { class: 'sidenav-title' }, 'Médias'),
    h('ul', {}, h('li', {}, h('a', { href: '#/uploads', dataset: { route: 'uploads' } }, 'Fichiers'))),
    me.publishMode === 'pr'
      ? [h('p', { class: 'sidenav-title' }, 'Mise en ligne'), h('ul', {}, h('li', {}, h('a', { href: '#/publish', dataset: { route: 'publish' } }, 'Publication')))]
      : null);

  const logoutBtn = h('button', {
    type: 'button', class: 'btn btn--ghost btn--small', onClick: async () => {
      if (dirty && !window.confirm('Des modifications ne sont pas enregistrées. Se déconnecter quand même ?')) return;
      try {
        await api.logout();
      } catch {
        // Session déjà expirée : rien à faire
      }
      setDirty(false);
      me = null;
      renderLogin();
    }
  }, 'Déconnexion');

  const navWrap = h('div', { class: 'sidenav-wrap' }, nav);
  const main = h('main', { id: 'main', class: 'content', tabindex: '-1' });
  mount(app,
    h('header', { class: 'topbar' },
      brand(),
      h('p', { class: 'session' },
        me.devMode ? h('span', { class: 'badge badge--warn' }, 'MODE DEV') : null,
        ` ${me.login} · session jusqu’à ${new Date(me.expiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} `,
        logoutBtn)),
    h('div', { class: 'layout' }, navWrap, main));
  // Indice de défilement de la navigation (mobile) masqué en fin de course
  const updateNavHint = () => navWrap.classList.toggle('at-end', nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 4);
  nav.addEventListener('scroll', updateNavHint, { passive: true });
  window.addEventListener('resize', updateNavHint);
  updateNavHint();

  const ctx = { toast, setDirty, handleError };

  async function route() {
    const { view, arg } = parseHash();
    const current = view === 'edit' ? `edit/${arg}` : view;
    nav.querySelectorAll('a').forEach(a => {
      if (a.dataset.route === current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    // Conteneur neuf à chaque navigation : un rendu asynchrone plus ancien (ex. l'éditeur
    // encore en chargement) se termine dans un nœud détaché et n'écrase pas la vue courante
    const container = h('div', { class: 'view' });
    main.replaceChildren(container);
    if (view === 'edit') await renderEditor(container, arg, ctx);
    else if (view === 'uploads') renderUploads(container, ctx);
    else if (view === 'publish' && me.publishMode === 'pr') await renderPublish(container, ctx);
  }

  let lastHash = location.hash;
  window.addEventListener('hashchange', () => {
    if (dirty && !window.confirm('Des modifications ne sont pas enregistrées. Quitter cette page ?')) {
      history.replaceState(null, '', lastHash || '#/edit/site');
      return;
    }
    setDirty(false);
    lastHash = location.hash;
    route();
  });
  route();
}

/* -------- Démarrage -------- */

async function start() {
  const params = new URLSearchParams(location.search);
  try {
    me = await api.me();
  } catch (err) {
    if (err instanceof AdminApiError && err.code === 'ADMIN_DISABLED') return renderDisabled();
    if (err instanceof AdminApiError && err.status === 404) return renderDisabled();
    return renderLogin();
  }
  if (params.get('stepup') === 'ok') {
    history.replaceState(null, '', `/admin/${location.hash}`);
    toast('Ré-authentification effectuée : vous pouvez publier.', 'ok');
  }
  renderShell();
}

start();
