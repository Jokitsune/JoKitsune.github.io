/* ================================================
   SECTIONS — fonctions de rendu pures : (content, ctx) -> chaîne HTML
   Le balisage reproduit exactement celui de l'ancien index.html
   (mêmes classes, mêmes attributs, mêmes styles inline).
   Toute valeur issue du contenu est échappée (ctx.t / ctx.plain / escapeAttr).
   ================================================ */

import { escapeAttr, escapeHtml, safeUrl } from './escape.js';
import { visibleSorted } from './context.js';
import { SHARE_ICON, socialIcon } from './icons.js';
import { sortTimeline, isOngoing, formatMonth, periodText } from '../lib/timeline.js';
import { CAROUSEL_MIN, monogram } from '../lib/coverflow.js';

/* -------- <head> : métadonnées SEO -------- */
export function renderHead({ site }, ctx) {
  const m = site.meta;
  return `<title>${escapeHtml(ctx.plainText(m.title))}</title>

  <!-- SEO & Métadonnées -->
  <meta name="description" content="${ctx.plain(m.description)}">
  <meta name="keywords" content="${ctx.plain(m.keywords)}">
  <meta name="author" content="${ctx.plain(m.author)}">
  <meta name="robots" content="${ctx.plain(m.robots)}">

  <!-- OpenGraph / Réseaux Sociaux (LinkedIn, Discord, etc.) -->
  <meta property="og:type" content="${ctx.plain(m.ogType)}">
  <meta property="og:url" content="${escapeAttr(safeUrl(m.url))}">
  <meta property="og:title" content="${ctx.plain(m.ogTitle)}">
  <meta property="og:description" content="${ctx.plain(m.ogDescription)}">
  <meta property="og:site_name" content="${ctx.plain(m.ogSiteName)}">`;
}

/* -------- BOOT SCREEN -------- */
export function renderBoot({ ui }, ctx) {
  const skip = ctx.t('boot.skip', ui.boot.skip);
  const lines = visibleSorted(ui.boot.lines).map(line => {
    const cls = line.variant && line.variant !== 'default' ? `boot-line ${line.variant}` : 'boot-line';
    // Délai porté par un attribut : la règle CSS correspondante est générée au build (CSP sans style inline)
    const delay = ` data-boot-delay="${Number(line.delay)}"`;
    const text = ctx.t(`boot.lines.${line.id}`, line.text);
    if (line.value !== undefined) {
      return `    <div class="${cls}"${delay}><span${text.attr}>${text.html}</span> <span class="boot-value">${escapeHtml(line.value)}</span></div>`;
    }
    return `    <div class="${cls}"${delay}${text.attr}>${text.html}</div>`;
  }).join('\n');

  return `<div id="boot-screen" role="dialog" aria-label="${escapeAttr(ui.a11y.bootDialog)}">
    <button id="btn-skip-boot" class="boot-skip-btn" type="button" title="${escapeAttr(ui.a11y.bootSkipTitle)}"${skip.attr}>${skip.html}</button>
${lines}
  </div>`;
}

/* -------- NAVIGATION -------- */
export function renderNav({ site, ui, cards }, ctx) {
  const id = site.identity;
  // Aucune certification visible : la section n'est pas rendue, son lien non plus
  const hasCerts = visibleSorted(cards?.cards).length > 0;
  const links = visibleSorted(ui.nav.links).filter(link => hasCerts || link.href !== '#certifications').map(link => {
    const label = ctx.t(`nav.${link.id}`, link.label);
    return `      <li><a href="${escapeAttr(safeUrl(link.href))}" class="nav-link-item"${label.attr}>${label.html}</a></li>`;
  }).join('\n');

  return `<nav>
    <div class="nav-brand">${escapeHtml(id.brandInitial)}<span>.</span>${escapeHtml(id.lastName)}<span class="t-cursor t-cursor--brand" aria-hidden="true"></span></div>

    <ul class="nav-links" id="navLinks">
${links}
    </ul>

    <div class="nav-status-wrapper">
      <!-- SELECTEUR DE LANGUE CYBER -->
      <div class="lang-switch" id="langSwitch" role="group" aria-label="${escapeAttr(ui.a11y.langSwitch)}">
        <button type="button" class="lang-btn${site.defaultLang === 'fr' ? ' active' : ''}" data-lang="fr">FR</button>
        <span class="lang-divider" aria-hidden="true">/</span>
        <button type="button" class="lang-btn${site.defaultLang === 'en' ? ' active' : ''}" data-lang="en">EN</button>
      </div>

      <span class="status-dot" aria-hidden="true"></span>
      <span class="nav-status-text">${escapeHtml(ui.nav.status)}</span>
      <button class="nav-toggle" id="navToggle" aria-label="${escapeAttr(ui.a11y.navToggle)}" aria-expanded="false" aria-controls="navLinks">
        <span class="toggle-bar"></span>
        <span class="toggle-bar"></span>
        <span class="toggle-bar"></span>
      </button>
    </div>
  </nav>`;
}

