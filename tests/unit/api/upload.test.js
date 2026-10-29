// Upload (T-UPL-01 à T-UPL-07) : types, magic bytes, taille, noms, verrou sha.
import { describe, it, expect, beforeEach } from 'vitest';
import { detectType, hasExif, slugify, inspectUpload, PUBLIC_PATH_RE } from '../../../api/_lib/upload.js';
import { setup, req, sessionCookieFor, bodyOf } from './helpers.js';

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

describe('T-UPL-01 — SVG refusé', () => {
  it('déclaré image/svg+xml ⇒ 415', async () => {
    await expectRejected(await upload('kind=image&name=logo', svg, 'image/svg+xml'), 415);
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
