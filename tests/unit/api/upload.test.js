// Upload (T-UPL-01 à T-UPL-07) : types, magic bytes, taille, noms, verrou sha.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { detectType, hasExif, slugify, inspectUpload, normalizePdfNames, pdfInspectionProblem, PUBLIC_PATH_RE } from '../../../api/_lib/upload.js';
import { SVG_LIMIT, svgProblem } from '../../../api/_lib/svg.js';
import { setup, req, sessionCookieFor, bodyOf, ROOT } from './helpers.js';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(size = 400) {
  const b = new Uint8Array(size);
  b.set(PNG_SIG);
  return b;
}
function jpeg(size = 400, exif = false) {
  const b = new Uint8Array(size);
  b.set([0xff, 0xd8]);
  if (exif) {
    b.set([0xff, 0xe1, 0x00, 0x10], 2);
    b.set([...'Exif'].map(c => c.charCodeAt(0)).concat([0, 0]), 6);
  } else b.set([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00], 2);
  return b;
}
function webp(size = 400) {
  const b = new Uint8Array(size);
  b.set([...'RIFF'].map(c => c.charCodeAt(0)));
  b.set([...'WEBP'].map(c => c.charCodeAt(0)), 8);
  return b;
}
function pdf(body = '1 0 obj << /Type /Catalog >> endobj', eof = true) {
  return new TextEncoder().encode(`%PDF-1.7\n${body}\n${'%'.repeat(200)}\n${eof ? '%%EOF\n' : ''}`);
}
const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">${' '.repeat(200)}</svg>`);

let ctx;
let cookie;
beforeEach(async () => {
  ctx = setup();
  cookie = await sessionCookieFor(ctx.config);
});

function upload(query, bytes, type, { length = String(bytes.length), headers = {} } = {}) {
  const h = { 'content-type': type, ...headers };
  if (length !== null) h['content-length'] = length;
  return ctx.api.handle(req('POST', `/api/upload?${query}`, { cookie, body: bytes, headers: h }));
}

async function expectRejected(res, status, code) {
  expect(res.status).toBe(status);
  const body = await bodyOf(res);
  if (code) expect(body.error.details?.[0]?.code ?? body.error.code).toBe(code);
  expect(ctx.gh.calls.some(c => c.method === 'PUT')).toBe(false);
}

describe('Détection pure', () => {
  it('magic bytes', () => {
    expect(detectType(png())).toBe('image/png');
    expect(detectType(jpeg())).toBe('image/jpeg');
    expect(detectType(webp())).toBe('image/webp');
    expect(detectType(pdf())).toBe('application/pdf');
    expect(detectType(svg)).toBeNull();
  });
  it('EXIF détecté dans un segment APP1', () => {
    expect(hasExif(jpeg(400, true))).toBe(true);
    expect(hasExif(jpeg(400, false))).toBe(false);
  });
  it('trop petit ⇒ too_small', () => {
    expect(inspectUpload('image', 'image/png', png(50))).toMatchObject({ ok: false, reason: 'too_small' });
  });
});

describe('T-UPL-01 — SVG piégé / type incohérent', () => {
  it('déclaré image/svg+xml avec onload ⇒ 422 svg_event_handler', async () => {
    await expectRejected(await upload('kind=image&name=logo', svg, 'image/svg+xml'), 422, 'svg_event_handler');
  });
  it('déclaré image/png ⇒ 422 magic_mismatch', async () => {
    await expectRejected(await upload('kind=image&name=logo', svg, 'image/png'), 422, 'magic_mismatch');
  });
  for (const type of ['image/gif', 'text/html', 'application/octet-stream']) {
    it(`${type} ⇒ 415`, async () => {
      await expectRejected(await upload('kind=image&name=x', png(), type), 415);
    });
  }
});

