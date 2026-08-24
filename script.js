/* ================================================
   JORDAN DE SOUZA — PORTFOLIO
   ================================================ */

// Empêcher le navigateur de restaurer une position de scroll précédente au rechargement
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

/* -------- CURSEUR PERSONNALISÉ (Souris uniquement) -------- */
const isFinePointer = window.matchMedia('(pointer: fine)').matches;

if (isFinePointer) {
  const cursor    = document.getElementById('cursor');
  const cursorDot = document.getElementById('cursorDot');
  let mouseX = 0, mouseY = 0;
  let curX   = 0, curY   = 0;
  let isRunning = false;

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (cursorDot) {
      cursorDot.style.left = mouseX - 2 + 'px';
      cursorDot.style.top  = mouseY - 2 + 'px';
    }
    if (!isRunning) {
      isRunning = true;
      requestAnimationFrame(animateCursor);
    }
  });

  function animateCursor() {
    if (!cursor) return;
    curX += (mouseX - curX) * 0.12;
    curY += (mouseY - curY) * 0.12;
    cursor.style.left = curX - 10 + 'px';
    cursor.style.top  = curY - 10 + 'px';

    const dx = Math.abs(mouseX - curX);
    const dy = Math.abs(mouseY - curY);

    // Arrête la boucle si le curseur est stabilisé pour économiser le CPU
    if (dx > 0.1 || dy > 0.1) {
      requestAnimationFrame(animateCursor);
    } else {
      isRunning = false;
    }
  }

  document.querySelectorAll('a, button, .skill-tag, .project-card, .sec-card, .card-3d-wrap, .form-input, .form-textarea').forEach(el => {
    el.addEventListener('mouseenter', () => {
      if (cursor) {
        cursor.style.transform   = 'scale(2)';
        cursor.style.borderColor = 'var(--cyan)';
      }
    });
    el.addEventListener('mouseleave', () => {
      if (cursor) {
        cursor.style.transform   = 'scale(1)';
        cursor.style.borderColor = 'var(--green)';
      }
    });
  });
}


