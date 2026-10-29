/* ================================================
   UPLOAD — contrôles purs : types autorisés, magic bytes, PDF actif,
   EXIF, nom de fichier généré par le serveur.
   SVG, GIF, HTML et tout autre type : refusés.
   ================================================ */

import { createHash } from 'node:crypto';
import { inflateSync, constants as zlibConstants } from 'node:zlib';

export const MIN_SIZE = 100;
export const LIMITS = { cv: 3 * 1024 * 1024, image: 1.5 * 1024 * 1024 };

/** Types acceptés par nature d'upload → extension. */
export const ALLOWED_TYPES = {
  cv: { 'application/pdf': 'pdf' },
  image: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
};

const startsWith = (bytes, sig, offset = 0) =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

const ascii = s => [...s].map(c => c.charCodeAt(0));

/**
 * Type réel détecté d'après les octets (ou null).
 * @param {Uint8Array} bytes
 */
export function detectType(bytes) {
  if (startsWith(bytes, ascii('%PDF-'))) return 'application/pdf';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

function latin1(bytes, start = 0, end = bytes.length) {
  return Buffer.from(bytes.buffer, bytes.byteOffset + start, Math.max(0, end - start)).toString('latin1');
}

/** %%EOF présent dans les 1 024 derniers octets. */
export function hasPdfEof(bytes) {
  return latin1(bytes, Math.max(0, bytes.length - 1024)).includes('%%EOF');
}

// Noms PDF « actifs » (heuristique : un filet, la vraie défense est CSP sandbox + nosniff,
// qui n'existe QUE sur Vercel : GitHub Pages ne permet pas d'en-têtes personnalisés)
const ACTIVE_PDF_RE = /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|XFA|RichMedia)(?![A-Za-z0-9])/;
// Structures qui cachent des dictionnaires à l'inspection textuelle
const OPAQUE_PDF_RE = /\/(ObjStm|Encrypt)(?![A-Za-z0-9])/;
// Filtres d'image : données binaires sans objets PDF, inutiles à décoder
const IMAGE_FILTERS = new Set(['DCTDecode', 'JPXDecode', 'CCITTFaxDecode', 'JBIG2Decode']);
const MAX_INFLATED = 64 * 1024 * 1024;

/**
 * Décode les échappements « #xx » des noms PDF (/Java#53cript == /JavaScript).
 * Appliqué à tout le texte : utilisé seulement pour la détection.
 */
export function normalizePdfNames(text) {
  return text.replace(/#([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function hasActivePdfContent(bytes) {
  return ACTIVE_PDF_RE.test(normalizePdfNames(latin1(bytes)));
}

/** Dictionnaire << … >> qui précède immédiatement un mot-clé « stream ». */
function streamDictionary(text, streamIndex) {
  const end = text.lastIndexOf('>>', streamIndex);
  if (end === -1) return null;
  let depth = 0;
  for (let i = end + 1; i >= 1; i--) {
    if (text[i] === '>' && text[i - 1] === '>') { depth++; i--; continue; }
    if (text[i] === '<' && text[i - 1] === '<') {
      depth--;
      i--;
      if (depth === 0) return text.slice(i, end + 2);
    }
  }
  return null;
}

/**
 * Tous les flux doivent être inspectables : sans filtre, FlateDecode décodable,
 * ou filtre d'image. Pas d'objets compressés (/ObjStm) ni de chiffrement (/Encrypt).
 * @returns {string | null} raison du refus, ou null
 */
export function pdfInspectionProblem(bytes) {
  const raw = latin1(bytes);
  const names = normalizePdfNames(raw);
  if (OPAQUE_PDF_RE.test(names)) return 'pdf_uninspectable';
  const streamRe = /stream\r?\n/g;
  let m;
  let inflated = 0;
  while ((m = streamRe.exec(raw))) {
    if (raw.slice(m.index - 3, m.index) === 'end') continue; // « endstream »
    const dict = streamDictionary(raw, m.index);
    if (dict === null) return 'pdf_uninspectable';
    const filterMatch = normalizePdfNames(dict).match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/);
    const filters = filterMatch ? [...filterMatch[1].matchAll(/\/([A-Za-z0-9]+)/g)].map(x => x[1]) : [];
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end === -1) return 'pdf_uninspectable';
    streamRe.lastIndex = end + 9;
    for (const filter of filters) {
      if (IMAGE_FILTERS.has(filter)) break; // la suite est une image
      if (filter !== 'FlateDecode') return 'pdf_uninspectable';
    }
    if (filters[0] === 'FlateDecode') {
      const data = bytes.subarray(start, end);
      try {
        inflated += inflateSync(data, { finishFlush: zlibConstants.Z_SYNC_FLUSH, maxOutputLength: MAX_INFLATED }).length;
      } catch {
        return 'pdf_uninspectable';
      }
      if (inflated > MAX_INFLATED) return 'pdf_uninspectable';
    }
  }
  return null;
}

/** Présence d'un segment APP1 « Exif » dans un JPEG. */
export function hasExif(bytes) {
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // début des données / fin
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xe1 && latin1(bytes, i + 4, i + 10) === 'Exif\0\0') return true;
    i += 2 + len;
  }
  return false;
}

/** Slug : NFKD, diacritiques retirés, [^a-z0-9]+ → « - », 40 car. max, défaut « img ». */
export function slugify(label) {
  const s = String(label ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s || 'img';
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Chemins générés : ne dépendent jamais du nom fourni par le client tel quel. */
export function cvPath(lang) {
  return `public/files/cv-${lang}.pdf`;
}

export function imagePath(label, bytes, detected) {
  return `public/images/uploads/${slugify(label)}-${sha256Hex(bytes).slice(0, 12)}.${ALLOWED_TYPES.image[detected]}`;
}

/** URL publique correspondant à un chemin sous public/. */
export function publicUrl(repoPath) {
  return repoPath.replace(/^public/, '');
}

export const PUBLIC_PATH_RE = /^\/(files|images\/uploads)\/[a-z0-9-]+\.(pdf|png|jpg|webp)$/;

/**
 * Vérifie le contenu d'un upload déjà lu.
 * @param {'cv' | 'image'} kind
 * @param {string} declaredType type MIME déclaré (Content-Type)
 * @param {Uint8Array} bytes
 * @returns {{ ok: true, detected: string, warnings: string[] } | { ok: false, status: number, code: string, reason: string }}
 */
export function inspectUpload(kind, declaredType, bytes) {
  if (bytes.length < MIN_SIZE) return { ok: false, status: 422, code: 'UPLOAD_INVALID', reason: 'too_small' };
  if (bytes.length > LIMITS[kind]) return { ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE', reason: 'too_large' };
  const detected = detectType(bytes);
  if (!detected || detected !== declaredType || !ALLOWED_TYPES[kind][detected]) {
    return { ok: false, status: 422, code: 'UPLOAD_INVALID', reason: 'magic_mismatch' };
  }
  const warnings = [];
  if (detected === 'application/pdf') {
    if (!hasPdfEof(bytes)) return { ok: false, status: 422, code: 'UPLOAD_INVALID', reason: 'magic_mismatch' };
    if (hasActivePdfContent(bytes)) return { ok: false, status: 422, code: 'UPLOAD_INVALID', reason: 'pdf_active_content' };
    const problem = pdfInspectionProblem(bytes);
    if (problem) return { ok: false, status: 422, code: 'UPLOAD_INVALID', reason: problem };
  }
  if (detected === 'image/jpeg' && hasExif(bytes)) warnings.push('exif_present');
  return { ok: true, detected, warnings };
}
