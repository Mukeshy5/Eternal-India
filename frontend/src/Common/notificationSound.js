import notificationRing from "../assets/Notification Ring/notification-ring.mp3";

// One handler owns audio and ID deduplication for the mounted workspace.
export function createNotificationSound({ onState = () => {}, onNotice = () => {} } = {}) {
  let context, buffer, decoding, fallback, fallbackUnlocked = false, disposed = false, unlocking;
  const played = new Set(), active = new Set();
  async function initialize() {
    if (disposed) return false;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        context ||= new AudioContext();
        // Resume within the gesture, before awaiting any network work.
        if (context.state !== "running") await context.resume();
        if (disposed || context.state !== "running") return false;
        if (!decoding) decoding = fetch(notificationRing).then((reply) => {
          if (!reply.ok) throw new Error("Notification audio could not be loaded.");
          return reply.arrayBuffer();
        }).then((bytes) => context.decodeAudioData(bytes)).then((decoded) => { buffer = decoded; }).catch((failure) => {
          console.warn("Notification ring unavailable; using the built-in bell:", failure.message);
          if (!disposed) onNotice("Using the built-in notification bell.");
        });
      } else {
        fallback ||= document.createElement("audio");
        fallback.src = notificationRing;
        fallback.preload = "auto"; fallback.volume = 0;
        await fallback.play(); fallback.pause(); fallback.currentTime = 0; fallback.volume = .55; fallbackUnlocked = true;
      }
      if (!disposed) { onState(true); onNotice(""); }
      return !disposed;
    } catch (failure) {
      if (!disposed) { onState(false); onNotice("Tap Enable sound to allow notification audio in this browser."); }
      console.warn("Notification audio is waiting for a user gesture:", failure.name);
      return false;
    }
  }
  function unlock() {
    if (disposed) return Promise.resolve(false);
    if (fallbackUnlocked) return Promise.resolve(true);
    if (context?.state === "running") { onState(true); return Promise.resolve(true); }
    if (!unlocking) unlocking = initialize().finally(() => { unlocking = null; });
    return unlocking;
  }
  async function play(id, eligible = () => true) {
    if (disposed || played.has(id) || !eligible()) return;
    played.add(id);
    if (context?.state !== "running" && !fallback) {
      onState(false); onNotice("Tap Enable sound to allow notification audio in this browser."); return;
    }
    try {
      if (context) {
        if (context.state !== "running") throw new Error("Audio is suspended");
        await decoding;
        if (disposed || !eligible()) return;
        if (buffer) {
          const source = context.createBufferSource(), gain = context.createGain();
          source.buffer = buffer; gain.gain.value = .55; source.connect(gain).connect(context.destination);
          active.add(source); source.onended = () => { active.delete(source); source.disconnect(); gain.disconnect(); }; source.start();
        } else {
          const start = context.currentTime;
          for (const [frequency, offset] of [[880, 0], [1320, .09]]) {
            const tone = context.createOscillator(), gain = context.createGain(); tone.frequency.value = frequency;
            gain.gain.setValueAtTime(.0001, start + offset); gain.gain.exponentialRampToValueAtTime(.12, start + offset + .01); gain.gain.exponentialRampToValueAtTime(.0001, start + offset + .65);
            tone.connect(gain).connect(context.destination); active.add(tone);
            tone.onended = () => { active.delete(tone); tone.disconnect(); gain.disconnect(); };
            tone.start(start + offset); tone.stop(start + offset + .7);
          }
        }
      } else { fallback.currentTime = 0; await fallback.play(); }
    } catch (failure) {
      fallbackUnlocked = false;
      if (!disposed) { onState(false); onNotice("Notification received. Tap Enable sound to resume audio."); }
      console.warn("Notification audio playback failed:", failure.name);
    }
  }
  function stop() { for (const source of active) source.stop(); active.clear(); fallback?.pause(); }
  return { unlock, play, stop, dispose() { disposed = true; stop(); void context?.close().catch((failure) => console.warn("Notification audio cleanup failed:", failure.name)); } };
}
