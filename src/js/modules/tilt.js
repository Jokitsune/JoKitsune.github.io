/* -------- CARTES 3D TILT -------- */

const MAX_TILT = 14;

export function initTilt() {
  document.querySelectorAll('.card-3d-wrap').forEach(wrap => {
    const inner = wrap.querySelector('.card-3d-inner');
    const shine = wrap.querySelector('.shine-layer');
    if (!inner) return;

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
}
