/* ================================================
   CHARGEMENT DU CONTENU (Node uniquement)
   ================================================ */

import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_FILES, validateContent, formatIssues } from './schema.js';

/** Dossier content/ du dépôt */
// (fileURLToPath sur une chaîne : fonctionne aussi quand `URL` est remplacé, ex. jsdom)
export const CONTENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');

/**
 * Lit les fichiers JSON de content/ (sans validation).
 * @param {string} [dir]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readContent(dir = CONTENT_DIR) {
  const entries = await Promise.all(
    CONTENT_FILES.map(async name => {
      const file = path.join(dir, `${name}.json`);
      const raw = await readFile(file, 'utf8');
      try {
        return [name, JSON.parse(raw)];
      } catch (err) {
        throw new Error(`content/${name}.json : JSON invalide — ${err.message}`, { cause: err });
      }
    })
  );
  return Object.fromEntries(entries);
}

/** Variante synchrone de readContent (utile dans les tests). */
export function readContentSync(dir = CONTENT_DIR) {
  return Object.fromEntries(
    CONTENT_FILES.map(name => [name, JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8'))])
  );
}

/**
 * Lit ET valide le contenu ; lève une erreur détaillée si invalide.
 * @param {string} [dir]
 */
export async function loadContent(dir = CONTENT_DIR) {
  const raw = await readContent(dir);
  const res = validateContent(raw);
  if (!res.success) {
    throw new Error(`Contenu invalide :\n${formatIssues(res.errors)}`);
  }
  return res.data;
}

/** Liste les fichiers JSON présents dans content/ qui ne sont pas attendus. */
export async function findUnknownFiles(dir = CONTENT_DIR) {
  const files = await readdir(dir);
  return files.filter(f => f.endsWith('.json') && !CONTENT_FILES.includes(f.slice(0, -5)));
}
