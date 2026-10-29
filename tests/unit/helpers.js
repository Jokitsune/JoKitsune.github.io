/* Utilitaires partagés par les tests unitaires */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContentSync } from '../../src/lib/content.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Contenu réel du dépôt (copie profonde, modifiable par le test). */
export function loadRealContent() {
  return structuredClone(readContentSync());
}

/** Gabarit index.html du dépôt. */
export function loadTemplate() {
  return readFileSync(path.join(ROOT, 'index.html'), 'utf8');
}

/** Lit un fichier du dépôt. */
export function readRepoFile(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

export const XSS = '<img src=x onerror=alert(1)>';
