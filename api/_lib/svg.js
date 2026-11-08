/* ================================================
   SVG — validation stricte par liste blanche (rejet, jamais de réécriture).
   Le fichier stocké est exactement celui qui a été validé.
   Sur GitHub Pages (aucun en-tête personnalisé), cette validation est la
   SEULE défense contre un SVG piégé ouvert directement : elle reste stricte.
   Refusés notamment : script, foreignObject, image, a, animate/set, style
   (élément ET attribut), on*, href non local, DOCTYPE/ENTITY/CDATA,
   instructions de traitement, encodage autre que UTF-8.
   ================================================ */

import saxes from 'saxes';

const { SaxesParser } = saxes;

export const SVG_LIMIT = 256 * 1024;

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';

const MAX_DEPTH = 32;
const MAX_ELEMENTS = 2000;
const MAX_ATTRIBUTES = 50;
const MAX_VALUE = 64 * 1024;

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse',
  'line', 'polyline', 'polygon', 'text', 'tspan',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern',
  'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feComposite', 'feFlood',
  'feMerge', 'feMergeNode', 'feMorphology', 'feDropShadow'
]);

/** Attributs sans espace de noms. `style` est volontairement absent (CSP du fichier, @import…). */
const ATTRIBUTES = new Set([
  'id', 'class', 'viewBox', 'preserveAspectRatio', 'version', 'width', 'height', 'x', 'y',
  'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'd', 'points', 'transform',
  'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity',
  'patternUnits', 'patternContentUnits', 'patternTransform',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity',
  'clip-path', 'clip-rule', 'clipPathUnits', 'mask', 'maskUnits', 'maskContentUnits',
  'filter', 'filterUnits', 'primitiveUnits', 'in', 'in2', 'result', 'stdDeviation', 'dx', 'dy',
  'mode', 'operator', 'k1', 'k2', 'k3', 'k4', 'values', 'type', 'flood-color', 'flood-opacity', 'radius',
  'color', 'display', 'visibility', 'overflow', 'font-family', 'font-size', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'letter-spacing'
]);

/** Éléments qui peuvent porter href / xlink:href (référence locale uniquement). */
const HREF_ELEMENTS = new Set(['use', 'linearGradient', 'radialGradient', 'pattern']);
const TEXT_ELEMENTS = new Set(['title', 'desc', 'text', 'tspan']);

const LOCAL_REF_RE = /^#([A-Za-z_][\w.-]{0,63})$/;
// url(#id) éventuellement suivi d'une couleur de repli courte (blancs bornés : pas de valeur géante)
const LOCAL_URL_RE = /^url\(\s{0,8}#[A-Za-z_][\w.-]{0,63}\s{0,8}\)(\s{1,8}[#\w(),.%-][#\w(),.%\s-]{0,63})?$/;
const FORBIDDEN_VALUE_RE = /javascript:|vbscript:|data:|@|\\|expression\s*\(/i;
const DTD_OR_CDATA_RE = /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i;
// Références d'entité ou de caractère dans un href brut : interdites (pas d'écart parseur/navigateur)
const RAW_HREF_ENTITY_RE = /href\s*=\s*(?:"[^"]*&|'[^']*&)/i;

class SvgReject extends Error {
  constructor(reason, name) {
    super(reason);
    this.reason = reason;
    this.name_ = name;
  }
}

const clean = name => String(name ?? '').replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 64);
const fail = (reason, name) => { throw new SvgReject(reason, name); };

function checkViewBox(value) {
  const parts = String(value ?? '').trim().split(/[\s,]+/);
  if (parts.length !== 4) return false;
  const nums = parts.map(Number);
  return nums.every(Number.isFinite) && nums[2] > 0 && nums[3] > 0;
}

