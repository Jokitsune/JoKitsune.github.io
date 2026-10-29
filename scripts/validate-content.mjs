#!/usr/bin/env node
/* ================================================
   npm run validate:content
   Valide content/*.json avec le schéma zod (src/lib/schema.js).
   Option --dir <chemin> : dossier à valider (défaut : content/).
   Option --write-schemas : régénère content/schema/*.schema.json
   (JSON Schema dérivé, pour l'autocomplétion de l'éditeur et l'admin).
   ================================================ */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_DIR, readContent, findUnknownFiles } from '../src/lib/content.js';
import { validateFile, formatIssues, toJSONSchemas, CONTENT_FILES } from '../src/lib/schema.js';
import { validateForWrite } from '../src/lib/content-guard.js';

// --dir <chemin> : valide un autre dossier de contenu (tests)
const dirArg = process.argv.indexOf('--dir');
const contentDir = dirArg > -1 ? path.resolve(process.argv[dirArg + 1]) : CONTENT_DIR;
const SCHEMA_DIR = path.join(contentDir, 'schema');
const writeSchemas = process.argv.includes('--write-schemas');

let failed = false;

// 1. JSON Schema dérivés : à jour ?
const schemas = toJSONSchemas();
if (writeSchemas) await mkdir(SCHEMA_DIR, { recursive: true });
for (const [name, schema] of Object.entries(schemas)) {
  const file = path.join(SCHEMA_DIR, `${name}.schema.json`);
  const expected = JSON.stringify(schema, null, 2) + '\n';
  if (writeSchemas) {
    await writeFile(file, expected);
    console.log(`✎ content/schema/${name}.schema.json`);
    continue;
  }
  const current = await readFile(file, 'utf8').catch(() => null);
  if (current?.replace(/\r\n/g, '\n') !== expected) {
    failed = true;
    console.error(`✗ content/schema/${name}.schema.json est obsolète — lancer « npm run validate:content -- --write-schemas »`);
  }
}

// 2. Validation de chaque fichier de contenu
let raw;
try {
  raw = await readContent(contentDir);
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
for (const name of CONTENT_FILES) {
  const res = validateFile(name, raw[name]);
  // Mêmes garde-fous que l'API /admin (bidi, contrôles, profondeur, order…)
  const guard = validateForWrite(name, raw[name]);
  if (res.success && guard.ok) {
    console.log(`✓ content/${name}.json`);
  } else {
    failed = true;
    const details = res.success ? guard.issues.map(i => `  - content/${name}.json › ${i.path || '(racine)'} : ${i.code}`).join('\n') : formatIssues(res.errors);
    console.error(`✗ content/${name}.json\n${details}`);
  }
}

const unknown = await findUnknownFiles(contentDir);
if (unknown.length) {
  console.warn(`⚠ Fichiers ignorés dans content/ : ${unknown.join(', ')}`);
}

if (failed) process.exit(1);
console.log('Contenu valide.');