/* ==========================================
   INTERNATIONALISATION (FR / EN)
=========================================== */
const translations = {
  fr: {
    boot_skip: "[ESC] PASSER_BOOT.sh",
    boot_1: "BIOS v2.4.1 — SECURE BOOT ENABLED",
    boot_2: "Loading kernel modules...",
    boot_3: "WARNING: Unauthorized access detected",
    boot_4: "ALERT: Intrusion attempt blocked by firewall",
    boot_5: "Authenticating user:",
    boot_6: "Mounting filesystem... OK",
    boot_7: "Starting portfolio daemon... OK",
    boot_8: "✓ System ready. Welcome, Jordan.",
    nav_home: "./home",
    nav_skills: "./skills",
    nav_projects: "./projects",
    nav_formation: "./formation",
    nav_contact: "./contact",
    hero_greeting: "// IDENTIFICATION DU SYSTÈME",
    hero_title: "Étudiant en Sciences du Numérique & Passionné de Cybersécurité",
    hero_bio: "Je construis des applications web et je les défends. De l'écriture du code à la configuration de sécurité opérationnelle, je conçois des solutions numériques robustes face aux menaces actuelles.",
    hero_cta_contact: "INITIER CONTACT",
    hero_cta_formation: "MON PARCOURS",
    hero_cta_cv: "TÉLÉCHARGER CV",
    hero_cta_social: "RÉSEAUX",
    t_status: "Project hunting",
    t_skill1: "→ Vulnerability Analysis",
    t_skill2: "→ Penetration Testing",
    t_skill3: "→ Network Security",
    t_skill4: "→ Python / Node.js / C",
    t_skill5: "→ Web Development",
    t_cmd_ping: "ping recruteur",
    skills_label: "competences",
    skills_title: "Arsenal<br>Technique",
    skill_sec_title: "Sécurité",
    skill_sec_1: "Analyse de vulnérabilités",
    skill_sec_2: "Test d'intrusion",
    skill_sec_3: "Cybercriminalité",
    skill_sec_4: "Threat Landscape",
    skill_dev_title: "Développement",
    skill_sys_title: "Systèmes & Réseaux",
    skill_sys_1: "Administration systèmes",
    skill_sys_2: "Réseaux informatiques",
    skill_sys_3: "Maintenance matérielle",
    skill_sys_4: "Support technique",
    skill_soft_title: "Soft Skills",
    skill_soft_1: "Gestion de projet",
    skill_soft_2: "Travail sous pression",
    skill_soft_3: "Communication",
    skill_soft_4: "Marketing digital",
    skill_soft_5: "Création de contenu",
    projects_label: "projets personnels",
    projects_title: "Projets &<br>Réalisations",
    proj1_title: "Scanner Réseau",
    proj1_desc: "Développement d'un scanner réseau en Python capable de détecter les hôtes actifs, les ports ouverts et les services disponibles sur un réseau donné.",
    proj2_title: "Analyse de Vulnérabilités",
    proj2_desc: "Simulation de tests d'intrusion sur un environnement de lab contrôlé, appliquant les méthodologies des certifications CCEP et Fortinet.",
    proj3_title: "Générateur de faux trafics internet",
    proj3_desc: "Script en Python permettant de simuler du faux trafic internet en modifiant les en-têtes HTTP, le Referer, le comportement TCP et l'adresse IP une fois couplé à un VPN.",
    proj3_stack: "Sécurité Offensive",
    proj4_title: "Script de Sécurité Réseau",
    proj4_desc: "Outil de monitoring réseau en Python permettant la détection d'anomalies de trafic, en approfondissement des cours de sécurité informatique.",
    proj5_title: "Mise en place d'un intranet avec Nextcloud",
    proj5_desc: "Déploiement, configuration et sécurisation complète d'un serveur Nextcloud interne visant à offrir un intranet collaboratif souverain.",
    proj5_stack: "Sécurité Web",
    proj6_title: "WAF avec ModSecurity",
    proj6_desc: "Mise en place d'un Pare-Feu Applicatif Web (WAF) avec ModSecurity pour filtrer, monitorer et bloquer le trafic HTTP malveillant ciblant les vulnérabilités OWASP.",
    proj6_stack: "Sécurité Web",
    proj_btn_code: "▶ VOIR_CODE.git",
    proj_btn_report: "▶ RAPPORT_LAB.sh",
    proj_btn_script: "▶ VOIR_SCRIPT.py",
    proj_btn_arch: "▶ ARCHITECTURE.md",
    proj_btn_rules: "▶ REGLES_WAF.conf",
    formation_label: "parcours",
    formation_title: "Formation &<br>Expériences",
    timeline_role_stage: "Stage DevSecOps Junior",
    timeline_desc_stage: "Mise en place de solutions de sécurité réseau, incluant des WAF (ModSecurity), des systèmes de détection d'intrusion (IDS/IPS), et la gestion sécurisée des identités et des accès. Analyse de code statique, de dépendances, Tests de sécurité dynamiques, Gestion des secrets, Monitoring & réponse aux incidents.",
    timeline_role_licence: "Licence Sécurité Informatique",
    timeline_desc_licence: "Formation axée sur la cybersécurité, les réseaux et la gestion des systèmes d'information.",
    timeline_role_benevole: "Bénévole — Communication & Événementiel",
    timeline_benevole_1: "Organisation et coordination du FESTICHILL",
    timeline_benevole_2: "Marketing digital et communication d'entreprise",
    timeline_benevole_3: "Gestion du booking et accompagnement d'artistes",
    timeline_benevole_4: "Gestion du stress et du travail sous pression",
    timeline_role_bac: "Baccalauréat Série D",
    timeline_desc_bac: "Obtention du Baccalauréat série scientifique.",
    badge_formation: "Formation",
    card_licence_title: "Licence Sécurité Informatique",
    lbl_progression: "PROGRESSION",
    val_terminee: "Terminé",
    tag_cyber: "Cybersécurité",
    tag_reseaux: "Réseaux",
    badge_experience: "Expérience",
    card_exp_title: "Bénévole Comm. & Évén.",
    card_exp_date: "06/2024 — AUJOURD'HUI",
    tag_event: "Événementiel",
    badge_certif: "Certification",
    val_obtenu: "OBTENU",
    lbl_accreditation: "ACCRÉDITATION",
    val_certifie: "CERTIFIÉ",
    lbl_domaine: "DOMAINE",
    contact_label: "transmission",
    contact_title: "Initier<br>Contact",
    contact_desc: "Je suis toujours ouvert à discuter de nouvelles opportunités, de projets créatifs ou de partenariats. Que vous ayez un projet spécifique en tête ou que vous souhaitiez explorer des possibilités, n'hésitez pas à me contacter.",
    contact_phone_lbl: "TÉLÉPHONE",
    contact_loc_lbl: "LOCALISATION",
    contact_success: "✓ Message envoyé ! Je te répondrai rapidement.",
    contact_error: "❌ Erreur réseau, réessaie plus tard.",
    form_name_lbl: "nom",
    form_name_ph: "Votre nom...",
    form_email_lbl: "email",
    form_email_ph: "votre@email.com",
    form_msg_lbl: "message",
    form_msg_ph: "Votre message...",
    form_submit_btn: "▶ ENVOYER_MESSAGE.sh",
    footer_rights: "© 2025 Jordan de SOUZA — Tous droits réservés"
  },

  en: {
    boot_skip: "[ESC] SKIP_BOOT.sh",
    boot_1: "BIOS v2.4.1 — SECURE BOOT ENABLED",
    boot_2: "Loading kernel modules...",
    boot_3: "WARNING: Unauthorized access detected",
    boot_4: "ALERT: Intrusion attempt blocked by firewall",
    boot_5: "Authenticating user:",
    boot_6: "Mounting filesystem... OK",
    boot_7: "Starting portfolio daemon... OK",
    boot_8: "✓ System ready. Welcome, Jordan.",
    nav_home: "./home",
    nav_skills: "./skills",
    nav_projects: "./projects",
    nav_formation: "./education",
    nav_contact: "./contact",
    hero_greeting: "// SYSTEM IDENTIFICATION",
    hero_title: "Digital Sciences Student & Cybersecurity Enthusiast",
    hero_bio: "I build web applications and defend them. From writing code to operational security hardening, I engineer resilient digital solutions against modern threats.",
    hero_cta_contact: "INITIATE CONTACT",
    hero_cta_formation: "MY JOURNEY",
    hero_cta_cv: "DOWNLOAD CV",
    hero_cta_social: "SOCIALS",
    t_status: "Project hunting",
    t_skill1: "→ Vulnerability Analysis",
    t_skill2: "→ Penetration Testing",
    t_skill3: "→ Network Security",
    t_skill4: "→ Python / Node.js / C",
    t_skill5: "→ Web Development",
    t_cmd_ping: "ping recruiter",
    skills_label: "skills",
    skills_title: "Technical<br>Arsenal",
    skill_sec_title: "Security",
    skill_sec_1: "Vulnerability Analysis",
    skill_sec_2: "Penetration Testing",
    skill_sec_3: "Cybercrime Investigation",
    skill_sec_4: "Threat Landscape",
    skill_dev_title: "Development",
    skill_sys_title: "Systems & Networks",
    skill_sys_1: "System Administration",
    skill_sys_2: "Computer Networks",
    skill_sys_3: "Hardware Maintenance",
    skill_sys_4: "Technical Support",
    skill_soft_title: "Soft Skills",
    skill_soft_1: "Project Management",
    skill_soft_2: "Working Under Pressure",
    skill_soft_3: "Communication",
    skill_soft_4: "Digital Marketing",
    skill_soft_5: "Content Creation",
    projects_label: "personal projects",
    projects_title: "Projects &<br>Achievements",
    proj1_title: "Network Scanner",
    proj1_desc: "Development of a Python network scanner capable of discovering active hosts, open ports, and running services across a local subnet.",
    proj2_title: "Vulnerability Analysis",
    proj2_desc: "Penetration testing simulation on a controlled laboratory environment, implementing CCEP and Fortinet certification methodologies.",
    proj3_title: "Internet Traffic Generator",
    proj3_desc: "Python script designed to simulate deceptive web traffic by randomizing HTTP headers, Referer, TCP fingerprints and IPs over VPN routing.",
    proj3_stack: "Offensive Security",
    proj4_title: "Network Security Script",
    proj4_desc: "Network monitoring tool in Python for abnormal traffic anomaly detection, building upon computer security coursework.",
    proj5_title: "Intranet Deployment with Nextcloud",
    proj5_desc: "Deployment, full configuration and security hardening of an internal Nextcloud server delivering a sovereign collaborative intranet.",
    proj5_stack: "Web Security",
    proj6_title: "WAF with ModSecurity",
    proj6_desc: "Implementation of a Web Application Firewall (WAF) using ModSecurity to inspect, monitor, and mitigate malicious HTTP payloads targeting OWASP vulnerabilities.",
    proj6_stack: "Web Security",
    proj_btn_code: "▶ VIEW_CODE.git",
    proj_btn_report: "▶ LAB_REPORT.sh",
    proj_btn_script: "▶ VIEW_SCRIPT.py",
    proj_btn_arch: "▶ ARCHITECTURE.md",
    proj_btn_rules: "▶ WAF_RULES.conf",
    formation_label: "journey",
    formation_title: "Education &<br>Experience",
    timeline_role_stage: "Junior DevSecOps Intern",
    timeline_desc_stage: "Deployment of network security solutions, including WAFs (ModSecurity), intrusion detection systems (IDS/IPS), and IAM access governance. Static code & dependency analysis, Dynamic security testing, Secrets management, Incident response & telemetry monitoring.",
    timeline_role_licence: "Bachelor in Computer Security",
    timeline_desc_licence: "Specialized curriculum covering cybersecurity, enterprise networking, and information systems administration.",
    timeline_role_benevole: "Volunteer — Communication & Events",
    timeline_benevole_1: "Organization and event coordination for FESTICHILL",
    timeline_benevole_2: "Corporate communication and digital marketing strategy",
    timeline_benevole_3: "Artist booking management and backstage assistance",
    timeline_benevole_4: "Stress management and high-pressure operational execution",
    timeline_role_bac: "High School Scientific Baccalaureate (Series D)",
    timeline_desc_bac: "Graduated in scientific curriculum (mathematics & life sciences).",
    badge_formation: "Education",
    card_licence_title: "Bachelor in Computer Security",
    lbl_progression: "PROGRESSION",
    val_terminee: "Completed",
    tag_cyber: "Cybersecurity",
    tag_reseaux: "Networking",
    badge_experience: "Experience",
    card_exp_title: "Volunteer Comm. & Events",
    card_exp_date: "06/2024 — PRESENT",
    tag_event: "Events",
    badge_certif: "Certification",
    val_obtenu: "EARNED",
    lbl_accreditation: "ACCREDITATION",
    val_certifie: "CERTIFIED",
    lbl_domaine: "DOMAIN",
    contact_label: "transmission",
    contact_title: "Initiate<br>Contact",
    contact_desc: "I am always open to discussing new opportunities, creative projects, or cybersecurity partnerships. Whether you have a specific initiative in mind or wish to explore synergies, feel free to reach out.",
    contact_phone_lbl: "PHONE",
    contact_loc_lbl: "LOCATION",
    contact_success: "✓ Message sent! I will get back to you shortly.",
    contact_error: "❌ Network error, please try again later.",
    form_name_lbl: "name",
    form_name_ph: "Your name...",
    form_email_lbl: "email",
    form_email_ph: "your@email.com",
    form_msg_lbl: "message",
    form_msg_ph: "Your message...",
    form_submit_btn: "▶ SEND_MESSAGE.sh",
    footer_rights: "© 2025 Jordan de SOUZA — All rights reserved"
  }
};

