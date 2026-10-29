/* -------- GESTION DU FORMULAIRE FORMSPREE -------- */

// Envoi par fetch natif vers formspree.io : aucun script tiers n'est chargé sur
// l'origine du site (qui héberge aussi /admin). Comportement visible inchangé.

// Libellés du bouton d'envoi pendant/après l'envoi.
// NB : comportement d'origine conservé — ces libellés ne sont pas traduits.
const DEFAULT_STATUS = {
  sending: '... ENVOI_EN_COURS.sh',
  sent: '✓ MESSAGE_ENVOYÉ.sh',
  idle: '▶ ENVOYER_MESSAGE.sh'
};

/**
 * @param {{ formId: string, status?: { sending: string, sent: string, idle: string } }} options
 */
export function initContact({ formId, status = DEFAULT_STATUS }) {
  const contactForm = document.getElementById('fs-form');
  const submitBtn   = document.getElementById('fs-submit-btn');
  if (!contactForm) return;

  contactForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (submitBtn) {
      submitBtn.textContent = status.sending;
      submitBtn.disabled = true;
    }
    const formData = new FormData(contactForm);
    const successDiv = document.querySelector('[data-fs-success]');
    const errorDiv   = document.querySelector('div[data-fs-error]');
    try {
      const res = await fetch(`https://formspree.io/f/${encodeURIComponent(formId)}`, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        if (successDiv) successDiv.style.display = 'block';
        if (errorDiv)   errorDiv.style.display   = 'none';
        contactForm.reset();
        if (submitBtn) {
          submitBtn.textContent      = status.sent;
          submitBtn.style.background = 'var(--green)';
          submitBtn.style.color      = 'var(--bg)';
        }
      } else if (errorDiv) {
        errorDiv.style.display = 'block';
      }
    } catch {
      if (errorDiv) errorDiv.style.display = 'block';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        setTimeout(() => {
          submitBtn.textContent      = status.idle;
          submitBtn.style.background = '';
          submitBtn.style.color      = '';
        }, 4000);
      }
    }
  });
}
