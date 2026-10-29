/* ================================================
   MINI-OUTILLAGE DOM DE L'ADMIN — sans innerHTML
   Tout passe par createElement / textContent / replaceChildren : la CSP
   « require-trusted-types-for 'script'; trusted-types 'none' » ferait de
   toute façon échouer un sink HTML.
   ================================================ */

let uid = 0;
/** Identifiant unique pour relier label / champ / description. */
export function nextId(prefix = 'f') {
  uid += 1;
  return `${prefix}-${uid}`;
}

/**
 * Crée un élément.
 * - attrs : attributs (false/null/undefined ignorés), `class`, `dataset`, `on<Event>` (écouteurs)
 * - children : nœuds, chaînes (insérées comme texte) ou tableaux
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value' && 'value' in el) el.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'open') el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Texte multi-ligne : "\n" → <br> créés par le DOM (aucun HTML interprété). */
export function multiline(text) {
  const frag = document.createDocumentFragment();
  String(text ?? '').split('\n').forEach((line, i) => {
    if (i) frag.append(document.createElement('br'));
    frag.append(document.createTextNode(line));
  });
  return frag;
}

/** Remplace le contenu d'un élément. */
export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** Lien externe sûr (https uniquement), ouvert dans un nouvel onglet. */
export function externalLink(url, label) {
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return null;
  return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label);
}