/* -------- HERO (identité, CTA, réseaux, terminal) -------- */
export function renderHero({ site, ui }, ctx) {
  const { identity, hero, terminal, cv } = site;
  const greeting = ctx.t('hero.greeting', hero.greeting);
  const title = ctx.t('hero.title', hero.title);
  const bio = ctx.t('hero.bio', hero.bio);
  const ctaContact = ctx.t('hero.ctaContact', ui.hero.ctaContact);
  const ctaFormation = ctx.t('hero.ctaFormation', ui.hero.ctaFormation);
  const ctaCv = ctx.t('hero.ctaCv', ui.hero.ctaCv);
  const cvHref = ctx.href('cv.url', cv.url);
  const ctaSocial = ctx.t('hero.ctaSocial', ui.hero.ctaSocial);

  const socials = visibleSorted(site.socials).map(s => `                <a href="${escapeAttr(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer" class="social-pile-item ${escapeAttr(s.network)}-item" title="${escapeAttr(s.title)}" aria-label="${escapeAttr(s.label)}">
                  ${socialIcon(s.network)}
                </a>`).join('\n');

  // Alignement des clés du terminal (purement cosmétique dans la source : les espaces se replient)
  const fields = visibleSorted(terminal.fields);
  const pad = Math.max(0, ...fields.map(f => String(f.key).length)) + 2;
  const fieldLines = fields.map(f => {
    const val = ctx.t(`terminal.fields.${f.id}`, f.value);
    const highlight = f.highlight ? ' t-val--highlight' : '';
    return `            <span class="t-output"><span class="t-key">${escapeHtml(f.key)}</span>${' '.repeat(Math.max(1, pad - String(f.key).length))}: <span class="t-val${highlight}"${val.attr}>${val.html}</span></span>`;
  }).join('\n');

  const skillLines = visibleSorted(terminal.skills).map(s => {
    const label = ctx.t(`terminal.skills.${s.id}`, s.label, { prefix: '→ ' });
    return `            <span class="t-output"${label.attr}>${label.html}</span>`;
  }).join('\n');

  const finalCmd = ctx.t('terminal.finalCommand', terminal.finalCommand);
  const promptLine = cmd => `          <div class="t-line">
            <span class="t-prompt">${escapeHtml(terminal.prompt)}</span>
            <span class="t-path">${escapeHtml(terminal.path)}</span>
            <span class="t-cmd">${cmd}</span>
          </div>`;

  return `<section id="hero">
      <div class="grid-bg" aria-hidden="true"></div>
      <div class="hero-left">
        <div class="hero-greeting"${greeting.attr}>${greeting.html}</div>
        <h1 class="hero-name glitch" data-text="${escapeAttr(identity.lastName)}">
          <span class="first">${escapeHtml(identity.firstName)}</span>
          <span class="last">${escapeHtml(identity.lastName)}</span>
        </h1>
        <div class="hero-title"${title.attr}>${title.html}</div>
        <p class="hero-bio"${bio.attr}>${bio.html}</p>
        <div class="hero-cta">
          <a href="#contact" class="btn-primary">
            <span aria-hidden="true">▶</span>
            <span${ctaContact.attr}>${ctaContact.html}</span>
          </a>
          <a href="#formation" class="btn-secondary">
            <span aria-hidden="true">◈</span>
            <span${ctaFormation.attr}>${ctaFormation.html}</span>
          </a>

          <!-- GROUPE CV + RÉSEAUX (Toujours indissociables et côte à côte) -->
          <div class="hero-cta-group">
            <a href="${cvHref.value}"${cvHref.attr} download="${escapeAttr(cv.downloadName)}" class="btn-secondary" title="${escapeAttr(ui.a11y.cvTitle)}">
              <span aria-hidden="true">⇩</span>
              <span${ctaCv.attr}>${ctaCv.html}</span>
            </a>

            <!-- BOUTON PILE DE RÉSEAUX SOCIAUX DÉPLOYABLE -->
            <div class="social-stack-container" id="socialStackContainer">
              <button type="button" class="btn-secondary social-trigger-btn" id="socialTriggerBtn" aria-label="${escapeAttr(ui.a11y.socialTrigger)}" aria-expanded="false" title="${escapeAttr(ui.a11y.socialTriggerTitle)}">
                ${SHARE_ICON}
                <span class="trigger-text"${ctaSocial.attr}>${ctaSocial.html}</span>
                <span class="trigger-arrow" aria-hidden="true">▶</span>
              </button>
              <div class="social-links-pile" id="socialLinksPile" aria-hidden="true">
${socials}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="hero-terminal">
        <div class="terminal-bar">
          <div class="t-dot red" aria-hidden="true"></div>
          <div class="t-dot yellow" aria-hidden="true"></div>
          <div class="t-dot green" aria-hidden="true"></div>
          <span class="terminal-title">${escapeHtml(terminal.title)}</span>
        </div>
        <div class="terminal-body">
${promptLine(escapeHtml(terminal.whoamiCommand))}
          <div>
${fieldLines}
          </div>
          <br>
${promptLine(escapeHtml(terminal.skillsCommand))}
          <div>
${skillLines}
          </div>
          <br>
${promptLine(`<span${finalCmd.attr}>${finalCmd.html}</span><span class="t-cursor" aria-hidden="true"></span>`)}
        </div>
      </div>
    </section>`;
}

