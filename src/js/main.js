/* ================================================
   JORDAN DE SOUZA — PORTFOLIO
   Point d'entrée client : initialise les modules dans l'ordre d'origine.
   ================================================ */

import { resetScrollPosition, initSmoothScroll } from './modules/scroll.js';
import { initCursor } from './modules/cursor.js';
import { initI18n } from './modules/i18n.js';
import { initBoot } from './modules/boot.js';
import { initNav } from './modules/nav.js';
import { initSocial } from './modules/social.js';
import { initContact } from './modules/contact.js';
import { initTimeline } from './modules/timeline.js';
import { initTilt } from './modules/tilt.js';
import { initProgress } from './modules/progress.js';
import { initAudio } from './modules/audio.js';
// Généré au build depuis content/*.json par le plugin Vite (src/vite/portfolio-content-plugin.js)
import content from 'virtual:portfolio-content';

resetScrollPosition();
initCursor();
initI18n(content.dictionary, { defaultLang: content.defaultLang });
initBoot();
initNav();
initSocial();
initSmoothScroll();
initContact({ formId: content.formspreeId, status: content.formStatus });
initTimeline();
initTilt();
initProgress();
initAudio({ volume: content.audioVolume });
