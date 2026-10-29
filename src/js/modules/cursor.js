/* -------- CURSEUR PERSONNALISÉ (Souris uniquement) -------- */

// Éléments interactifs qui agrandissent le curseur au survol
const HOVER_TARGETS = 'a, button, .skill-tag, .project-card, .sec-card, .card-3d-wrap, .form-input, .form-textarea';

export function initCursor() {
  const isFinePointer = window.matchMedia('(pointer: fine)').matches;
  if (!isFinePointer) return;

  const cursor    = document.getElementById('cursor');
  const cursorDot = document.getElementById('cursorDot');
  let mouseX = 0, mouseY = 0;
  let curX   = 0, curY   = 0;
  let isRunning = false;

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

  document.querySelectorAll(HOVER_TARGETS).forEach(el => {
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