/* -------- En-tête de section (label + titre) -------- */
// Le titre porte l'id « <name>-title », cible possible d'un aria-labelledby sur la section.
function sectionHeading(name, { ui }, ctx) {
  const label = ctx.t(`sections.${name}.label`, ui.sections[name].label);
  const title = ctx.t(`sections.${name}.title`, ui.sections[name].title);
  return `      <div class="section-label"${label.attr}>${label.html}</div>
      <h2 class="section-title" id="${name}-title"${title.attr}>${title.html}</h2>`;
}

/* -------- COMPÉTENCES -------- */
export function renderSkills(content, ctx) {
  const cards = visibleSorted(content.skills.categories).map(cat => {
    const title = ctx.t(`skills.${cat.id}.title`, cat.title);
    const tags = cat.tags.map((tag, i) => {
      const t = ctx.t(`skills.${cat.id}.tags.${i}`, tag);
      return `            <span class="skill-tag"${t.attr}>${t.html}</span>`;
    }).join('\n');
    return `        <div class="skill-card">
          <div class="skill-card-icon" aria-hidden="true">${escapeHtml(cat.icon)}</div>
          <div class="skill-card-title"${title.attr}>${title.html}</div>
          <div class="skill-tags">
${tags}
          </div>
        </div>`;
  }).join('\n');

  return `<section id="skills">
${sectionHeading('skills', content, ctx)}
      <div class="skills-grid">
${cards}
      </div>
    </section>`;
}

/* -------- PROJETS -------- */
export function renderProjects(content, ctx) {
  const cards = visibleSorted(content.projects.projects).map((p, index) => {
    const title = ctx.t(`projects.${p.id}.title`, p.title);
    const desc = ctx.t(`projects.${p.id}.description`, p.description);
    const stack = p.stack.map((item, i) => {
      const s = ctx.t(`projects.${p.id}.stack.${i}`, item);
      return `            <span class="stack-item"${s.attr}>${s.html}</span>`;
    }).join('\n');
    const links = p.links.map((link, i) => {
      const l = ctx.t(`projects.${p.id}.links.${i}`, link.label);
      return `            <a href="${escapeAttr(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer" class="project-btn"${l.attr}>${l.html}</a>`;
    }).join('\n');
    // Numéro affiché : position dans la liste visible (PROJECT_01, PROJECT_02…)
    const number = `PROJECT_${String(index + 1).padStart(2, '0')}`;
    return `        <div class="project-card">
          <div class="project-number">${number}</div>
          <div class="project-name"${title.attr}>${title.html}</div>
          <p class="project-desc"${desc.attr}>${desc.html}</p>
          <div class="project-stack">
${stack}
          </div>
          <div class="project-actions">
${links}
          </div>
        </div>`;
  }).join('\n\n');

  return `<section id="projects">
${sectionHeading('projects', content, ctx)}
      <div class="projects-grid">

${cards}

      </div>
    </section>`;
}

