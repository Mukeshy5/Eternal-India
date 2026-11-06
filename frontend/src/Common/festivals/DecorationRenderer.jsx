import { Suspense, useEffect, useState } from "react";
import { effectComponents } from "./effects/registry";
import "./effects/effects.css";

export default function DecorationRenderer({ decoration, mobileOptimization = true, reducedMotion = true, preview = false, previewDevice = "desktop", paused = false, greetingEnabled = true }) {
  const [environment, setEnvironment] = useState({ mobile: false, hidden: false, reduced: false });
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 650px)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnvironment({ mobile: mobile.matches, hidden: document.hidden, reduced: motion.matches });
    update(); mobile.addEventListener("change", update); motion.addEventListener("change", update); document.addEventListener("visibilitychange", update);
    return () => { mobile.removeEventListener("change", update); motion.removeEventListener("change", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  const stopMotion = paused || environment.hidden || (reducedMotion && environment.reduced);
  const mobile = environment.mobile || (preview && previewDevice === "mobile");
  const multiplier = { low: 0.5, medium: 1, high: 1.5 }[decoration.intensity] || 1;
  const density = Math.max(2, Math.floor(Math.min(decoration.particleDensity * multiplier, mobile && mobileOptimization ? 24 : 90) / decoration.selectedEffects.length));
  return <div className={`decoration-layer${preview ? " decoration-preview-layer" : ""}${stopMotion ? " decoration-motion-paused" : ""}${reducedMotion && environment.reduced ? " decoration-reduced-motion" : ""}`} data-testid="decoration-layer" data-decoration={decoration.id || "preview"}>
    <Suspense fallback={null}>{decoration.selectedEffects.map((id) => { const Effect = effectComponents[id]; return Effect ? <Effect key={id} config={decoration} density={density} paused={stopMotion} mobile={mobileOptimization && mobile} /> : null; })}</Suspense>
    {greetingEnabled && decoration.greetingEnabled && decoration.greetingMessage && <div className="decoration-greeting" style={{ color: decoration.greetingColor }}><span aria-hidden="true">✦</span><p>{decoration.greetingMessage}</p><span aria-hidden="true">✦</span></div>}
    {decoration.bannerImage && <img className="decoration-banner-image" src={decoration.bannerImage} alt={`${decoration.name} celebration banner`} />}
  </div>;
}
