/* -------- PILE DE RÉSEAUX SOCIAUX DÉPLOYABLE -------- */

export function initSocial() {
  const socialStackContainer = document.getElementById('socialStackContainer');
  const socialTriggerBtn     = document.getElementById('socialTriggerBtn');
  const socialLinksPile      = document.getElementById('socialLinksPile');
  if (!socialStackContainer || !socialTriggerBtn) return;

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
