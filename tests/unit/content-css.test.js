// E1 — page publique sans style inline : les valeurs du contenu passent par
// des attributs data-* et une feuille générée (CSP appliquée sans 'unsafe-inline').
import { describe, it, expect } from 'vitest';
import { renderPage } from '../../src/render/index.js';
import { renderContentCss } from '../../src/render/content-css.js';
import { loadRealContent, loadTemplate } from './helpers.js';

describe('Feuille dérivée du contenu', () => {
  const content = loadRealContent();
  const html = renderPage(loadTemplate(), content);

  it('le HTML pré-rendu ne contient aucun attribut style ni script tiers', () => {
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
  });

  it('chaque délai de boot rendu a sa règle CSS', () => {
    const css = renderContentCss(content);
    for (const [, d] of html.matchAll(/data-boot-delay="([^"]+)"/g)) {
      expect(css).toContain(`.boot-line[data-boot-delay="${d}"] { animation-delay: ${d}s; }`);
    }
    // Plus aucune barre de progression (section Certifications en logos)
    expect(html).not.toContain('data-fill');
    expect(css).not.toContain('--fill');
  });

  it('valeurs re-normalisées (aucune injection CSS possible)', () => {
    const c = loadRealContent();
    c.ui.boot.lines[0].delay = '1s;} body{display:none';
    const css = renderContentCss(c);
    expect(css).not.toContain('display:none');
  });
});
