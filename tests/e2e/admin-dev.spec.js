import { test, expect } from '@playwright/test';

// Parcours complet sur le VRAI backend de développement (ADMIN_DEV_MODE=1,
// backend fichier .admin-dev-e2e/) : aucune simulation par page.route.
// Connexion → édition → enregistrement → publication (avec step-up dédié) →
// vérification de la version publiée et de la synchronisation develop simulée.

test.describe.configure({ mode: 'serial' });

test('connexion, édition, enregistrement et publication', async ({ page }) => {
  const problems = [];
  page.on('pageerror', e => problems.push(String(e)));
  page.on('dialog', d => d.accept());

  // 1. Connexion (fictive en mode dev : pas de GitHub)
  await page.goto('/api/auth/login');
  await expect(page).toHaveURL(/\/admin\/$/);
  await expect(page.getByText('MODE DEV')).toBeVisible();

  // 2. Édition du titre FR du premier projet
  await page.goto('/admin/#/edit/projects');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Projets');
  const first = page.locator('details.item').first();
  await first.locator('summary').click();
  const fr = first.getByLabel('FR', { exact: true }).first();
  const title = `Scanner Réseau e2e ${Date.now()}`;
  await fr.fill(title);
  await page.getByLabel('Résumé du changement (facultatif)').fill('titre e2e');

  // 3. Enregistrement dans le brouillon
  await page.getByRole('button', { name: 'Enregistrer dans le brouillon' }).click();
  await expect(page.locator('#toast')).toContainText('Enregistré dans le brouillon');
  await expect(page.locator('.savebar')).toContainText('brouillon (content/draft)');

  // 4. Publication : une connexion ordinaire ne suffit pas (step-up dédié exigé)
  await page.goto('/admin/#/publish');
  await expect(page.locator('.status-grid')).toContainText('1');
  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  const reauth = page.getByRole('link', { name: 'Se ré-authentifier avec GitHub' });
  await expect(reauth).toBeVisible();
  await reauth.click();
  await expect(page).toHaveURL(/\/admin\/(\?stepup=ok)?/);
  await expect(page.locator('#toast')).toContainText('Ré-authentification effectuée');

  await page.goto('/admin/#/publish');
  // Publication en deux temps : le 1er clic ouvre la pull request et lance la CI…
  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(page.getByText('Étape 1/2 faite')).toBeVisible();
  // … le 2e clic fusionne une fois la CI verte (toujours verte en mode dev)
  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  const done = page.locator('.panel--ok');
  await expect(done).toContainText('Publication effectuée');
  await expect(page.locator('#toast')).toContainText('Publication effectuée');
  await expect(done).toContainText('develop');
  await expect(page.getByRole('button', { name: 'Publier (rien à publier)' })).toBeDisabled();

  // 5. La version publiée contient la modification
  const published = await page.request.get('/api/content/projects?ref=main');
  expect(published.ok()).toBe(true);
  expect((await published.json()).data.projects[0].title.fr).toBe(title);

  expect(problems).toEqual([]);
});