/* -------- Timeline « Parcours » -------- */
// Ordre DOM : intitulé (h3) → catégorie → période → organisme → description,
// pour qu'un lecteur d'écran qui saute de titre en titre entende tout le contexte.
// L'ordre visuel (catégorie et période au-dessus) est réglé en CSS.
// Aucune classe d'état (is-enhanced, is-visible…) : elles sont posées par le JS.
function renderTimeline(content, ctx) {
  const labels = content.ui.timeline;
  return sortTimeline(content.timeline.items).map(item => {
    const k = `timeline.${item.id}`;
    const kind = escapeAttr(item.kind);
    const role = ctx.t(`${k}.role`, item.role);
    const org = ctx.t(`${k}.org`, item.org);
    const kindLabel = ctx.t(`timelineUi.kind.${item.kind}`, labels.kinds[item.kind]);
    const period = ctx.t(`${k}.period`, periodText(item, labels));
    const start = `<time datetime="${escapeAttr(item.start)}">${escapeHtml(formatMonth(item.start))}</time>`;
    let end;
    if (isOngoing(item)) {
      const present = ctx.t('timelineUi.present', labels.present);
      end = `<span class="tl-ongoing"${present.attr}>${present.html}</span>`;
    } else {
      end = `<time datetime="${escapeAttr(item.end)}">${escapeHtml(formatMonth(item.end))}</time>`;
    }
    let desc;
    if (item.bullets) {
      const lis = item.bullets.map((b, i) => {
        const li = ctx.t(`${k}.bullets.${i}`, b);
        return `              <li${li.attr}>${li.html}</li>`;
      }).join('\n');
      desc = `            <ul class="tl-desc tl-bullets" role="list">
${lis}
            </ul>`;
    } else {
      const d = ctx.t(`${k}.description`, item.description);
      desc = `            <p class="tl-desc"${d.attr}>${d.html}</p>`;
    }
    return `        <li class="tl-item tl-item--${kind}" data-kind="${kind}" data-id="${escapeAttr(item.id)}">
          <span class="tl-node" aria-hidden="true"></span>
          <div class="tl-body">
            <h3 class="tl-role"${role.attr}>${role.html}</h3>
            <p class="tl-kind"${kindLabel.attr}>${kindLabel.html}</p>
            <p class="tl-when"><span class="sr-only"${period.attr}>${period.html}</span><span class="tl-when-text" aria-hidden="true">${start}<span class="tl-sep"> — </span>${end}</span></p>
            <p class="tl-org"${org.attr}>${org.html}</p>
${desc}
          </div>
        </li>`;
  }).join('\n');
}

/* -------- FORMATION : frise « Parcours » -------- */
export function renderFormation(content, ctx) {
  return `<section id="formation" aria-labelledby="formation-title">
${sectionHeading('formation', content, ctx)}

      <div class="tl" data-timeline>
        <div class="tl-rail" aria-hidden="true"><span class="tl-rail-fill"></span><span class="tl-rail-head"></span></div>
        <ol class="tl-list" role="list">
${renderTimeline(content, ctx)}
        </ol>
      </div>
    </section>`;
}

/* -------- CERTIFICATIONS : coverflow à logos (grille statique sans JS) -------- */
// Un seul balisage pour les deux mises en page : sans JS (ou < CAROUSEL_MIN), une
// grille où tout est visible ; le JS ajoute .cc--enhanced, les rôles ARIA et révèle
// les contrôles (rendus `hidden`). Aucun style inline : le moteur écrit via le CSSOM.
const pad2 = n => String(n).padStart(2, '0');