describe('T-UPL-02 — incohérence type déclaré / contenu', () => {
  it('PNG déclaré application/pdf ⇒ 422 magic_mismatch', async () => {
    await expectRejected(await upload('kind=cv&lang=fr', png(), 'application/pdf'), 422, 'magic_mismatch');
  });
  it('JPEG déclaré image/png ⇒ 422', async () => {
    await expectRejected(await upload('kind=image&name=x', jpeg(), 'image/png'), 422, 'magic_mismatch');
  });
  it('PDF envoyé comme image ⇒ 415', async () => {
    await expectRejected(await upload('kind=image&name=x', pdf(), 'application/pdf'), 415);
  });
});

describe('T-UPL-03 / T-UPL-04 — PDF', () => {
  it('commence par %PDF- mais sans %%EOF ⇒ 422', async () => {
    const html = new TextEncoder().encode(`%PDF-<html><script>alert(1)</script>${' '.repeat(200)}</html>`);
    await expectRejected(await upload('kind=cv&lang=fr', html, 'application/pdf'), 422, 'magic_mismatch');
    await expectRejected(await upload('kind=cv&lang=fr', pdf('x', false), 'application/pdf'), 422, 'magic_mismatch');
  });
  for (const name of ['/JavaScript', '/JS', '/OpenAction', '/Launch', '/EmbeddedFile', '/AA', '/XFA', '/RichMedia']) {
    it(`${name} ⇒ 422 pdf_active_content`, async () => {
      await expectRejected(await upload('kind=cv&lang=fr', pdf(`<< ${name} (x) >>`), 'application/pdf'), 422, 'pdf_active_content');
    });
  }
});

describe('F3 — PDF : noms encodés, objets compressés, flux non inspectables', () => {
  const flate = text => deflateSync(Buffer.from(text));
  /** PDF avec un flux binaire (latin1 conservé octet pour octet). */
  function pdfWithStream(dict, data) {
    const head = Buffer.from(`%PDF-1.7\n1 0 obj\n${dict}\nstream\n`, 'latin1');
    const tail = Buffer.from(`\nendstream\nendobj\n${'%'.repeat(200)}\n%%EOF\n`, 'latin1');
    return new Uint8Array(Buffer.concat([head, Buffer.from(data), tail]));
  }

  it('le CV réel du dépôt est accepté', () => {
    const cv = new Uint8Array(readFileSync(path.join(ROOT, 'public/asset/Jordan_de_SOUZA_CV.pdf')));
    expect(inspectUpload('cv', 'application/pdf', cv)).toMatchObject({ ok: true });
  });

  for (const name of ['/Java#53cript', '/#4A#53', '/Open#41ction', '/#41#41', '/Launc#68', '/Embedded#46ile']) {
    it(`nom encodé ${name} ⇒ pdf_active_content`, () => {
      expect(normalizePdfNames(name)).toMatch(/^\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile)$/);
      expect(inspectUpload('cv', 'application/pdf', pdf(`<< ${name} (x) >>`))).toMatchObject({ ok: false, reason: 'pdf_active_content' });
    });
  }

  for (const marker of ['/Type /ObjStm', '/Type /Obj#53tm', '/Encrypt 5 0 R']) {
    it(`${marker} ⇒ pdf_uninspectable`, () => {
      expect(inspectUpload('cv', 'application/pdf', pdf(`<< ${marker} >>`))).toMatchObject({ ok: false, reason: 'pdf_uninspectable' });
    });
  }

  it('flux FlateDecode valide ⇒ accepté', () => {
    expect(pdfInspectionProblem(pdfWithStream('<< /Length 10 /Filter /FlateDecode >>', flate('BT /F1 12 Tf (Bonjour) Tj ET')))).toBeNull();
  });
  it('flux image DCTDecode ⇒ accepté sans décodage', () => {
    expect(pdfInspectionProblem(pdfWithStream('<< /Subtype /Image /Filter /DCTDecode >>', [0xff, 0xd8, 0xff, 1, 2, 3]))).toBeNull();
  });
  it('flux FlateDecode corrompu ⇒ pdf_uninspectable', () => {
    expect(pdfInspectionProblem(pdfWithStream('<< /Filter /FlateDecode >>', [1, 2, 3, 4, 5, 6]))).toBe('pdf_uninspectable');
  });
  for (const filter of ['/LZWDecode', '/ASCII85Decode', '/Crypt', '[/ASCIIHexDecode /FlateDecode]', '/Flate#44ecode#20']) {
    it(`filtre ${filter} ⇒ pdf_uninspectable`, () => {
      expect(pdfInspectionProblem(pdfWithStream(`<< /Filter ${filter} >>`, Buffer.from('abc')))).toBe('pdf_uninspectable');
    });
  }
  it('via l’API : 422 UPLOAD_INVALID pdf_uninspectable', async () => {
    await expectRejected(await upload('kind=cv&lang=fr', pdf('<< /Type /ObjStm /N 3 >>'), 'application/pdf'), 422, 'pdf_uninspectable');
  });
});

