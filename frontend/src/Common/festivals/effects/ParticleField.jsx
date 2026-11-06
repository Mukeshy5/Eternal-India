import { useEffect, useMemo, useState } from "react";
import { decorationEffects } from "../../../../../shared/decorationCatalog.js";

function fraction(index, seed) {
  const value = Math.sin((index + 1) * (seed + 17) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
export function ParticleField({ effectId, config, density, paused = false, mobile = false }) {
  const effect = decorationEffects.find((item) => item.id === effectId);
  const particles = useMemo(() => {
    const multiplier = { low: 0.5, medium: 1, high: 1.5 }[config.intensity] || 1;
    const count = Math.min(mobile ? 24 : 90, Math.max(2, Math.round(density ?? config.particleDensity * multiplier)));
    const seed = [...effectId].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
    return Array.from({ length: count }, (_, index) => ({
      key: index, color: effect.colors[index % effect.colors.length],
      x: fraction(index, seed) * 100, y: fraction(index, seed + 3) * 100,
      size: 10 + fraction(index, seed + 7) * 23,
      duration: (7 + fraction(index, seed + 11) * 12) / config.animationSpeed,
      delay: fraction(index, seed + 13), sway: (fraction(index, seed + 17) - 0.5) * 180,
      rotation: fraction(index, seed + 21) * 360,
    }));
  }, [effectId, density, config.particleDensity, config.intensity, config.animationSpeed, mobile, effect]);
  const symbols = {
    "diwali": ["🪔", "✦", "·"], "ganesh-chaturthi": ["✿", "✦", "❀"], "durga-puja": ["✿", "✧", "❀"],
    "janmashtami": ["🦚", "♫", "✿"], "eid": ["☾", "✦", "▣"], "christmas": ["❄", "🎄", "🎅", "✦"],
    "new-year": ["✦", "▪", "✧"], "valentines": ["♥", "❧", "♥"], "birthday": ["🎈", "▪", "🎁"],
  }[effectId] || [effect.symbol];
  return <div className={`fx-field${paused ? " fx-paused" : ""}`} data-effect={effectId} data-motion={effect.motion} style={{ opacity: config.opacity }} aria-hidden="true">
    {particles.map((particle) => <span className="fx-particle" key={particle.key} style={{ "--x": `${particle.x}%`, "--y": `${particle.y}%`, "--size": `${particle.size}px`, "--duration": `${particle.duration}s`, "--delay": `${-particle.delay * particle.duration}s`, "--sway": `${particle.sway}px`, "--rotation": `${particle.rotation}deg`, "--color": particle.color }}><i>{symbols[particle.key % symbols.length]}</i></span>)}
    {effect.scene && <SceneOrnament id={effectId} />}
  </div>;
}

function SceneOrnament({ id }) {
  if (["diwali", "onam"].includes(id)) return <span className={`fx-rangoli fx-rangoli-${id}`} />;
  if (id === "republic-day") return <span className="fx-chakra" />;
  if (id === "independence-day") return <span className="fx-tricolor-ribbon" />;
  if (id === "eid") return <span className="fx-eid-moon">☾</span>;
  if (["ganesh-chaturthi", "durga-puja"].includes(id)) return <span className="fx-floral-garland">✿ ❀ ✿ ❀ ✿ ❀ ✿ ❀ ✿</span>;
  if (id === "gandhi-jayanti") return <span className="fx-peace">☸<small>Peace · Truth · Harmony</small></span>;
  if (id === "janmashtami") return <span className="fx-flute">♫ ━━━━━━━━━ ♫</span>;
  return <span className={`fx-scene-glow fx-scene-${id}`} />;
}

export function NewYearCountdown({ config, paused }) {
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    const target = config.countdownAt ? new Date(config.countdownAt) : new Date(new Date().getFullYear() + 1, 0, 1);
    const update = () => setRemaining(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    update();
    if (paused) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [config.countdownAt, paused]);
  if (remaining === null) return null;
  return <div className="fx-countdown" aria-label="New Year countdown">{remaining === 0 ? "Happy New Year!" : <><small>A new year awaits</small><strong>{Math.floor(remaining / 86400)}d {String(Math.floor(remaining / 3600) % 24).padStart(2, "0")}h {String(Math.floor(remaining / 60) % 60).padStart(2, "0")}m {String(remaining % 60).padStart(2, "0")}s</strong></>}</div>;
}
