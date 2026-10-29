/* ================================================
   SECTIONS — fonctions de rendu pures : (content, ctx) -> chaîne HTML
   Le balisage reproduit exactement celui de l'ancien index.html
   (mêmes classes, mêmes attributs, mêmes styles inline).
   Toute valeur issue du contenu est échappée (ctx.t / ctx.plain / escapeAttr).
   ================================================ */

import { escapeAttr, escapeHtml, safeUrl } from './escape.js';
import { visibleSorted } from './context.js';
import { SHARE_ICON, socialIcon } from './icons.js';

/** Suffixe de classe des variantes de carte (green = style de base, sans suffixe). */
function variant(cls, color) {
  return color && color !== 'green' ? ` ${cls}--${color}` : '';
}

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
export function renderNav({ site, ui }, ctx) {
  const id = site.identity;
  const links = visibleSorted(ui.nav.links).map(link => {
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
function sectionHeading(name, { ui }, ctx) {
  const label = ctx.t(`sections.${name}.label`, ui.sections[name].label);
  const title = ctx.t(`sections.${name}.title`, ui.sections[name].title);
  return `      <div class="section-label"${label.attr}>${label.html}</div>
      <h2 class="section-title"${title.attr}>${title.html}</h2>`;
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

/* -------- Timeline (colonne gauche de la section formation) -------- */
function renderTimeline(content, ctx) {
  return visibleSorted(content.timeline.items).map(item => {
    const date = ctx.t(`timeline.${item.id}.date`, item.date);
    const role = ctx.t(`timeline.${item.id}.role`, item.role);
    const org = ctx.t(`timeline.${item.id}.org`, item.org);
    let desc;
    if (item.bullets) {
      const lis = item.bullets.map((b, i) => {
        const li = ctx.t(`timeline.${item.id}.bullets.${i}`, b);
        return `                <li${li.attr}>${li.html}</li>`;
      }).join('\n');
      desc = `            <div class="timeline-desc">
              <ul>
${lis}
              </ul>
            </div>`;
    } else {
      const d = ctx.t(`timeline.${item.id}.description`, item.description);
      desc = `            <div class="timeline-desc"${d.attr}>${d.html}</div>`;
    }
    return `          <div class="timeline-item">
            <div class="timeline-dot" aria-hidden="true"></div>
            <div class="timeline-date"${date.attr}>${date.html}</div>
            <div class="timeline-role"${role.attr}>${role.html}</div>
            <div class="timeline-org"${org.attr}>${org.html}</div>
${desc}
          </div>`;
  }).join('\n\n');
}

/* -------- Cartes 3D (colonne droite de la section formation) -------- */
function renderCards(content, ctx) {
  return visibleSorted(content.cards.cards).map(card => {
    const c = card.color;
    const k = `cards.${card.id}`;
    const badge = ctx.t(`${k}.badge`, card.badge);
    const title = ctx.t(`${k}.title`, card.title);
    const org = ctx.t(`${k}.org`, card.org);
    const date = ctx.t(`${k}.date`, card.date);
    const pLabel = ctx.t(`${k}.progress.label`, card.progress.label);
    const pValue = ctx.t(`${k}.progress.value`, card.progress.value);
    const percent = Math.min(100, Math.max(0, Number(card.progress.percent) || 0));
    const tags = card.tags.map((tag, i) => {
      const t = ctx.t(`${k}.tags.${i}`, tag);
      return `                  <span class="card-tag"${t.attr}>${t.html}</span>`;
    }).join('\n');

    return `          <div class="card-3d-wrap" data-card="${escapeAttr(card.id)}">
            <div class="card-3d-inner">
              <div class="sec-card${variant('sec-card', c)}">
                <div class="shine-layer" aria-hidden="true"></div>
                <div class="card-corner-tag" aria-hidden="true"></div>
                <div class="card-type-badge${variant('card-badge', c)}"><span class="badge-dot${variant('badge-dot', c)}" aria-hidden="true"></span><span${badge.attr}>${badge.html}</span></div>
                <div class="card-icon-ring${variant('card-ring', c)}" aria-hidden="true">${escapeHtml(card.icon)}</div>
                <div>
                  <div class="card-title${variant('card-title', c)}"${title.attr}>${title.html}</div>
                  <div class="card-org"${org.attr}>${org.html}</div>
                  <div class="card-date"${date.attr}>${date.html}</div>
                </div>
                <div class="card-divider${variant('card-divider', c)}" aria-hidden="true"></div>
                <div class="card-progress">
                  <div class="progress-label"><span${pLabel.attr}>${pLabel.html}</span><span${pValue.attr}>${pValue.html}</span></div>
                  <div class="progress-bar-bg"><div class="progress-bar-fill${variant('progress-bar-fill', c)}" data-fill="${percent}"></div></div>
                </div>
                <div class="card-tags">
${tags}
                </div>
              </div>
            </div>
          </div>`;
  }).join('\n\n');
}

/* -------- FORMATION (timeline + cartes) -------- */
export function renderFormation(content, ctx) {
  return `<section id="formation">
${sectionHeading('formation', content, ctx)}

      <!-- Layout : timeline à gauche, cartes à droite -->
      <div class="formation-layout">

        <!-- COLONNE GAUCHE : Timeline -->
        <div class="timeline">

${renderTimeline(content, ctx)}

        </div>

        <!-- COLONNE DROITE : Cartes 3D tilt -->
        <div class="cards-column">

${renderCards(content, ctx)}

        </div>
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
