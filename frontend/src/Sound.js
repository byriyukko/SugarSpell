let ctx;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Short electronic "text tick", one per letter. */
export function blip(volume = 0.5, pitch = 440) {
  if (volume <= 0) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  const t = c.currentTime;
  osc.type = 'square';
  osc.frequency.value = pitch * (0.92 + Math.random() * 0.2);
  gain.gain.setValueAtTime(0.2 * volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.07);
}

export const SFX = {
  click:   '/audio/click.mp3',
  coin:    '/audio/coins.mp3',
  correct: '/audio/correct.mp3',
  wrong:   '/audio/wrong.mp3',
  late:    '/audio/late.mp3',
  fanfare: '/audio/fanfare.mp3',
  stir:    '/audio/stirCauldron.mp3',
};

export function playSfx(src, volume = 0.7) {
  if (volume <= 0) return null;
  const audio = new Audio(src);
  audio.volume = volume;
  audio.play().catch(() => {});
  return audio;
}

/** Plays now; if the browser blocks it, plays on the first click or key press. Returns a cleanup function. */
/** Plays now; if the browser blocks it, plays on the first click or key press. Returns a cleanup function. */
export function playWhenAllowed(audio) {
  let cancelled = false;

  const remove = () => {
    document.removeEventListener('click', start);
    document.removeEventListener('keydown', start);
  };

  function start() {
    remove();
    audio.play().catch(() => {});
  }

  audio.play().catch((err) => {
    
    if (cancelled || err?.name !== 'NotAllowedError') return;
    document.addEventListener('click', start);
    document.addEventListener('keydown', start);
  });

  return () => {
    cancelled = true;
    remove();
  };
}