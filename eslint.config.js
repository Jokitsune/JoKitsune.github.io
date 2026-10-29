import js from '@eslint/js';
import globals from 'globals';

// Configuration ESLint « flat config »
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'test-results/**', 'playwright-report/**']
  },
  js.configs.recommended,
  {
    // Code exécuté dans le navigateur
    files: ['src/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        formspree: 'readonly'
      }
    }
  },
  {
    // Code Node (build, scripts, rendu pur, tests)
    files: ['*.config.js', 'scripts/**/*.{js,mjs}', 'src/lib/**/*.js', 'src/render/**/*.js', 'src/vite/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  }
];
