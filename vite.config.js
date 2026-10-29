import { defineConfig } from 'vite';
import { portfolioContent } from './src/vite/portfolio-content-plugin.js';

// Configuration Vite — site statique servi à la racine du domaine (jokitsune.github.io)
export default defineConfig({
  base: '/',
  plugins: [portfolioContent()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
