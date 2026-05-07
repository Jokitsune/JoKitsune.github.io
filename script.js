/* ================================================
   JORDAN DE SOUZA — PORTFOLIO
   script.js
   ================================================ */


/* -------- CURSEUR PERSONNALISÉ -------- */
const cursor    = document.getElementById('cursor');
const cursorDot = document.getElementById('cursorDot');
let mouseX = 0, mouseY = 0;
let curX   = 0, curY   = 0;

document.addEventListener('mousemove', e => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  cursorDot.style.left = mouseX - 2 + 'px';
  cursorDot.style.top  = mouseY - 2 + 'px';
});

function animateCursor() {
  curX += (mouseX - curX) * 0.12;
  curY += (mouseY - curY) * 0.12;
  cursor.style.left = curX - 10 + 'px';
  cursor.style.top  = curY - 10 + 'px';
  requestAnimationFrame(animateCursor);
}
animateCursor();

document.querySelectorAll('a, button, .skill-tag, .project-card, .certif-card, .card-3d-wrap').forEach(el => {
  el.addEventListener('mouseenter', () => {
    cursor.style.transform   = 'scale(2)';
    cursor.style.borderColor = 'var(--cyan)';
  });
  el.addEventListener('mouseleave', () => {
    cursor.style.transform   = 'scale(1)';
    cursor.style.borderColor = 'var(--green)';
  });
});


/* -------- BOOT SCREEN -------- */
setTimeout(() => {
  const bootScreen = document.getElementById('boot-screen');
  bootScreen.classList.add('fade-out');
  setTimeout(() => bootScreen.remove(), 800);
}, 3000);


/* -------- SMOOTH SCROLL -------- */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
});


/* -------- FORMULAIRE -------- */
function handleSubmit() {
  const btn = document.querySelector('.form-submit');
  btn.textContent      = '✓ MESSAGE_ENVOYÉ.sh';
  btn.style.background = 'var(--green)';
  btn.style.color      = 'var(--bg)';
  setTimeout(() => {
    btn.textContent      = '▶ ENVOYER_MESSAGE.sh';
    btn.style.background = '';
    btn.style.color      = '';
  }, 3000);
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
/*
 * Effet de tilt 3D au survol inspiré de uiverse.io/Javierrocadev/jolly-chipmunk-45
 * - Rotation X/Y proportionnelle à la position de la souris
 * - Couche de reflet (shine) qui suit le curseur
 * - Retour à zéro en douceur au départ de la souris
 */
document.querySelectorAll('.card-3d-wrap').forEach(wrap => {
  const inner = wrap.querySelector('.card-3d-inner');
  const shine = wrap.querySelector('.shine-layer');

  const MAX_TILT = 14; // degrés max de rotation

  wrap.addEventListener('mousemove', e => {
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width  / 2;
    const cy = rect.height / 2;

    // Rotation : axe X inversé pour un effet naturel
    const rotX = ((y - cy) / cy) * -MAX_TILT;
    const rotY = ((x - cx) / cx) *  MAX_TILT;

    inner.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.02, 1.02, 1.02)`;

    // Reflet suit la souris
    const px = ((x / rect.width)  * 100).toFixed(1);
    const py = ((y / rect.height) * 100).toFixed(1);
    shine.style.setProperty('--mx', px + '%');
    shine.style.setProperty('--my', py + '%');
  });

  wrap.addEventListener('mouseleave', () => {
    inner.style.transition = 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
    inner.style.transform  = 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    // Réinitialise la transition rapide pour le prochain survol
    setTimeout(() => {
      inner.style.transition = 'transform 0.08s linear';
    }, 500);
  });

  wrap.addEventListener('mouseenter', () => {
    inner.style.transition = 'transform 0.08s linear';
  });
});


/* -------- PROGRESS BARS — SCROLL TRIGGER -------- */
/*
 * Les barres de progression s'animent au scroll
 * pour un effet d'apparition cohérent avec la timeline
 */
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
