import { test, expect } from '@playwright/test';

// Section « Certifications » (#certifications) : coverflow à logos, contrôles,
// clavier, autoplay pausable, mouvement réduit, swipe, repli sans JS, mise en page.

const skipBoot = page => page.addInitScript(() => sessionStorage.setItem('portfolio_boot_seen', 'true'));
const setLang = (page, lang) => page.addInitScript(l => localStorage.setItem('portfolio_lang', l), lang);

test.beforeEach(async ({ context, page }) => {
  await context.route(/cdn\.pixabay\.com/, r => r.abort());
  await skipBoot(page);
  await setLang(page, 'fr');
});

const section = page => page.locator('#certifications');
const currentTitle = page => page.locator('.cc-slide.is-current .cc-title');
const titles = page => page.locator('.cc-slide .cc-title').allTextContents();
const show = page => section(page).evaluate(el => el.scrollIntoView({ block: 'center' }));

test('logos servis en 200 et décodés ; aucune violation CSP en parcourant #formation et #certifications', async ({ page }) => {
  const violations = [];
  page.on('console', msg => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  const statuses = new Map();
  page.on('response', r => {
    if (r.url().includes('/images/uploads/')) statuses.set(new URL(r.url()).pathname, r.status());
  });
  await page.goto('/');
  for (const id of ['#formation', '#certifications']) {
    const { top, height } = await page.locator(id).evaluate(el => {
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    });
    for (let y = top - 400; y <= top + height; y += 200) {
      await page.evaluate(v => window.scrollTo(0, v), y);
      await page.waitForTimeout(30);
    }
  }
  // Le moteur écrit transform/opacity via le CSSOM pendant l'animation
  await page.locator('.cc-next').click();
  await page.waitForTimeout(600);
  const imgs = page.locator('#certifications .cc-plate img');
  const count = await imgs.count();
  expect(count).toBeGreaterThan(3);
  await expect.poll(() => imgs.evaluateAll(els => els.every(i => i.complete && i.naturalWidth > 0))).toBe(true);
  const srcs = await imgs.evaluateAll(els => [...new Set(els.map(i => new URL(i.src).pathname))]);
  for (const src of srcs) {
    const status = statuses.get(src) ?? (await page.request.get(src)).status();
    expect(status, src).toBe(200);
  }
  expect(violations).toEqual([]);
});

test('boutons ‹ › : titre visible suivant, bouclage dans les deux sens', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await show(page);
  const all = await titles(page);
  await expect(page.locator('.cc-controls')).toBeVisible();
  await expect(currentTitle(page)).toHaveText(all[0]);
  await expect(currentTitle(page)).toBeVisible();
  await page.locator('.cc-next').click();
  await expect(currentTitle(page)).toHaveText(all[1]);
  await expect(currentTitle(page)).toBeVisible();
  for (let i = 1; i < all.length; i += 1) await page.locator('.cc-next').click();
  await expect(currentTitle(page)).toHaveText(all[0]);
  await page.locator('.cc-prev').click();
  await expect(currentTitle(page)).toHaveText(all.at(-1));
  await expect(page.locator('.cc-dot[aria-current="true"]')).toHaveCount(1);
  await expect(page.locator('.cc-dot').last()).toHaveAttribute('aria-current', 'true');
});

