#!/usr/bin/env node
/* ================================================
   npm run dev:admin — serveur Vite + API admin sur backend fichier local
   (ADMIN_DEV_MODE=1, aucun appel GitHub, données dans .admin-dev/).
   Multi-plateforme (pas de syntaxe VAR=x propre au shell).
   Refuse de démarrer si VERCEL_ENV vaut « production » ou « preview ».
   ================================================ */

import { rmSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { assertDevModeAllowed } from '../api/_lib/config.js';

process.env.ADMIN_DEV_MODE = '1';
assertDevModeAllowed(process.env);

// --reset : repart d'un bac à sable vide (tests e2e)
if (process.argv.includes('--reset')) {
  const dir = path.resolve(process.env.ADMIN_DEV_DATA_DIR || '.admin-dev');
  if (!/[\\/]\.admin-dev[^\\/]*$/.test(dir)) throw new Error(`--reset refusé hors d'un dossier .admin-dev* : ${dir}`);
  rmSync(dir, { recursive: true, force: true });
}

const port = Number(process.env.PORT) || 5173;
process.env.ADMIN_ORIGIN ??= `http://localhost:${port}`;

const server = await createServer({ server: { port, strictPort: true, host: 'localhost' } });
await server.listen();
server.printUrls();
console.log(`\n  Admin : ${process.env.ADMIN_ORIGIN}/admin/  (connexion fictive « dev-admin », sans GitHub)\n`);