describe('T-UPL-05 — taille', () => {
  it('Content-Length absent ⇒ 411', async () => {
    await expectRejected(await upload('kind=image&name=x', png(), 'image/png', { length: null }), 411);
  });
  it('déclaré > 1,5 Mo (image) ⇒ 413 avant lecture', async () => {
    await expectRejected(await upload('kind=image&name=x', png(), 'image/png', { length: String(2 * 1024 * 1024) }), 413);
  });
  it('réel > 1,5 Mo ⇒ 413', async () => {
    const big = png(1.5 * 1024 * 1024 + 10);
    await expectRejected(await upload('kind=image&name=x', big, 'image/png'), 413);
  });
  it('Content-Length mensonger (déclaré petit, réel grand) ⇒ 413', async () => {
    const big = png(5000);
    const stream = new ReadableStream({ start(c) { c.enqueue(big); c.close(); } });
    const request = new Request('https://jokitsune.vercel.app/api/upload?kind=image&name=x', {
      method: 'POST', body: stream, duplex: 'half',
      headers: { cookie, origin: 'https://jokitsune.vercel.app', 'x-jk-admin': '1', 'content-type': 'image/png', 'content-length': '500' }
    });
    await expectRejected(await ctx.api.handle(request), 413);
  });
  it('PDF > 3 Mo ⇒ 413', async () => {
    await expectRejected(await upload('kind=cv&lang=fr', pdf(), 'application/pdf', { length: String(3 * 1024 * 1024 + 1) }), 413);
  });
});

describe('T-UPL-06 — noms générés par le serveur', () => {
  for (const name of ['../../index', '<script>', 'évènement été', '', 'a'.repeat(150)]) {
    it(`name=${JSON.stringify(name).slice(0, 30)}`, async () => {
      const res = await upload(`kind=image&name=${encodeURIComponent(name)}`, png(500 + name.length), 'image/png');
      expect(res.status).toBe(201);
      const body = await bodyOf(res);
      expect(body.path).toMatch(/^public\/images\/uploads\/[a-z0-9-]+-[0-9a-f]{12}\.png$/);
      expect(body.url).toMatch(PUBLIC_PATH_RE);
      expect(body.path).not.toContain('..');
    });
  }
  it('slug : NFKD, diacritiques retirés, défaut img', () => {
    expect(slugify('évènement été')).toBe('evenement-ete');
    expect(slugify('../../index')).toBe('index');
    expect(slugify('<script>')).toBe('script');
    expect(slugify('')).toBe('img');
    expect(slugify('***')).toBe('img');
    expect(slugify('a'.repeat(80))).toHaveLength(40);
  });
  it('extension issue du type détecté (WebP)', async () => {
    const body = await bodyOf(await upload('kind=image&name=photo.png', webp(), 'image/webp'));
    expect(body.path).toMatch(/\.webp$/);
  });
  it('doublon exact ⇒ 200 duplicate, pas de nouveau commit', async () => {
    const bytes = png(600);
    expect((await upload('kind=image&name=a', bytes, 'image/png')).status).toBe(201);
    const puts = ctx.gh.calls.filter(c => c.method === 'PUT').length;
    const again = await upload('kind=image&name=a', bytes, 'image/png');
    expect(again.status).toBe(200);
    expect((await bodyOf(again)).duplicate).toBe(true);
    expect(ctx.gh.calls.filter(c => c.method === 'PUT')).toHaveLength(puts);
  });
  it('EXIF ⇒ avertissement exif_present', async () => {
    const body = await bodyOf(await upload('kind=image&name=photo', jpeg(500, true), 'image/jpeg'));
    expect(body.warnings).toEqual(['exif_present']);
  });
  it('commit content(assets) sur le brouillon', async () => {
    await upload('kind=image&name=photo', png(), 'image/png');
    const putCall = ctx.gh.calls.find(c => c.method === 'PUT');
    expect(putCall.body.branch).toBe('content/draft');
    expect(putCall.body.message).toMatch(/^content\(assets\): ajout images\/uploads\/photo-[0-9a-f]{12}\.png\n/);
  });
});

