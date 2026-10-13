let audioCtx: AudioContext | null = null;
let loopTimerId: ReturnType<typeof setInterval> | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

export function playChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);

  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.linearRampToValueAtTime(0.45, now + 0.015);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, now);
  osc1.connect(masterGain);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1760, now);
  osc2.connect(masterGain);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 1.15);
  osc2.stop(now + 1.15);
}

export function startAlarmLoop(): void {
  if (loopTimerId !== null) return;
  playChime();
  loopTimerId = setInterval(() => {
    playChime();
  }, 1500);
}

export function stopAlarmLoop(): void {
  if (loopTimerId !== null) {
    clearInterval(loopTimerId);
    loopTimerId = null;
  }
}

export function isRinging(): boolean {
  return loopTimerId !== null;
}