function setLanguage(lang) {
  if (!translations[lang]) lang = 'fr';
  localStorage.setItem('portfolio_lang', lang);
  document.documentElement.lang = lang;

  // Traduction des textes avec data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang] && translations[lang][key] !== undefined) {
      el.innerHTML = translations[lang][key];
    }
  });

  // Traduction des placeholders avec data-i18n-placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (translations[lang] && translations[lang][key] !== undefined) {
      el.placeholder = translations[lang][key];
    }
  });

  // Mise à jour de l'état actif sur les boutons de switch
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });
}

// Initialisation de la langue : préférence utilisateur > langue du navigateur > français
const savedLang = localStorage.getItem('portfolio_lang');
const browserLang = (navigator.language || navigator.userLanguage || 'fr').toLowerCase();
const initialLang = savedLang ? savedLang : (browserLang.startsWith('en') ? 'en' : 'fr');
setLanguage(initialLang);

// Écouteur sur les boutons de changement de langue
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetLang = btn.getAttribute('data-lang');
    setLanguage(targetLang);
  });
});


/* -------- BOOT SCREEN (Avec mémorisation de session & Skip) -------- */
const bootScreen = document.getElementById('boot-screen');
const btnSkipBoot = document.getElementById('btn-skip-boot');

function dismissBootScreen() {
  if (!bootScreen || bootScreen.classList.contains('fade-out')) return;
  window.scrollTo(0, 0);
  bootScreen.classList.add('fade-out');
  sessionStorage.setItem('portfolio_boot_seen', 'true');
  setTimeout(() => {
    if (bootScreen) bootScreen.remove();
  }, 800);
}

