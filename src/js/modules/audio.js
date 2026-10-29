/* -------- LECTEUR AUDIO D'AMBIANCE (Cyber Ambient Player) -------- */

/**
 * @param {{ volume?: number }} [options]
 */
export function initAudio({ volume = 0.3 } = {}) {
  const audioPlayer  = document.getElementById('audioPlayer');
  const audioPlayBtn = document.getElementById('audioPlayBtn');
  const playIcon     = document.getElementById('playIcon');
  const audioMuteBtn = document.getElementById('audioMuteBtn');
  const muteIcon     = document.getElementById('muteIcon');
  const bgmAudio     = document.getElementById('bgmAudio');

  if (!bgmAudio || !audioPlayer) return;

  // Volume doux par défaut (30%)
  bgmAudio.volume = volume;

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
