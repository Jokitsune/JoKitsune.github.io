/* ================================================
   SÉRIALISATION CANONIQUE DES FICHIERS DE CONTENU
   Déterministe (même entrée ⇒ mêmes octets) et compacte, proche de la mise
   en forme manuelle des fichiers existants : les petits objets et tableaux
   tiennent sur une ligne, les éléments de liste structurés sont dépliés.
   L'ordre des clés est celui produit par le schéma (sortie de zod).
   ================================================ */

export const LINE_WIDTH = 120;

function inline(value) {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }`;
  }
  return JSON.stringify(value);
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// Objet « feuille » : ses valeurs sont des primitives ou des objets de primitives ({ fr, en })
const isLeafObject = o => Object.values(o).every(v => !v || typeof v !== 'object' || (isObject(v) && Object.values(v).every(x => x === null || typeof x !== 'object')));
// Élément de liste structuré (avec id et au moins une valeur composée)
const isStructuredItem = o => isObject(o) && 'id' in o && Object.values(o).some(v => v && typeof v === 'object');

function canInline(value) {
  if (Array.isArray(value)) return value.every(v => !v || typeof v !== 'object' || (isObject(v) && isLeafObject(v) && !isStructuredItem(v)));
  return !Object.values(value).some(v => Array.isArray(v) && v.some(x => x && typeof x === 'object'));
}

function format(value, indent, prefixLength) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const one = inline(value);
  if (canInline(value) && indent.length + prefixLength + one.length <= LINE_WIDTH) return one;
  const next = `${indent}  `;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map(v => next + format(v, next, 0)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return '{}';
  return `{\n${entries.map(([k, v]) => {
    const prefix = `${JSON.stringify(k)}: `;
    return next + prefix + format(v, next, prefix.length);
  }).join(',\n')}\n${indent}}`;
}

/**
 * Sérialise un contenu validé (fin de ligne LF, saut de ligne final).
 * @param {unknown} data
 * @returns {string}
 */
export function formatContentJson(data) {
  return `${format(data, '', 0)}\n`;
}
