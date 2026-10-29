import js from '@eslint/js';
import globals from 'globals';

// Sinks HTML interdits (contenu éditable depuis /admin ⇒ risque de XSS stocké)
const NO_HTML_SINKS = {
  'no-restricted-properties': [
    'error',
    { property: 'innerHTML', message: 'innerHTML interdit : utiliser textContent / createElement.' },
    { property: 'outerHTML', message: 'outerHTML interdit.' },
    { property: 'insertAdjacentHTML', message: 'insertAdjacentHTML interdit.' },
    { object: 'document', property: 'write', message: 'document.write interdit.' },
    { object: 'document', property: 'writeln', message: 'document.writeln interdit.' }
  ]
};

// Configuration ESLint « flat config »
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'test-results/**', 'playwright-report/**', '.claude/**', '.admin-dev/**', '.vercel/**']
  },
  js.configs.recommended,
  {
    // Code exécuté dans le navigateur (site public et panneau /admin)
    files: ['src/js/**/*.js', 'src/admin/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    }
  },
  {
    // Code Node (build, scripts, rendu pur, API serverless, tests)
    files: ['*.config.js', 'scripts/**/*.{js,mjs}', 'src/lib/**/*.js', 'src/render/**/*.js', 'src/vite/**/*.js', 'api/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  },
  {
    // Code applicatif : aucun sink HTML (T-PUB-01)
    files: ['src/**/*.js', 'api/**/*.js', 'admin/**/*.js'],
    rules: NO_HTML_SINKS
  },
  {
    // Tests jsdom/Playwright et script de comparaison : code évalué aussi dans une page
    files: ['tests/**/*.js', 'scripts/compare-sites.mjs'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  }
];
