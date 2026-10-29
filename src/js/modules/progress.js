/* -------- PROGRESS BARS — SCROLL TRIGGER -------- */

export function initProgress() {
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
}
