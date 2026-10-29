import { test, expect } from '@playwright/test';

// Comportements à préserver (écrits pour passer aussi sur l'ancienne version du site,
// cf. E2E_BASE_URL dans playwright.config.js).

const skipBoot = page => page.addInitScript(() => sessionStorage.setItem('portfolio_boot_seen', 'true'));
const setLang = (page, lang) => page.addInitScript(l => localStorage.setItem('portfolio_lang', l), lang);

test.beforeEach(async ({ context }) => {
  // L'audio distant n'est pas utile aux tests
  await context.route(/cdn\.pixabay\.com/, r => r.abort());
});

test('aucune erreur JS et contenu pré-rendu en FR', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await skipBoot(page);
  await setLang(page, 'fr');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#skills .section-title')).toHaveText('ArsenalTechnique');
  await expect(page.locator('.project-card')).toHaveCount(6);
  await expect(page.locator('footer')).toContainText('Tous droits réservés');
  expect(errors).toEqual([]);
});

test('écran de boot : affiché puis fermé par Échap, mémorisé en session', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#boot-screen')).toBeVisible();
  await expect(page.locator('.boot-line')).toHaveCount(8);
  await page.keyboard.press('Escape');
  await expect(page.locator('#boot-screen')).toHaveCount(0, { timeout: 3000 });
  await page.reload();
  await expect(page.locator('#boot-screen')).toHaveCount(0);
});

test('bascule de langue FR <-> EN', async ({ page }) => {
  await skipBoot(page);
  await setLang(page, 'fr');
  await page.goto('/');
  await page.locator('.lang-btn[data-lang="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.hero-greeting')).toHaveText('// SYSTEM IDENTIFICATION');
  await expect(page.locator('#formation .section-title')).toHaveText('Education &Experience');
  await expect(page.locator('#form-name')).toHaveAttribute('placeholder', 'Your name...');
  await expect(page.locator('.lang-btn[data-lang="en"]')).toHaveClass(/active/);
  await page.locator('.lang-btn[data-lang="fr"]').click();
  await expect(page.locator('.hero-greeting')).toHaveText('// IDENTIFICATION DU SYSTÈME');
});

test('pile de réseaux sociaux : ouverture et fermeture au clic extérieur', async ({ page }) => {
  await skipBoot(page);
  await page.goto('/');
  const container = page.locator('#socialStackContainer');
  await page.locator('#socialTriggerBtn').click();
  await expect(container).toHaveClass(/open/);
  await expect(page.locator('#socialTriggerBtn')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.social-pile-item.github-item')).toBeVisible();
  await page.locator('#skills .section-title').click();
  await expect(container).not.toHaveClass(/open/);
  await expect(page.locator('#socialLinksPile')).toHaveAttribute('aria-hidden', 'true');
});

test('menu mobile : ouverture puis fermeture au clic sur un lien', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'menu burger uniquement sur mobile');
  await skipBoot(page);
  await page.goto('/');
  const toggle = page.locator('#navToggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('#navLinks')).toHaveClass(/open/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.nav-link-item[href="#contact"]').click();
  await expect(page.locator('#navLinks')).not.toHaveClass(/open/);
});

test('CSP appliquée (en-têtes vercel.json) : aucune violation, aucun script tiers', async ({ page }) => {
  const violations = [];
  const scripts = [];
  page.on('console', msg => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  page.on('request', req => {
    if (req.resourceType() === 'script') scripts.push(req.url());
  });
  const response = await page.goto('/');
  expect(response.headers()['content-security-policy']).toMatch(/^default-src 'self'; script-src 'self';/);
  // Parcours qui exerce le boot, la langue, les cartes et le formulaire
  await page.keyboard.press('Escape');
  await page.locator('.lang-btn[data-lang="en"]').click();
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await page.locator('#formation').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  expect(violations).toEqual([]);
  expect(scripts.every(u => new URL(u).origin === new URL(page.url()).origin)).toBe(true);
});

test('formulaire de contact : envoi vers Formspree (réponse simulée)', async ({ page }) => {
  let posted = null;
  await page.route('https://formspree.io/**', async route => {
    posted = { url: route.request().url(), body: route.request().postData() };
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await skipBoot(page);
  await setLang(page, 'fr');
  await page.goto('/');
  await page.fill('#form-name', 'Test');
  await page.fill('#form-email', 'test@example.com');
  await page.fill('#form-message', 'Bonjour');
  await page.locator('#fs-submit-btn').click();
  await expect(page.locator('[data-fs-success]')).toBeVisible();
  await expect(page.locator('#fs-submit-btn')).toHaveText('✓ MESSAGE_ENVOYÉ.sh');
  expect(posted.url).toBe('https://formspree.io/f/xpqbjwpo');
  expect(posted.body).toContain('Bonjour');
});
