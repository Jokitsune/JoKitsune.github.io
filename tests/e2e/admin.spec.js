import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Panneau /admin servi par `vite preview` avec les en-têtes de vercel.json
// (CSP stricte + Trusted Types). L'API est simulée par page.route : on vérifie
// l'interface réelle dans le navigateur, sans aucune violation CSP.

const projects = JSON.parse(readFileSync(new URL('../../content/projects.json', import.meta.url), 'utf8'));
const SHA = 'a'.repeat(40);

/** Collecte les violations CSP / Trusted Types et les erreurs JS. */
function watch(page) {
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e}`));
  page.on('console', msg => {
    if (/Content Security Policy|TrustedHTML|Trusted Type|Refused to/i.test(msg.text())) problems.push(msg.text());
  });
  return problems;
}

async function mockApi(page, { me = true } = {}) {
  const puts = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
    if (url.pathname === '/api/auth/me') {
      return me
        ? json(200, { login: 'Jokitsune', id: '1', expiresAt: new Date(Date.now() + 3600e3).toISOString(), authTime: new Date().toISOString(), stepUpValid: true, publishMode: 'pr', previewUrl: 'https://preview.example.vercel.app', devMode: false })
        : json(401, { error: { code: 'UNAUTHENTICATED', message: 'Authentification requise.' } });
    }
    if (url.pathname === '/api/content/projects' && method === 'GET') return json(200, { file: 'projects', ref: 'draft', branch: 'content/draft', sha: SHA, data: projects });
    if (url.pathname === '/api/content/projects' && method === 'PUT') {
      puts.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
      return puts.length === 1
        ? json(409, { error: { code: 'CONFLICT', message: 'Le contenu a été modifié entre-temps.', currentSha: 'b'.repeat(40) } })
        : json(200, { file: 'projects', sha: 'c'.repeat(40), commitSha: 'd'.repeat(40), branch: 'content/draft', unchanged: false });
    }
    if (url.pathname === '/api/publish/status') return json(200, { ahead: 2, prUrl: null, previewUrl: 'https://preview.example.vercel.app', checks: 'pending', headSha: SHA, draftExists: true });
    if (url.pathname === '/api/publish') return json(403, { error: { code: 'STEP_UP_REQUIRED', message: 'Reconnexion récente requise pour cette action.' } });
    return json(404, { error: { code: 'NOT_FOUND', message: 'Ressource introuvable.' } });
  });
  return puts;
}

test('en-têtes de sécurité de /admin/ et redirection /admin', async ({ page, request }) => {
  const res = await request.get('/admin/');
  expect(res.headers()['content-security-policy']).toContain("require-trusted-types-for 'script'");
  expect(res.headers()['x-robots-tag']).toContain('noindex');
  // (Cache-Control est réécrit par le serveur de preview : vérifié dans tests/unit/security-config.test.js)
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/$/);
});

test('sans session : écran de connexion, aucune violation CSP', async ({ page }) => {
  const problems = watch(page);
  await mockApi(page, { me: false });
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Administration du portfolio' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Se connecter avec GitHub' })).toHaveAttribute('href', '/api/auth/login');
  expect(problems).toEqual([]);
});

test('échec de connexion : message générique', async ({ page }) => {
  await mockApi(page, { me: false });
  await page.goto('/admin/?e=auth');
  await expect(page.getByRole('alert')).toContainText('Connexion refusée');
});

test('éditeur : édition FR/EN, conflit 409, enregistrement — sous CSP + Trusted Types', async ({ page }) => {
  const problems = watch(page);
  const puts = await mockApi(page);
  page.on('dialog', d => d.accept());
  await page.goto('/admin/#/edit/projects');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Projets');

  // Ouvre le premier projet au clavier et édite le titre FR
  const first = page.locator('details.item').first();
  await first.locator('summary').focus();
  await page.keyboard.press('Enter');
  const fr = first.getByLabel('FR', { exact: true }).first();
  await fr.fill('Scanner <b>XSS</b>');
  await expect(page.locator('.issues')).toContainText('erreur');
  await fr.fill('Scanner Réseau v2');
  await expect(page.locator('.issues')).toBeHidden();

  // 1er envoi : conflit ⇒ panneau, pas de réécriture automatique
  await page.getByRole('button', { name: 'Enregistrer dans le brouillon' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Conflit' })).toBeVisible();
  expect(puts).toHaveLength(1);
  expect(puts[0].headers['x-jk-admin']).toBe('1');
  expect(puts[0].headers['content-type']).toBe('application/json');
  expect(puts[0].body.baseSha).toBe(SHA);
  expect(puts[0].body.data.projects[0].title.fr).toBe('Scanner Réseau v2');

  // Choix explicite de l'utilisateur puis nouvel envoi
  await page.getByRole('button', { name: 'Garder mes modifications (base distante)' }).click();
  await page.getByRole('button', { name: 'Enregistrer dans le brouillon' }).click();
  await expect(page.locator('#toast')).toContainText('Enregistré');
  expect(puts).toHaveLength(2);
  expect(puts[1].body.baseSha).toBe('b'.repeat(40));

  // Le texte saisi n'a jamais été interprété
  await expect(page.locator('b')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('publication : step-up demandé, lien de ré-authentification', async ({ page }) => {
  const problems = watch(page);
  await mockApi(page);
  page.on('dialog', d => d.accept());
  await page.goto('/admin/#/publish');
  await expect(page.getByText('Modifications en attente')).toBeVisible();
  await page.getByRole('button', { name: 'Publier' }).click();
  await expect(page.getByRole('link', { name: 'Se ré-authentifier avec GitHub' })).toHaveAttribute('href', '/api/auth/login?stepup=1');
  expect(problems).toEqual([]);
});