test('clavier : ← → Origine Fin sur les contrôles, page immobile, focus jamais perdu', async ({ page }) => {
  await page.goto('/');
  await show(page);
  const all = await titles(page);
  await page.locator('.cc-next').focus();
  const y0 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('ArrowRight');
  await expect(currentTitle(page)).toHaveText(all[1]);
  await page.keyboard.press('End');
  await expect(currentTitle(page)).toHaveText(all.at(-1));
  await page.keyboard.press('Home');
  await expect(currentTitle(page)).toHaveText(all[0]);
  await page.keyboard.press('ArrowLeft');
  await expect(currentTitle(page)).toHaveText(all.at(-1));
  expect(await page.evaluate(() => window.scrollY)).toBe(y0);

  // Focus sur le lien « Vérifier » puis changement de slide (molette horizontale) :
  // le focus passe au lien de la nouvelle slide, jamais sur <body>
  await page.locator('.cc-slide.is-current .cc-verify').focus();
  const box = await page.locator('.cc-stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.wheel(60, 0);
  await expect(currentTitle(page)).toHaveText(all[0]);
  await expect.poll(() => page.evaluate(() => document.activeElement?.matches('.cc-slide.is-current .cc-verify'))).toBe(true);

  // Les liens des slides inactives ne reçoivent jamais le focus
  const hiddenLinks = await page.locator('.cc-slide:not(.is-current) .cc-verify').evaluateAll(els => els.map(a => getComputedStyle(a).visibility));
  expect(hiddenLinks.every(v => v === 'hidden')).toBe(true);
  await expect(page.locator('.cc-slide:not([aria-hidden])')).toHaveCount(1);
});

test('molette verticale au-dessus du carrousel : la page défile', async ({ page, isMobile }) => {
  test.skip(isMobile, 'molette : pointeur fin uniquement');
  await page.goto('/');
  await show(page);
  const all = await titles(page);
  const box = await page.locator('.cc-stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y0);
  await expect(currentTitle(page)).toHaveText(all[0]);
});

test('glisser à la souris : change de slide, sans ouvrir de lien', async ({ page, isMobile }) => {
  test.skip(isMobile, 'souris uniquement');
  await page.goto('/');
  await show(page);
  const all = await titles(page);
  const card = await page.locator('.cc-slide.is-current .cc-card').boundingBox();
  const y = card.y + card.height / 2;
  await page.mouse.move(card.x + card.width / 2, y);
  await page.mouse.down();
  for (let dx = 0; dx <= 120; dx += 20) await page.mouse.move(card.x + card.width / 2 - dx, y);
  await page.mouse.up();
  await expect(currentTitle(page)).toHaveText(all[1]);
});

test('mobile : swipe horizontal → slide suivante ; swipe vertical → la page défile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'tactile : projet mobile');
  await page.goto('/');
  await show(page);
  const all = await titles(page);
  const cdp = await page.context().newCDPSession(page);
  const card = await page.locator('.cc-slide.is-current .cc-card').boundingBox();
  const x0 = card.x + card.width / 2;
  const y0 = card.y + card.height / 2;
  const swipe = async (dx, dy) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 8; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 8, y: y0 + (dy * i) / 8 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await swipe(-80, 0);
  await expect(currentTitle(page)).toHaveText(all[1]);
  const scroll0 = await page.evaluate(() => window.scrollY);
  await swipe(0, -150);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scroll0);
  await expect(currentTitle(page)).toHaveText(all[1]);
});

test.describe('autoplay (horloge simulée)', () => {
  test('avance après ~4 s à l’écran, retenu hors écran et au survol ; pause → plus rien ; aria-live', async ({ page, isMobile }) => {
    await page.clock.install();
    await page.goto('/');
    const all = await titles(page);
    // Hors écran : rien ne bouge
    await page.clock.runFor(9000);
    await expect(currentTitle(page)).toHaveText(all[0]);
    await show(page);
    await page.clock.runFor(500);
    await expect(page.locator('.cc-status')).toHaveAttribute('aria-live', 'off');
    await page.clock.runFor(4200);
    await expect(currentTitle(page)).toHaveText(all[1]);
    if (!isMobile) {
      const box = await page.locator('.cc-stage').boundingBox();
      await page.mouse.move(box.x + 10, box.y + 10);
      await page.clock.runFor(6000);
      await expect(currentTitle(page)).toHaveText(all[1]);
      await page.mouse.move(0, 0);
    }
    // Bouton pause (cliqué sans focus durable : on le retire ensuite)
    await page.locator('[data-cc-toggle]').click();
    await page.locator('[data-cc-toggle]').blur();
    await expect(page.locator('.cc-status')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('[data-cc-label="play"]')).toBeAttached();
    await page.clock.runFor(10000);
    await expect(currentTitle(page)).toHaveText(all[1]);
  });

  test('mouvement réduit : aucun changement automatique ; transform final appliqué sans interpolation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await page.goto('/');
    await show(page);
    const all = await titles(page);
    await page.clock.runFor(10000);
    await expect(currentTitle(page)).toHaveText(all[0]);
    await expect(page.locator('.cc-status')).toHaveAttribute('aria-live', 'polite');
    await page.locator('.cc-next').click();
    // Aucune frame d'animation nécessaire : la position finale est déjà écrite
    const t = await page.locator('.cc-slide.is-current .cc-card').evaluate(el => el.style.transform);
    expect(t).toContain('rotateY(0deg)');
    expect(t).toContain('translateX(0px)');
  });
});

test('statut lecteur d’écran : position, titre et organisme en fin d’animation', async ({ page }) => {
  await page.goto('/');
  await show(page);
  const all = await titles(page);
  await page.locator('.cc-next').click();
  await expect(page.locator('.cc-status')).toContainText(`2 sur ${all.length}`);
  await expect(page.locator('.cc-status')).toContainText(all[1]);
  await expect(page.locator('.cc-status')).not.toContainText('cert --show');
});