describe('T-UPL-07 — remplacement de CV sous verrou sha', () => {
  it('création puis remplacement sans X-Base-Sha ⇒ 409 avec currentSha, puis succès avec le bon sha', async () => {
    const first = await upload('kind=cv&lang=fr', pdf('v1'), 'application/pdf');
    expect(first.status).toBe(201);
    const { sha, path, url } = await bodyOf(first);
    expect(path).toBe('public/files/cv-fr.pdf');
    expect(url).toBe('/files/cv-fr.pdf');

    const noBase = await upload('kind=cv&lang=fr', pdf('v2'), 'application/pdf');
    expect(noBase.status).toBe(409);
    expect((await bodyOf(noBase)).error.currentSha).toBe(sha);

    const stale = await upload('kind=cv&lang=fr', pdf('v2'), 'application/pdf', { headers: { 'x-base-sha': 'e'.repeat(40) } });
    expect(stale.status).toBe(409);

    const ok = await upload('kind=cv&lang=fr', pdf('v2'), 'application/pdf', { headers: { 'x-base-sha': sha } });
    expect(ok.status).toBe(201);
    const putCall = ctx.gh.calls.filter(c => c.method === 'PUT').at(-1);
    expect(putCall.body.message).toMatch(/^content\(assets\): remplacement files\/cv-fr\.pdf/);
  });

  it('lang invalide ⇒ 400 ; kind invalide ⇒ 400 ; X-Base-Sha mal formé ⇒ 400', async () => {
    expect((await upload('kind=cv&lang=de', pdf(), 'application/pdf')).status).toBe(400);
    expect((await upload('kind=../x', pdf(), 'application/pdf')).status).toBe(400);
    expect((await upload('kind=cv&lang=fr', pdf(), 'application/pdf', { headers: { 'x-base-sha': 'zz' } })).status).toBe(400);
  });
});

