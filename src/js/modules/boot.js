/* -------- BOOT SCREEN (Avec mémorisation de session & Skip) -------- */

const SESSION_KEY = 'portfolio_boot_seen';
const BOOT_DURATION_MS = 3200;

export function initBoot() {
  const bootScreen = document.getElementById('boot-screen');
  const btnSkipBoot = document.getElementById('btn-skip-boot');

  function dismissBootScreen() {
    if (!bootScreen || bootScreen.classList.contains('fade-out')) return;
    window.scrollTo(0, 0);
    bootScreen.classList.add('fade-out');
    sessionStorage.setItem(SESSION_KEY, 'true');
    setTimeout(() => {
      if (bootScreen) bootScreen.remove();
    }, 800);
  }

  if (!bootScreen) return;

  if (sessionStorage.getItem(SESSION_KEY) === 'true') {
    // Déjà vu pendant cette session : suppression immédiate
    bootScreen.remove();
    return;
  }

  // Premier chargement : timer de 3.2s
  const bootTimer = setTimeout(dismissBootScreen, BOOT_DURATION_MS);

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
