import { test, expect } from '@playwright/test';

// Frise « Parcours » (#formation) : rail lié au défilement, états des points,
// apparition des entrées, mouvement réduit, langue et mise en page.

const skipBoot = page => page.addInitScript(() => sessionStorage.setItem('portfolio_boot_seen', 'true'));
const setLang = (page, lang) => page.addInitScript(l => localStorage.setItem('portfolio_lang', l), lang);

test.beforeEach(async ({ context, page }) => {
  await context.route(/cdn\.pixabay\.com/, r => r.abort());
  await skipBoot(page);
  await setLang(page, 'fr');
});

/** Géométrie hors transformations : positions dans le document. */
function geometry(page) {
  return page.evaluate(() => {
    const tl = document.querySelector('[data-timeline]');
    const tlTop = tl.getBoundingClientRect().top + window.scrollY;
    const items = [...tl.querySelectorAll('.tl-item')];
    return {
      tlTop,
      tlHeight: tl.offsetHeight,
      vh: window.innerHeight,
      centers: items.map(li => {
        const n = li.querySelector('.tl-node');
        return tlTop + li.offsetTop + n.offsetTop + n.offsetHeight / 2;
      })
    };
  });
}

const scrollTo = (page, y) => page.evaluate(v => window.scrollTo(0, v), y);
const fillHeight = page => page.locator('.tl-rail-fill').evaluate(el => el.getBoundingClientRect().height);
const items = page => page.locator('.tl-item');

test('E1 : au chargement, animation active et rien d’atteint', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tl')).toHaveClass(/is-enhanced/);
  await expect(page.locator('.tl-item.is-reached')).toHaveCount(0);
  expect(await fillHeight(page)).toBeLessThanOrEqual(2);
});

test('E2 : un point s’allume quand la ligne de lecture atteint son centre (une seule entrée active)', async ({ page }) => {
  await page.goto('/');
  const g = await geometry(page);
  const y = g.centers[2] - g.vh / 2 - 10;
  await scrollTo(page, y);
  await expect(page.locator('.tl-item.is-reached')).toHaveCount(2);
  await expect(items(page).nth(2)).not.toHaveClass(/is-reached/);
  await scrollTo(page, y + 20);
  await expect(items(page).nth(2)).toHaveClass(/is-reached/);
  await expect(items(page).nth(2)).toHaveClass(/is-active/);
  await expect(page.locator('.tl-item.is-active')).toHaveCount(1);
});

test('E3 : le remplissage suit la ligne de lecture (±4 px)', async ({ page }) => {
  await page.goto('/');
  const g = await geometry(page);
  for (const f of [0.25, 0.5, 0.75]) {
    await scrollTo(page, g.tlTop + g.tlHeight * f - g.vh / 2);
    await expect.poll(async () => {
      const top = await page.locator('.tl').evaluate(el => el.getBoundingClientRect().top);
      const expected = Math.min(g.tlHeight, Math.max(0, g.vh / 2 - top));
      return Math.abs((await fillHeight(page)) - expected);
    }).toBeLessThanOrEqual(4);
  }
});

test('E4 : fin de liste tout atteint, puis réversible en remontant', async ({ page }) => {
  await page.goto('/');
  const g = await geometry(page);
  const count = await items(page).count();
  await scrollTo(page, g.tlTop + g.tlHeight - g.vh / 2 + 40);
  await expect(page.locator('.tl-item.is-reached')).toHaveCount(count);
  await expect(items(page).last()).toHaveClass(/is-active/);
  await expect.poll(async () => Math.abs((await fillHeight(page)) - g.tlHeight)).toBeLessThanOrEqual(2);
  await scrollTo(page, g.centers[1] - g.vh / 2 + 5);
  await expect(page.locator('.tl-item.is-reached')).toHaveCount(2);
  await expect(items(page).nth(1)).toHaveClass(/is-active/);
});

test('E5 : apparition — visible à l’écran, masquée plus bas, jamais bloquée au-dessus', async ({ page }) => {
  await page.goto('/');
  const opacity = i => items(page).nth(i).evaluate(el => Number(getComputedStyle(el).opacity));
  expect(await opacity(4)).toBe(0);
  await items(page).nth(0).scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  expect(await opacity(0)).toBe(1);
  // Saut direct vers #contact puis remontée : aucune entrée masquée au-dessus du viewport
  await page.goto('/');
  await page.locator('#contact').evaluate(el => el.scrollIntoView());
  await expect(page.locator('.tl-item.is-visible')).toHaveCount(await items(page).count());
});

