import { defineConfig } from 'vite';

// Configuration Vite — site statique servi à la racine du domaine (jokitsune.github.io)
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