function checkValue(attrName, value) {
  if (value.length > MAX_VALUE) fail('svg_too_complex', attrName);
  if (FORBIDDEN_VALUE_RE.test(value)) fail('svg_disallowed_value', attrName);
  if (/url\(/i.test(value) && !LOCAL_URL_RE.test(value.trim())) fail('svg_disallowed_value', attrName);
}

function checkAttributes(node, state) {
  const attrs = Object.values(node.attributes);
  if (attrs.length > MAX_ATTRIBUTES) fail('svg_too_complex', node.local);
  for (const attr of attrs) {
    const { local, prefix, uri, value, name } = attr;
    if (/^on/i.test(local) || /^on/i.test(name)) fail('svg_event_handler', name);
    if (uri === XMLNS_NS) {
      // Déclarations d'espaces de noms : seulement SVG (défaut) et xlink
      if (name === 'xmlns' && value === SVG_NS) continue;
      if (name === 'xmlns:xlink' && value === XLINK_NS) continue;
      fail('svg_disallowed_attribute', name);
    }
    // 1. Nom autorisé ? (avant toute analyse de la valeur)
    const isHref = local === 'href' && (uri === XLINK_NS || (uri === '' && !prefix));
    if (uri === XML_NS) {
      if (local !== 'space' && local !== 'lang') fail('svg_disallowed_attribute', name); // xml:base, etc.
    } else if (isHref) {
      if (!HREF_ELEMENTS.has(node.local)) fail('svg_disallowed_attribute', name);
    } else if (uri !== '' || prefix || !ATTRIBUTES.has(local)) {
      fail('svg_disallowed_attribute', name);
    }
    // 2. Valeur (déjà décodée par le parseur)
    checkValue(name, value);
    if (isHref) {
      const m = LOCAL_REF_RE.exec(value);
      if (!m) fail('svg_disallowed_value', name);
      state.refs.add(m[1]);
    }
    if (local === 'id' && uri === '') state.ids.add(value);
  }
}

function decode(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes); // BOM UTF-8 retiré
  } catch {
    return null;
  }
}

/**
 * Valide un SVG (octets bruts). Ne modifie rien.
 * @param {Uint8Array} bytes
 * @returns {null | { reason: string, name?: string }}
 */
export function svgProblem(bytes) {
  if (bytes.length > SVG_LIMIT) return { reason: 'too_large' };
  const text = decode(bytes);
  if (text === null || text.includes('\0')) return { reason: 'svg_bad_encoding' };
  if (DTD_OR_CDATA_RE.test(text)) return { reason: 'svg_dtd_or_cdata' };
  if (RAW_HREF_ENTITY_RE.test(text)) return { reason: 'svg_disallowed_value', name: 'href' };

  const state = { ids: new Set(), refs: new Set() };
  const stack = [];
  let elements = 0;
  let sawRoot = false;
  const parser = new SaxesParser({ xmlns: true, position: false });

  parser.on('error', err => { throw err; });
  parser.on('doctype', () => fail('svg_dtd_or_cdata'));
  parser.on('cdata', () => fail('svg_dtd_or_cdata'));
  parser.on('processinginstruction', pi => fail('svg_disallowed_element', `?${pi.target}`));
  parser.on('xmldecl', decl => {
    if (decl.encoding !== undefined && decl.encoding.toLowerCase() !== 'utf-8') fail('svg_bad_encoding');
  });
  parser.on('opentag', node => {
    const isRoot = !sawRoot;
    sawRoot = true;
    if (isRoot && (node.local !== 'svg' || node.uri !== SVG_NS)) fail('magic_mismatch', node.name);
    elements += 1;
    if (elements > MAX_ELEMENTS) fail('svg_too_complex');
    if (stack.length + 1 > MAX_DEPTH) fail('svg_too_complex');
    if (node.uri !== SVG_NS || !ELEMENTS.has(node.local)) fail('svg_disallowed_element', node.name);
    checkAttributes(node, state);
    // viewBox exigé sur la racine (dimensionnement des logos), après les contrôles de sécurité
    if (isRoot && !checkViewBox(node.attributes.viewBox?.value)) fail('svg_missing_viewbox');
    stack.push(node.local);
  });
  parser.on('closetag', () => {
    stack.pop();
  });
  parser.on('text', t => {
    if (t.trim() === '') return;
    if (!TEXT_ELEMENTS.has(stack.at(-1))) fail('svg_unexpected_text', stack.at(-1));
  });

  try {
    parser.write(text).close();
  } catch (err) {
    if (err instanceof SvgReject) return { reason: err.reason, ...(err.name_ ? { name: clean(err.name_) } : {}) };
    return { reason: 'svg_malformed' };
  }
  if (!sawRoot) return { reason: 'magic_mismatch' };
  for (const ref of state.refs) {
    if (!state.ids.has(ref)) return { reason: 'svg_disallowed_value', name: clean(`#${ref}`) };
  }
  return null;
}