test.describe('B2 : zoom 400 % (320×256)', () => {
  test.use({ viewport: { width: 320, height: 256 } });

  test('chaque entrée devient visible, même plus haute que le viewport', async ({ page }) => {
    await page.goto('/');
    const count = await items(page).count();
    for (let i = 0; i < count; i += 1) {
      await items(page).nth(i).evaluate(el => el.scrollIntoView({ block: 'start' }));
      await expect(items(page).nth(i)).toHaveClass(/is-visible/);
      await expect.poll(() => items(page).nth(i).evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
    }
    // Aucun débordement horizontal de la frise (d'autres sections sont hors périmètre de ce test)
    const right = await page.locator('.tl, .tl-body').evaluateAll(els => Math.max(...els.map(e => e.getBoundingClientRect().right)));
    expect(right).toBeLessThanOrEqual(320);
  });
});

test('E6 : mouvement réduit — tout visible, rail plein, aucune animation ; bascule à chaud', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const tl = page.locator('.tl');
  await expect(tl).not.toHaveClass(/is-enhanced/);
  const count = await items(page).count();
  for (let i = 0; i < count; i += 1) {
    expect(await items(page).nth(i).evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  }
  const railHeight = await page.locator('.tl-rail').evaluate(el => el.getBoundingClientRect().height);
  expect(Math.abs((await fillHeight(page)) - railHeight)).toBeLessThanOrEqual(1);
  await page.locator('#formation').scrollIntoViewIfNeeded();
  const running = await tl.evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length);
  expect(running).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(tl).toHaveClass(/is-enhanced/);
});

test('E8 : bascule EN des catégories et de « en cours », états toujours cohérents', async ({ page }) => {
  await page.goto('/');
  await page.locator('.lang-btn[data-lang="en"]').click();
  await expect(page.locator('.tl-kind')).toHaveText(['Experience', 'Experience', 'Volunteering', 'Education', 'Education']);
  await expect(page.locator('.tl-ongoing').first()).toHaveText('present');
  await expect(page.locator('.tl-when .sr-only').first()).toHaveText('August 2026 to present');
  await page.locator('.lang-btn[data-lang="fr"]').click();
  await expect(page.locator('.tl-kind').first()).toHaveText('Expérience');
  const g = await geometry(page);
  await scrollTo(page, g.centers[1] - g.vh / 2 + 5);
  await expect(page.locator('.tl-item.is-reached')).toHaveCount(2);
});

test('E10 : mise en page (colonnes desktop, période au-dessus sur mobile, sans débordement)', async ({ page, isMobile }) => {
  await page.goto('/');
  const first = items(page).first();
  await first.scrollIntoViewIfNeeded();
  const box = sel => first.locator(sel).first().boundingBox();
  const when = await box('.tl-when-text');
  const node = await box('.tl-node');
  const body = await box('.tl-body');
  const h3 = await box('h3');
  if (isMobile) {
    expect(when.y).toBeLessThan(h3.y);
    expect(when.x).toBeGreaterThan(node.x);
  } else {
    expect(when.x).toBeLessThan(node.x);
    expect(node.x).toBeLessThan(body.x);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('1.4.12 : espacement du texte augmenté — la période ne déborde pas sur le rail', async ({ page, isMobile }) => {
  // Feuille de même origine (compatible avec style-src 'self')
  await page.route('**/__text-spacing.css', r => r.fulfill({
    contentType: 'text/css',
    body: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }'
  }));
  await page.goto('/');
  await page.evaluate(() => new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/__text-spacing.css';
    link.onload = resolve;
    document.head.append(link);
  }));
  const overflow = await page.locator('.tl-item').evaluateAll(lis => lis.map(li => {
    const when = li.querySelector('.tl-when-text').getBoundingClientRect();
    const node = li.querySelector('.tl-node').getBoundingClientRect();
    const body = li.querySelector('.tl-body').getBoundingClientRect();
    return { whenRight: when.right, nodeLeft: node.left, whenBottom: when.bottom, bodyBottom: body.bottom };
  }));
  for (const o of overflow) {
    if (!isMobile) expect(o.whenRight).toBeLessThanOrEqual(o.nodeLeft + 1);
    expect(o.whenBottom).toBeLessThanOrEqual(o.bodyBottom + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