if (bootScreen) {
  if (sessionStorage.getItem('portfolio_boot_seen') === 'true') {
    // Déjà vu pendant cette session : suppression immédiate
    bootScreen.remove();
  } else {
    // Premier chargement : timer de 3.2s
    const bootTimer = setTimeout(dismissBootScreen, 3200);

    if (btnSkipBoot) {
      btnSkipBoot.addEventListener('click', () => {
        clearTimeout(bootTimer);
        dismissBootScreen();
      });
    }

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        clearTimeout(bootTimer);
        dismissBootScreen();
      }
    });
  }
}


/* -------- NAVIGATION RESPONSIVE MOBILE -------- */
const navToggle = document.getElementById('navToggle');
const navLinks  = document.getElementById('navLinks');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.classList.toggle('open', isOpen);
    navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  // Fermer le menu lors du clic sur un lien de navigation
  document.querySelectorAll('.nav-link-item').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}


/* -------- PILE DE RÉSEAUX SOCIAUX DÉPLOYABLE -------- */
const socialStackContainer = document.getElementById('socialStackContainer');
const socialTriggerBtn     = document.getElementById('socialTriggerBtn');
const socialLinksPile      = document.getElementById('socialLinksPile');

if (socialStackContainer && socialTriggerBtn) {
  socialTriggerBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = socialStackContainer.classList.toggle('open');
    socialTriggerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (socialLinksPile) {
      socialLinksPile.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    }
  });

  // Fermer la pile si clic en dehors
  document.addEventListener('click', e => {
    if (!socialStackContainer.contains(e.target)) {
      socialStackContainer.classList.remove('open');
      socialTriggerBtn.setAttribute('aria-expanded', 'false');
      if (socialLinksPile) {
        socialLinksPile.setAttribute('aria-hidden', 'true');
      }
    }
  });
}


