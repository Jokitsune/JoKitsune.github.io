/* -------- TIMELINE — SCROLL ANIMATION -------- */

export function initTimeline() {
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
}