function renderCertSlide(card, index, total, content, ctx) {
  const labels = content.ui.certifications;
  const id = escapeAttr(card.id);
  const k = `cards.${card.id}`;
  const title = ctx.t(`${k}.title`, card.title);
  const org = ctx.t(`${k}.org`, card.org);
  const n = index + 1;
  const position = {
    fr: labels.position.fr.replace('{n}', n).replace('{total}', total),
    en: labels.position.en.replace('{n}', n).replace('{total}', total)
  };
  const slideAttrs = ctx.deferredAttrs({
    'aria-roledescription': ['certifications.slide', labels.slide],
    'aria-label': [`${k}.position`, position]
  });

  const visual = card.logo
    ? `<img src="${escapeAttr(safeUrl(card.logo))}"${card.logoAlt ? ctx.attrs({ alt: [`${k}.logoAlt`, card.logoAlt] }) : ' alt=""'} loading="eager" decoding="async" draggable="false">`
    : `<span class="cc-monogram" aria-hidden="true">${escapeHtml(monogram(ctx.plainText(card.org)))}</span>`;

  let verify = '';
  if (card.verifyUrl) {
    const label = ctx.t('certifications.verify', labels.verify);
    const newTab = ctx.t('certifications.newTab', labels.newTab);
    const platform = card.verifyPlatform
      ? `<span class="cc-platform">via ${escapeHtml(card.verifyPlatform)}</span>`
      : '';
    verify = `
            <a class="btn-secondary cc-verify" href="${escapeAttr(safeUrl(card.verifyUrl))}" target="_blank" rel="noopener noreferrer" aria-describedby="cc-${id}-title">
              <span class="cc-verify-main"><span${label.attr}>${label.html}</span> <span aria-hidden="true">↗</span></span>${platform}<span class="sr-only"${newTab.attr}>${newTab.html}</span>
            </a>`;
  }

  return `        <li class="cc-slide" data-cc-slide data-id="${id}"${slideAttrs}>
          <div class="cc-card">
            <span class="cc-card-tag" aria-hidden="true">CERT_${pad2(n)}</span>
            <div class="cc-plate">${visual}</div>
          </div>
          <div class="cc-info">
            <p class="cc-prompt" aria-hidden="true">&gt; cert --show ${pad2(n)}/${pad2(total)}<span class="cc-caret">_</span></p>
            <h3 class="cc-title" id="cc-${id}-title"${title.attr}>${title.html}</h3>
            <p class="cc-org"${org.attr}>${org.html}</p>${verify}
          </div>
        </li>`;
}

function renderCertControls(cards, content, ctx) {
  const labels = content.ui.certifications;
  const sr = (key, value, extra = '') => {
    const t = ctx.t(`certifications.${key}`, value);
    return `<span class="sr-only"${extra}${t.attr}>${t.html}</span>`;
  };
  const dots = cards.map((card, i) => {
    const title = ctx.t(`cards.${card.id}.title`, card.title);
    return `          <button type="button" class="cc-dot" data-cc-dot="${i}"><span class="sr-only"${title.attr}>${title.html}</span></button>`;
  }).join('\n');
  const dotsLabel = ctx.t('certifications.dots', labels.dots);
  return `      <div class="cc-controls" hidden>
        <button type="button" class="cc-btn cc-toggle" data-cc-toggle><span class="cc-glyph cc-glyph--pause" aria-hidden="true"></span>${sr('pause', labels.pause, ' data-cc-label="pause"')}${sr('play', labels.play, ' data-cc-label="play" hidden')}</button>
        <button type="button" class="cc-btn cc-prev" data-cc-prev><span class="cc-glyph" aria-hidden="true">‹</span>${sr('prev', labels.prev)}</button>
        <div class="cc-dots" role="group" aria-labelledby="cc-dots-label">
          <span class="sr-only" id="cc-dots-label"${dotsLabel.attr}>${dotsLabel.html}</span>
${dots}
        </div>
        <button type="button" class="cc-btn cc-next" data-cc-next><span class="cc-glyph" aria-hidden="true">›</span>${sr('next', labels.next)}</button>
        <p class="cc-counter" aria-hidden="true"><span data-cc-current>01</span> / ${pad2(cards.length)}</p>
      </div>`;
}

export function renderCertifications(content, ctx) {
  const cards = visibleSorted(content.cards.cards);
  if (!cards.length) return '';
  const carousel = cards.length >= CAROUSEL_MIN;
  const slides = cards.map((card, i) => renderCertSlide(card, i, cards.length, content, ctx)).join('\n');
  const rootAttrs = carousel
    ? ` data-cc${ctx.deferredAttrs({ 'aria-roledescription': ['certifications.carousel', content.ui.certifications.carousel] })}`
    : '';
  return `<section id="certifications" aria-labelledby="certifications-title">
${sectionHeading('certifications', content, ctx)}

      <div class="cc"${rootAttrs}>
        <div class="cc-stage">
          <div class="cc-floor" aria-hidden="true"></div>
          <ul class="cc-track" role="list">
${slides}
          </ul>
        </div>
${carousel ? `${renderCertControls(cards, content, ctx)}
        <p class="cc-status sr-only" aria-live="polite" aria-atomic="true"></p>` : ''}
      </div>
    </section>`;
}