describe('SVG — liste blanche stricte (rejet, jamais de réécriture)', () => {
  const enc = s => new TextEncoder().encode(s);
  const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';
  // Le commentaire de remplissage garantit plus de MIN_SIZE octets
  const wrap = (body, rootAttrs = 'viewBox="0 0 64 64"') => `<svg ${NS} ${rootAttrs}><!-- ${'.'.repeat(80)} -->${body}</svg>`;
  const LOGO = wrap(
    '<title>Logo de test</title><desc>Organisme &amp; co</desc>'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0ff"/><stop offset="1" stop-color="#f0f" stop-opacity=".5"/></linearGradient>'
    + '<clipPath id="c"><rect width="60" height="60" rx="8"/></clipPath><path id="p" d="M4 4h56v56H4z"/></defs>'
    + '<g clip-path="url(#c)" transform="translate(2 2)"><use href="#p" fill="url(#g)"/><use xlink:href="#p" fill="none" stroke="#0ff" stroke-width="2"/></g>'
    + '<text x="32" y="40" font-family="sans-serif" font-size="12" text-anchor="middle">JK</text>'
  );
  const problem = s => svgProblem(typeof s === 'string' ? enc(s) : s);

  describe('SVG légitimes acceptés', () => {
    it('logo réaliste (title, gradient, clipPath, use local, commentaire)', () => {
      expect(problem(LOGO)).toBeNull();
      expect(inspectUpload('image', 'image/svg+xml', enc(LOGO))).toEqual({ ok: true, detected: 'image/svg+xml', warnings: [] });
    });
    it('précédé d’un BOM UTF-8 et d’une déclaration XML UTF-8', () => {
      expect(problem(`\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n${LOGO}`)).toBeNull();
    });
    it('via l’API : 201, chemin .svg conforme à PUBLIC_PATH_RE, fichier commité identique octet pour octet, doublon 200', async () => {
      const bytes = enc(`\uFEFF<?xml version="1.0" encoding="utf-8"?>\n${LOGO}\n`);
      const res = await upload('kind=image&name=Logo%20UNODC', bytes, 'image/svg+xml');
      expect(res.status).toBe(201);
      const body = await bodyOf(res);
      expect(body.path).toMatch(/^public\/images\/uploads\/logo-unodc-[0-9a-f]{12}\.svg$/);
      expect(body.url).toMatch(PUBLIC_PATH_RE);
      const put = ctx.gh.calls.find(c => c.method === 'PUT');
      expect(Buffer.from(put.body.content, 'base64').equals(Buffer.from(bytes))).toBe(true);
      const again = await upload('kind=image&name=Logo%20UNODC', bytes, 'image/svg+xml');
      expect(again.status).toBe(200);
      expect((await bodyOf(again)).duplicate).toBe(true);
    });
  });

  it('PUBLIC_PATH_RE accepte les SVG sous /images/uploads uniquement', () => {
    expect('/images/uploads/logo-0123456789ab.svg').toMatch(PUBLIC_PATH_RE);
    expect('/files/cv-fr.pdf').toMatch(PUBLIC_PATH_RE);
    for (const p of ['/files/x.svg', '/images/uploads/x.pdf', '/images/uploads/x.svgz', '/images/uploads/../x.svg', '/images/uploads/X.svg']) {
      expect(p).not.toMatch(PUBLIC_PATH_RE);
    }
  });

  const cases = [
    ['<script>', wrap('<script>alert(1)</script>'), 'svg_disallowed_element'],
    ['<script xlink:href>', wrap('<script xlink:href="//e/x.js"/>'), 'svg_disallowed_element'],
    ['onload sur rect', wrap('<rect onload="alert(1)" width="1" height="1"/>'), 'svg_event_handler'],
    ['onLoad (casse) sur rect', wrap('<rect onLoad="alert(1)" width="1" height="1"/>'), 'svg_event_handler'],
    ['onclick sur rect', wrap('<rect onclick="alert(1)" width="1" height="1"/>'), 'svg_event_handler'],
    ['onload sur la racine', wrap('', 'viewBox="0 0 1 1" onload="alert(1)"'), 'svg_event_handler'],
    ['foreignObject + XHTML', wrap('<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject>'), 'svg_disallowed_element'],
    ['h:script (espace XHTML)', wrap('<h:script xmlns:h="http://www.w3.org/1999/xhtml">alert(1)</h:script>'), 'svg_disallowed_element'],
    ['use xlink:href javascript: encodé (&#106;)', wrap('<use xlink:href="&#106;avascript:alert(1)"/>'), 'svg_disallowed_value'],
    ['use href http externe', wrap('<use href="http://e/x.svg#a"/>'), 'svg_disallowed_value'],
    ['use href data:', wrap('<use href="data:image/svg+xml;base64,PHN2Zz4="/>'), 'svg_disallowed_value'],
    ['use href local encodé (&#35;)', wrap('<path id="p" d="M0 0"/><use href="&#35;p"/>'), 'svg_disallowed_value'],
    ['use vers un id absent', wrap('<use href="#absent"/>'), 'svg_disallowed_value'],
    ['href sur un élément non autorisé', wrap('<rect id="r" href="#r" width="1" height="1"/>'), 'svg_disallowed_attribute'],
    ['<a href="javascript:">', wrap('<a href="javascript:alert(1)"><rect width="1" height="1"/></a>'), 'svg_disallowed_element'],
    ['<animate> vers javascript:', wrap('<animate attributeName="href" values="javascript:alert(1)"/>'), 'svg_disallowed_element'],
    ['<set> onmouseover', wrap('<set attributeName="onmouseover" to="alert(1)"/>'), 'svg_disallowed_element'],
    ['<image> externe', wrap('<image href="http://e/p.png"/>'), 'svg_disallowed_element'],
    ['<feImage> externe', wrap('<filter id="f"><feImage href="http://e"/></filter>'), 'svg_disallowed_element'],
    ['<style> @import', wrap('<style>@import url(http://e/x.css);</style>'), 'svg_disallowed_element'],
    ['<style> local inoffensif', wrap('<style>.a{fill:#0ff}</style>'), 'svg_disallowed_element'],
    ['attribut style (même local)', wrap('<rect style="fill:#0ff;stroke-width:2" width="1" height="1"/>'), 'svg_disallowed_attribute'],
    ['attribut style url externe', wrap('<rect style="fill:url(http://e/t)" width="1" height="1"/>'), 'svg_disallowed_attribute'],
    ['attribut style échappement CSS', wrap('<rect style="background:\\75rl(http://e)" width="1" height="1"/>'), 'svg_disallowed_attribute'],
    ['fill url externe', wrap('<rect fill="url(http://e#g)" width="1" height="1"/>'), 'svg_disallowed_value'],
    ['filter : second url() relatif après url(#id)', wrap('<filter id="f"/><rect filter="url(#f) url(x.svg#f)" width="1" height="1"/>'), 'svg_disallowed_value'],
    ['mask : second url() relatif après url(#id)', wrap('<mask id="m"/><rect mask="url(#m) URL(x.svg#m)" width="1" height="1"/>'), 'svg_disallowed_value'],
    ['clip-path : second url() relatif après url(#id)', wrap('<clipPath id="c"/><rect clip-path="url(#c) url(x.svg#c)" width="1" height="1"/>'), 'svg_disallowed_value'],
    ['filter : url(..) après url(#id)', wrap('<filter id="f"/><rect filter="url(#f) url(..)" width="1" height="1"/>'), 'svg_disallowed_value'],
    ['valeur avec @', wrap('<text font-family="@import x">a</text>'), 'svg_disallowed_value'],
    ['valeur avec antislash', wrap('<rect fill="\\75rl(x)" width="1" height="1"/>'), 'svg_disallowed_value'],
    ['DOCTYPE billion laughs', `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]>${wrap('<text>&b;</text>')}`, 'svg_dtd_or_cdata'],
    ['XXE SYSTEM', `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${wrap('<text>&x;</text>')}`, 'svg_dtd_or_cdata'],
    ['DOCTYPE sans entité', `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">${wrap('')}`, 'svg_dtd_or_cdata'],
    ['ENTITY en minuscules (pré-filtre insensible à la casse)', `${wrap('')}<!-- <!entity x "y"> -->`, 'svg_dtd_or_cdata'],
    ['CDATA', wrap('<text><![CDATA[<script>alert(1)</script>]]></text>'), 'svg_dtd_or_cdata'],
    ['instruction xml-stylesheet', `<?xml-stylesheet href="http://e/x.xsl" type="text/xsl"?>${wrap('')}`, 'svg_disallowed_element'],
    ['encoding UTF-16 déclaré', `<?xml version="1.0" encoding="UTF-16"?>${wrap('')}`, 'svg_bad_encoding'],
    ['encoding ISO-8859-1 déclaré', `<?xml version="1.0" encoding="ISO-8859-1"?>${wrap('')}`, 'svg_bad_encoding'],
    ['svg sans xmlns', `<svg viewBox="0 0 1 1"><!-- ${'.'.repeat(100)} --></svg>`, 'magic_mismatch'],
    ['racine html', `<html xmlns="http://www.w3.org/1999/xhtml"><!-- ${'.'.repeat(100)} --></html>`, 'magic_mismatch'],
    ['XML tronqué', wrap('<g><rect width="1" height="1"/>').replace('</svg>', ''), 'svg_malformed'],
    ['balise non fermée', wrap('<g>'), 'svg_malformed'],
    ['préfixe non déclaré', wrap('<x:y/>'), 'svg_malformed'],
    ['xml:base', wrap('<g xml:base="http://e/"/>'), 'svg_disallowed_attribute'],
    ['sodipodi:namedview', wrap('<sodipodi:namedview xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"/>'), 'svg_disallowed_element'],
    ['<metadata>', wrap('<metadata>auteur</metadata>'), 'svg_disallowed_element'],
    ['attribut inkscape:*', wrap('<g inkscape:label="x" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"/>'), 'svg_disallowed_attribute'],
    ['xmlns par défaut non SVG', wrap('<g xmlns="http://www.w3.org/1999/xhtml"/>'), 'svg_disallowed_element'],
    ['texte hors title/desc/text', wrap('<g>texte libre</g>'), 'svg_unexpected_text'],
    ['viewBox absent', wrap('', 'width="10" height="10"'), 'svg_missing_viewbox'],
    ['viewBox de largeur nulle', wrap('', 'viewBox="0 0 0 10"'), 'svg_missing_viewbox'],
    ['viewBox non numérique', wrap('', 'viewBox="0 0 a 10"'), 'svg_missing_viewbox'],
    ['profondeur 33', wrap('<g>'.repeat(32) + '</g>'.repeat(32)), 'svg_too_complex'],
    ['2 001 éléments', wrap('<rect width="1" height="1"/>'.repeat(2000)), 'svg_too_complex']
  ];

  for (const [label, source, reason] of cases) {
    it(`${label} ⇒ ${reason}`, () => {
      expect(problem(source)).toMatchObject({ reason });
      expect(inspectUpload('image', 'image/svg+xml', enc(source))).toMatchObject({ ok: false, reason });
    });
  }

  it('profondeur 32 et 2 000 éléments ⇒ acceptés (bornes incluses)', () => {
    expect(problem(wrap('<g>'.repeat(31) + '</g>'.repeat(31)))).toBeNull();
    expect(problem(wrap('<rect width="1" height="1"/>'.repeat(1999)))).toBeNull();
  });

  it('plus de 50 attributs sur un élément ⇒ svg_too_complex', () => {
    const names = ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'opacity', 'class', 'id', 'transform',
      'fill-opacity', 'fill-rule', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
      'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'clip-rule', 'color', 'display', 'visibility',
      'overflow', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
      'letter-spacing', 'cx', 'cy', 'r', 'fx', 'fy', 'fr', 'x1', 'y1', 'x2', 'y2', 'dx', 'dy', 'in', 'in2',
      'result', 'mode', 'operator', 'k1', 'k2'];
    expect(names.length).toBeGreaterThan(50);
    expect(problem(wrap(`<rect ${names.map(n => `${n}="1"`).join(' ')}/>`))).toMatchObject({ reason: 'svg_too_complex' });
  });

  it('BOM UTF-16 ⇒ svg_bad_encoding', () => {
    expect(problem(new Uint8Array(Buffer.from(`\uFEFF${LOGO}`, 'utf16le')))).toMatchObject({ reason: 'svg_bad_encoding' });
  });
  it('octets non UTF-8 ⇒ svg_bad_encoding', () => {
    const bytes = enc(LOGO.replace('Logo de test', 'Logo XX'));
    bytes[bytes.indexOf('X'.charCodeAt(0))] = 0xff;
    expect(problem(bytes)).toMatchObject({ reason: 'svg_bad_encoding' });
  });
  it('octet NUL ⇒ svg_bad_encoding', () => {
    expect(problem(LOGO.replace('Logo de test', 'Logo\0'))).toMatchObject({ reason: 'svg_bad_encoding' });
  });
  it('signature PNG suivie de <svg> ⇒ magic_mismatch', () => {
    const bytes = new Uint8Array([...PNG_SIG, ...enc(LOGO)]);
    expect(inspectUpload('image', 'image/svg+xml', bytes)).toMatchObject({ ok: false, reason: 'magic_mismatch' });
  });
  it('le nom fautif renvoyé est nettoyé et borné', () => {
    const p = problem(wrap(`<rect on${'x'.repeat(100)}="1" width="1" height="1"/>`));
    expect(p.reason).toBe('svg_event_handler');
    expect(p.name).toMatch(/^[A-Za-z0-9:_-]{1,64}$/);
  });

  describe('taille et performance', () => {
    const big = () => enc(wrap(`<!-- ${'a'.repeat(SVG_LIMIT)} -->`));
    it('plus de 256 Kio ⇒ 413 (inspectUpload)', () => {
      expect(inspectUpload('image', 'image/svg+xml', big())).toMatchObject({ ok: false, status: 413, reason: 'too_large' });
    });
    it('Content-Length > 256 Kio ⇒ 413 avant lecture', async () => {
      await expectRejected(await upload('kind=image&name=x', enc(LOGO), 'image/svg+xml', { length: String(SVG_LIMIT + 1) }), 413);
    });
    it('corps réel > 256 Kio ⇒ 413', async () => {
      await expectRejected(await upload('kind=image&name=x', big(), 'image/svg+xml'), 413);
    });
    it('SVG valide d’environ 200 Ko traité en moins de 200 ms', () => {
      // 4 tracés de ~50 Ko (chaque valeur reste sous la borne de 64 Kio)
      const source = wrap(`<path d="M0 0${' L1 1'.repeat(10000)}"/>`.repeat(4));
      expect(source.length).toBeGreaterThan(190 * 1024);
      const t = performance.now();
      expect(problem(source)).toBeNull();
      expect(performance.now() - t).toBeLessThan(200);
    });
    it('valeur d’attribut > 64 Kio ⇒ svg_too_complex', () => {
      expect(problem(wrap(`<path d="M0 0${' L1 1'.repeat(14000)}"/>`))).toMatchObject({ reason: 'svg_too_complex', name: 'd' });
    });
    it('valeur pathologique (url( + 60 000 espaces) refusée rapidement, sans ReDoS', () => {
      const t = performance.now();
      expect(problem(wrap(`<rect fill="url(${' '.repeat(60000)}" width="1" height="1"/>`))).toMatchObject({ reason: 'svg_disallowed_value' });
      expect(problem(wrap(`<rect fill="url(#a)${' '.repeat(60000)}x" width="1" height="1"/>`))).toMatchObject({ reason: 'svg_disallowed_value' });
      expect(performance.now() - t).toBeLessThan(200);
    });
  });

  describe('via l’API (aucun PUT GitHub)', () => {
    const apiCases = [
      ['<script>', wrap('<script>alert(1)</script>'), 'svg_disallowed_element'],
      ['foreignObject', wrap('<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"/></foreignObject>'), 'svg_disallowed_element'],
      ['href javascript: encodé', wrap('<use xlink:href="&#106;avascript:alert(1)"/>'), 'svg_disallowed_value'],
      ['DOCTYPE / XXE', `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>${wrap('')}`, 'svg_dtd_or_cdata'],
      ['attribut style', wrap('<rect style="fill:#0ff" width="1" height="1"/>'), 'svg_disallowed_attribute']
    ];
    for (const [label, source, reason] of apiCases) {
      it(`${label} ⇒ 422 ${reason}, sans écho du contenu`, async () => {
        const res = await upload('kind=image&name=logo', enc(source), 'image/svg+xml');
        expect(res.status).toBe(422);
        const body = await bodyOf(res);
        expect(body.error.code).toBe('UPLOAD_INVALID');
        expect(body.error.details[0].code).toBe(reason);
        expect(JSON.stringify(body)).not.toMatch(/alert|passwd|#0ff/);
        expect(ctx.gh.calls.some(c => c.method === 'PUT')).toBe(false);
      });
    }
    it('SVG envoyé avec kind=cv ⇒ 415', async () => {
      await expectRejected(await upload('kind=cv&lang=fr', enc(LOGO), 'image/svg+xml'), 415);
    });
    it('élément fautif renvoyé dans details[0].name', async () => {
      const body = await bodyOf(await upload('kind=image&name=x', enc(wrap('<script>alert(1)</script>')), 'image/svg+xml'));
      expect(body.error.details[0]).toEqual({ path: '', code: 'svg_disallowed_element', name: 'script' });
    });
  });
});