/* -------- SMOOTH SCROLL -------- */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const href = link.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});


/* -------- GESTION DU FORMULAIRE FORMSPREE -------- */
const contactForm = document.getElementById('fs-form');
const submitBtn   = document.getElementById('fs-submit-btn');

if (window.formspree) {
  formspree('initForm', {
    formElement: '#fs-form',
    formId: 'xpqbjwpo',
    onSuccess: function() {
      if (submitBtn) {
        submitBtn.textContent      = '✓ MESSAGE_ENVOYÉ.sh';
        submitBtn.style.background = 'var(--green)';
        submitBtn.style.color      = 'var(--bg)';
        setTimeout(() => {
          submitBtn.textContent      = '▶ ENVOYER_MESSAGE.sh';
          submitBtn.style.background = '';
          submitBtn.style.color      = '';
        }, 4000);
      }
    }
  });
} else if (contactForm) {
  // Fallback au cas où le script externe Formspree met du temps à se charger
  contactForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (submitBtn) {
      submitBtn.textContent = '... ENVOI_EN_COURS.sh';
      submitBtn.disabled = true;
    }
    const formData = new FormData(contactForm);
    try {
      const res = await fetch('https://formspree.io/f/xpqbjwpo', {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' }
      });
      const successDiv = document.querySelector('[data-fs-success]');
      const errorDiv   = document.querySelector('[data-fs-error]');

      if (res.ok) {
        if (successDiv) successDiv.style.display = 'block';
        if (errorDiv)   errorDiv.style.display   = 'none';
        contactForm.reset();
        if (submitBtn) {
          submitBtn.textContent      = '✓ MESSAGE_ENVOYÉ.sh';
          submitBtn.style.background = 'var(--green)';
          submitBtn.style.color      = 'var(--bg)';
        }
      } else {
        if (errorDiv) errorDiv.style.display = 'block';
      }
    } catch (err) {
      const errorDiv = document.querySelector('[data-fs-error]');
      if (errorDiv) errorDiv.style.display = 'block';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        setTimeout(() => {
          submitBtn.textContent      = '▶ ENVOYER_MESSAGE.sh';
          submitBtn.style.background = '';
          submitBtn.style.color      = '';
        }, 4000);
      }
    }
  });
}


