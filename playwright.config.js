import { defineConfig, devices } from '@playwright/test';

// Tests e2e de non-régression comportementale (npm run test:e2e).
// Par défaut : build + `vite preview`. Pour cibler un autre site (ex. l'ancienne
// version), définir E2E_BASE_URL=http://hôte:port/ (aucun serveur n'est alors lancé).
const externalUrl = process.env.E2E_BASE_URL;
// E2E_PORT : port du serveur de preview (défaut 4173), utile si le port est déjà pris
const PORT = Number(process.env.E2E_PORT) || 4173;
// E2E_DEV_PORT : serveur de développement de l'admin sur backend fichier (ADMIN_DEV_MODE=1)
const DEV_PORT = Number(process.env.E2E_DEV_PORT) || 5199;
const DEV_URL = `http://localhost:${DEV_PORT}`;

// Le parcours sur le vrai backend de dev ne s'exécute pas contre un site externe
const ADMIN_DEV_SPEC = /admin-dev\.spec\.js$/;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: externalUrl || `http://127.0.0.1:${PORT}/`
  },
  projects: [
    { name: 'desktop', testIgnore: ADMIN_DEV_SPEC, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', testIgnore: ADMIN_DEV_SPEC, use: { ...devices['Pixel 7'] } },
    ...(externalUrl ? [] : [{ name: 'admin-dev', testMatch: ADMIN_DEV_SPEC, use: { ...devices['Desktop Chrome'], baseURL: `${DEV_URL}/` } }])
  ],
  webServer: externalUrl ? undefined : [
    {
      command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      // Bac à sable dédié, vidé à chaque démarrage ; jamais réutilisé (état déterministe)
      command: 'node scripts/dev-admin.mjs --reset',
      env: { PORT: String(DEV_PORT), ADMIN_DEV_DATA_DIR: '.admin-dev-e2e' },
      url: `${DEV_URL}/admin/`,
      reuseExistingServer: false,
      timeout: 120_000
    }
  ]
});
