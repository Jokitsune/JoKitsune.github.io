import { defineConfig } from 'vite';
import { portfolioContent } from './src/vite/portfolio-content-plugin.js';
import { adminDevApi, vercelHeadersPreview } from './src/vite/admin-plugin.js';

// Le miroir GitHub Pages ne contient PAS le panneau /admin (BUILD_TARGET=pages
// dans .github/workflows/deploy-pages.yml) : seul Vercel le sert.
const withAdmin = process.env.BUILD_TARGET !== 'pages';

// Configuration Vite — site statique servi à la racine du domaine (jokitsune.github.io)
export default defineConfig({
  base: '/',
  plugins: [portfolioContent(), adminDevApi(), vercelHeadersPreview()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Aucun script inline (CSP stricte + Trusted Types sur /admin)
    modulePreload: { polyfill: false },
    // Polices jamais inlinées en data: (font-src 'self' sur /admin)
    assetsInlineLimit: file => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    rollupOptions: {
      input: {
        // « index » : mêmes noms de fichiers que le build mono-page d'origine
        index: 'index.html',
        ...(withAdmin ? { admin: 'admin/index.html' } : {})
      }
    }
  },
  // Vitest (tests unitaires ; les tests e2e Playwright sont dans tests/e2e)
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    // Génération de clés RSA, sous-processus et jsdom : marge pour la CI
    testTimeout: 20000
  }
});