/* -------- TIMELINE — SCROLL ANIMATION -------- */
const timelineObserver = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animationPlayState = 'running';
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('.timeline-item').forEach(item => {
  item.style.animationPlayState = 'paused';
  timelineObserver.observe(item);
});


/* -------- CARTES 3D TILT -------- */
document.querySelectorAll('.card-3d-wrap').forEach(wrap => {
  const inner = wrap.querySelector('.card-3d-inner');
  const shine = wrap.querySelector('.shine-layer');
  if (!inner) return;

  const MAX_TILT = 14;

  wrap.addEventListener('mousemove', e => {
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width  / 2;
    const cy = rect.height / 2;

    const rotX = ((y - cy) / cy) * -MAX_TILT;
    const rotY = ((x - cx) / cx) *  MAX_TILT;

    inner.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.02, 1.02, 1.02)`;

    if (shine) {
      const px = ((x / rect.width)  * 100).toFixed(1);
      const py = ((y / rect.height) * 100).toFixed(1);
      shine.style.setProperty('--mx', px + '%');
      shine.style.setProperty('--my', py + '%');
    }
  });

  wrap.addEventListener('mouseleave', () => {
    inner.style.transition = 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
    inner.style.transform  = 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    setTimeout(() => {
      inner.style.transition = 'transform 0.08s linear';
    }, 500);
  });

  wrap.addEventListener('mouseenter', () => {
    inner.style.transition = 'transform 0.08s linear';
  });
});


/* -------- PROGRESS BARS — SCROLL TRIGGER -------- */
const barObserver = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animationPlayState = 'running';
        barObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.3 }
);

document.querySelectorAll('.progress-bar-fill').forEach(bar => {
  bar.style.animationPlayState = 'paused';
  barObserver.observe(bar);
});


/* -------- LECTEUR AUDIO D'AMBIANCE (Cyber Ambient Player) -------- */
const audioPlayer  = document.getElementById('audioPlayer');
const audioPlayBtn = document.getElementById('audioPlayBtn');
const playIcon     = document.getElementById('playIcon');
const audioMuteBtn = document.getElementById('audioMuteBtn');
const muteIcon     = document.getElementById('muteIcon');
const bgmAudio     = document.getElementById('bgmAudio');

if (bgmAudio && audioPlayer) {
  // Volume doux par défaut (30%)
  bgmAudio.volume = 0.3;

  function playAudio() {
    bgmAudio.play().then(() => {
      audioPlayer.classList.add('playing');
      if (playIcon) playIcon.textContent = '❚❚';
    }).catch(() => {
      // Autoplay restreint par la politique du navigateur avant interaction
      audioPlayer.classList.remove('playing');
      if (playIcon) playIcon.textContent = '▶';
    });
  }

  function pauseAudio() {
    bgmAudio.pause();
    audioPlayer.classList.remove('playing');
    if (playIcon) playIcon.textContent = '▶';
  }

  function toggleAudio() {
    if (bgmAudio.paused) {
      playAudio();
    } else {
      pauseAudio();
    }
  }

  if (audioPlayBtn) {
    audioPlayBtn.addEventListener('click', toggleAudio);
  }

  if (audioMuteBtn) {
    audioMuteBtn.addEventListener('click', () => {
      bgmAudio.muted = !bgmAudio.muted;
      if (muteIcon) {
        muteIcon.textContent = bgmAudio.muted ? '🔇' : '🔊';
      }
    });
  }

  // Démarrage doux de l'ambiance dès la première interaction utilisateur
  let userInteracted = false;
  function startOnFirstInteraction() {
    if (userInteracted) return;
    userInteracted = true;
    playAudio();
    window.removeEventListener('click', startOnFirstInteraction);
    window.removeEventListener('keydown', startOnFirstInteraction);
    window.removeEventListener('touchstart', startOnFirstInteraction);
  }

  window.addEventListener('click', startOnFirstInteraction, { once: true });
  window.addEventListener('keydown', startOnFirstInteraction, { once: true });
  window.addEventListener('touchstart', startOnFirstInteraction, { once: true });
}
