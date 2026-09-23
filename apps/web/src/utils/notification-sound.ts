const NOTIFICATION_SOUND_URL = "/sounds/web-whatsapp.mp3";

function playGeneratedNotificationFallback(): void {
  const audioWindow = window as Window &
    typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
  const AudioContextClass =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 740;
  gain.gain.value = 0.06;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
  oscillator.addEventListener("ended", () => void context.close());
}

export function playNotificationTone(): void {
  const audio = new Audio(NOTIFICATION_SOUND_URL);
  audio.volume = 0.55;
  void audio.play().catch(() => playGeneratedNotificationFallback());
}
