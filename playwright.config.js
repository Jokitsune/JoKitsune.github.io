import { defineConfig, devices } from '@playwright/test';

// Tests e2e de non-régression comportementale (npm run test:e2e).
// Par défaut : build + `vite preview`. Pour cibler un autre site (ex. l'ancienne
// version), définir E2E_BASE_URL=http://hôte:port/ (aucun serveur n'est alors lancé).
const externalUrl = process.env.E2E_BASE_URL;
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: externalUrl || `http://127.0.0.1:${PORT}/`
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  webServer: externalUrl ? undefined : {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