/* -------- CONTACT -------- */
export function renderContact(content, ctx) {
  const { site, ui } = content;
  const f = ui.form;
  const desc = ctx.t('contact.description', site.contact.description);

  const items = visibleSorted(site.contact.items).map(item => {
    const label = ctx.t(`contact.items.${item.id}.label`, item.label);
    const value = ctx.t(`contact.items.${item.id}.value`, item.value);
    const inner = `
            <div class="contact-icon" aria-hidden="true">${escapeHtml(item.icon)}</div>
            <div>
              <span class="contact-label"${label.attr}>${label.html}</span>
              <span class="contact-value"${value.attr}>${value.html}</span>
            </div>
          `;
    return item.href
      ? `          <a href="${escapeAttr(safeUrl(item.href))}" class="contact-item contact-item--link">${inner}</a>`
      : `          <div class="contact-item">${inner}</div>`;
  }).join('\n');

  const success = ctx.t('form.success', f.success);
  const error = ctx.t('form.error', f.error);
  const field = (id, name, type, labelKey, phKey, tag) => {
    const label = ctx.t(`form.${labelKey}`, f[labelKey]);
    const ph = ctx.ph(`form.${phKey}`, f[phKey]);
    const control = tag === 'textarea'
      ? `<textarea id="${id}" class="form-textarea" name="${name}" data-fs-field placeholder="${ph.value}"${ph.attr} required></textarea>`
      : `<input id="${id}" class="form-input" type="${type}" name="${name}" data-fs-field placeholder="${ph.value}"${ph.attr} required>`;
    return `            <div class="form-group">
              <label class="form-label" for="${id}"${label.attr}>${label.html}</label>
              ${control}
              <span data-fs-error="${name}" class="form-field-error"></span>
            </div>`;
  };
  const submit = ctx.t('form.submit', f.submit);

  return `<section id="contact">
${sectionHeading('contact', content, ctx)}
      <div class="contact-wrapper">
        <div class="contact-info">
          <p class="contact-desc"${desc.attr}>${desc.html}</p>
${items}
        </div>
        <div class="contact-form">
          <div data-fs-success class="form-feedback form-feedback--success"${success.attr}>${success.html}</div>
          <div data-fs-error class="form-feedback form-feedback--error"${error.attr}>${error.html}</div>

          <form id="fs-form">
${field('form-name', 'name', 'text', 'nameLabel', 'namePlaceholder')}
${field('form-email', 'email', 'email', 'emailLabel', 'emailPlaceholder')}
${field('form-message', 'message', null, 'messageLabel', 'messagePlaceholder', 'textarea')}
            <button type="submit" id="fs-submit-btn" data-fs-submit-btn class="form-submit"${submit.attr}>${submit.html}</button>
          </form>
        </div>
      </div>
    </section>`;
}

/* -------- LECTEUR AUDIO -------- */
export function renderAudio({ site, ui }) {
  const a = site.audio;
  return `<div class="cyber-audio-player" id="audioPlayer" role="region" aria-label="${escapeAttr(ui.a11y.audioRegion)}">
    <button class="audio-play-btn" id="audioPlayBtn" type="button" aria-label="${escapeAttr(ui.a11y.audioPlay)}" title="${escapeAttr(ui.a11y.audioPlayTitle)}">
      <span class="play-icon" id="playIcon">▶</span>
    </button>
    <div class="audio-info">
      <span class="audio-title">${escapeHtml(a.title)}</span>
      <div class="audio-equalizer" id="audioEqualizer" aria-hidden="true">
        <span class="eq-bar"></span>
        <span class="eq-bar"></span>
        <span class="eq-bar"></span>
        <span class="eq-bar"></span>
        <span class="eq-bar"></span>
      </div>
    </div>
    <button class="audio-mute-btn" id="audioMuteBtn" type="button" aria-label="${escapeAttr(ui.a11y.audioMute)}" title="${escapeAttr(ui.a11y.audioMuteTitle)}">
      <span id="muteIcon">🔊</span>
    </button>
    <audio id="bgmAudio" loop preload="auto">
      <source src="${escapeAttr(safeUrl(a.src))}" type="${escapeAttr(a.type)}">
    </audio>
  </div>`;
}

/* -------- FOOTER -------- */
export function renderFooter({ site }, ctx) {
  const rights = ctx.t('footer.rights', site.footer.rights);
  return `<footer>
    <div${rights.attr}>${rights.html}</div>
    <div class="footer-prompt">${escapeHtml(site.footer.prompt)} <span class="t-cursor t-cursor--footer" aria-hidden="true"></span></div>
  </footer>`;
}