test('bascule EN : libellés du lien, des boutons et aria-roledescription traduits', async ({ page }) => {
  await page.goto('/');
  await page.locator('.lang-btn[data-lang="en"]').click();
  await expect(page.locator('.cc')).toHaveAttribute('aria-roledescription', 'carousel');
  await expect(page.locator('.cc-slide').first()).toHaveAttribute('aria-label', /^1 of \d+$/);
  await expect(page.locator('.cc-next .sr-only')).toHaveText('Next certification');
  await expect(page.locator('.cc-slide.is-current .cc-verify')).toContainText('Verify the certificate');
  await expect(page.locator('.cc-slide.is-current .cc-plate img')).toHaveAttribute('alt', /logo|emblem/);
});

test('aucun décalage de mise en page : hauteur de .cc constante d’une slide à l’autre', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await show(page);
  const heights = new Set();
  const n = await page.locator('.cc-slide').count();
  for (let i = 0; i < n; i += 1) {
    heights.add(Math.round(await page.locator('.cc').evaluate(el => el.getBoundingClientRect().height)));
    await page.locator('.cc-next').click();
  }
  expect(heights.size).toBe(1);
});

for (const width of [320, 680, 1100, 1440]) {
  test(`mise en page à ${width} px : pas de débordement, cibles 44 px et points 24 px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await show(page);
    const r = await section(page).evaluate(sec => {
      const right = Math.max(...[...sec.querySelectorAll('.cc-controls, .cc-controls *, .cc-info, .cc-info *')]
        .map(e => e.getBoundingClientRect().right));
      return { right, overflow: sec.scrollWidth - sec.clientWidth };
    });
    expect(r.overflow).toBeLessThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(width);
    for (const sel of ['.cc-toggle', '.cc-prev', '.cc-next']) {
      const b = await page.locator(sel).boundingBox();
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    const dots = await page.locator('.cc-dot').evaluateAll(els => els.map(e => e.getBoundingClientRect()).map(b => [b.width, b.height]));
    expect(dots.every(([w, h]) => w >= 24 && h >= 24)).toBe(true);
  });
}

test.describe('sans JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('grille : tous les logos, titres, organismes et liens visibles ; aucun contrôle', async ({ page }) => {
    await page.goto('/');
    await section(page).scrollIntoViewIfNeeded();
    const n = await page.locator('.cc-slide').count();
    expect(n).toBeGreaterThan(3);
    await expect(page.locator('.cc-controls')).toBeHidden();
    await expect(page.locator('.cc-btn:visible, .cc-dot:visible')).toHaveCount(0);
    for (let i = 0; i < n; i += 1) {
      const slide = page.locator('.cc-slide').nth(i);
      await expect(slide.locator('.cc-title')).toBeVisible();
      await expect(slide.locator('.cc-org')).toBeVisible();
      await expect(slide.locator('.cc-plate img')).toBeVisible();
      await expect(slide.locator('.cc-verify')).toBeVisible();
    }
  });
});

test('clic souris sur une carte latérale : elle devient la slide courante', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await show(page);
  const all = await titles(page);
  // Point visible de la carte suivante (à droite de la carte courante), vérifié par hit-test
  const point = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.cc-slide .cc-card')];
    const cur = document.querySelector('.cc-slide.is-current .cc-card').getBoundingClientRect();
    const r = cards[1].getBoundingClientRect();
    const x = Math.round((Math.max(r.left, cur.right) + r.right) / 2);
    const y = Math.round(r.top + r.height / 2);
    return { x, y, hit: !!document.elementFromPoint(x, y)?.closest('.cc-card') };
  });
  expect(point.hit).toBe(true);
  await page.mouse.click(point.x, point.y);
  await expect(currentTitle(page)).toHaveText(all[1]);
});

test('Maj+Tab depuis les contrôles vers « Vérifier » à 320x256 (zoom 400 %) : lien non masqué par la nav fixe', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await show(page);
  await page.locator('.cc-toggle').focus();
  // Contrôles juste sous la nav : le lien, au-dessus, est hors écran avant Maj+Tab
  await page.evaluate(() => {
    const navBottom = document.querySelector('nav').getBoundingClientRect().bottom;
    window.scrollBy(0, document.querySelector('.cc-toggle').getBoundingClientRect().top - navBottom - 4);
  });
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.cc-slide.is-current .cc-verify')).toBeFocused();
  const { top, navBottom } = await page.evaluate(() => ({
    top: document.activeElement.getBoundingClientRect().top,
    navBottom: document.querySelector('nav').getBoundingClientRect().bottom
  }));
  expect(top).toBeGreaterThanOrEqual(navBottom);
});

test('changement de langue : la région live ne garde pas l’ancienne langue', async ({ page }) => {
  await page.goto('/');
  await show(page);
  await page.locator('.cc-next').click();
  await expect(page.locator('.cc-status')).toContainText(' sur ');
  await page.locator('.lang-btn[data-lang="en"]').click();
  await expect(page.locator('.cc-status')).not.toContainText(' sur ');
});
