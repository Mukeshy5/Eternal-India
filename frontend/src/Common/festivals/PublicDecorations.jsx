import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { api } from "../api";
import "./PublicDecorations.css";

const DecorationRenderer = lazy(() => import("./DecorationRenderer"));
const empty = { enabled: false, decorations: [], settings: {} };
export default function PublicDecorations({ enabled = true }) {
  const { pathname } = useLocation();
  const [state, setState] = useState(empty);
  const [hiddenFor, setHiddenFor] = useState("");
  const [playing, setPlaying] = useState(false);
  const [playingFor, setPlayingFor] = useState("");
  const [musicError, setMusicError] = useState("");
  const audio = useRef(null);
  const decoration = state.enabled ? state.decorations[0] : null;
  const eligible = enabled && decoration && (decoration.displayPosition !== "homepage" || pathname === "/");
  const hidden = eligible && hiddenFor === decoration.id;
  const showMusic = eligible && !hidden && state.settings.musicEnabled && decoration.musicEnabled && decoration.musicUrl;
  const musicKey = `${decoration?.id}:${decoration?.musicUrl}`;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const receive = (result) => { if (!controller.signal.aborted) setState(result); };
    const refresh = async () => {
      try { receive(await api("/public/festival-decorations/active", { signal: controller.signal })); }
      catch { if (!controller.signal.aborted) setState(empty); }
    };
    void refresh();
    let source;
    if (typeof window.EventSource === "function") {
      source = new window.EventSource("/api/public/festival-decorations/events");
      source.onmessage = (event) => { try { receive(JSON.parse(event.data)); } catch { /* Ignore incomplete stream packets; the next refresh reconciles state. */ } };
      source.onerror = () => { void refresh(); };
    }
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); source?.close(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [enabled]);
  useEffect(() => {
    if (!decoration?.endsAt || !state.serverTime) return;
    // The backend decides activation. This expiry guard also hides stale state during a lost connection.
    const remaining = new Date(decoration.endsAt) - new Date(state.serverTime);
    const timer = window.setTimeout(() => setState(empty), Math.min(2147483647, Math.max(0, remaining)));
    return () => window.clearTimeout(timer);
  }, [decoration?.endsAt, state.serverTime]);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    return () => { element.pause(); element.removeAttribute("src"); element.load(); };
  }, [showMusic, decoration?.id, decoration?.musicUrl]);
  useEffect(() => {
    if (!eligible || hidden) return;
    const stopAudio = () => { if (document.hidden && audio.current) { audio.current.pause(); setPlaying(false); } };
    document.addEventListener("visibilitychange", stopAudio);
    return () => document.removeEventListener("visibilitychange", stopAudio);
  }, [eligible, hidden]);
  if (!eligible || typeof document === "undefined") return null;
  const destination = decoration.displayPosition === "header" ? document.querySelector(".site-header") : decoration.displayPosition === "footer" ? document.querySelector(".site-footer") : document.body;
  if (!destination) return null;
  async function music() {
    const element = audio.current;
    if (!element) return;
    setMusicError("");
    if (!element.paused) { element.pause(); setPlaying(false); return; }
    try { await element.play(); setPlayingFor(musicKey); setPlaying(true); }
    catch { setPlaying(false); setMusicError("Music could not be played."); }
  }
  return createPortal(<div className={`public-decoration-host decoration-placement-${decoration.displayPosition}`} data-testid="public-decoration">
    {!hidden && <Suspense fallback={null}><DecorationRenderer decoration={decoration} reducedMotion={state.settings.reducedMotion} mobileOptimization={state.settings.mobileOptimization} greetingEnabled={state.settings.greetingEnabled} /></Suspense>}
    <div className="decoration-visitor-controls">
      {state.settings.visitorHideButton && <button type="button" onClick={() => { audio.current?.pause(); setPlaying(false); setHiddenFor(hidden ? "" : decoration.id); }}>{hidden ? "Show decoration" : "Hide decoration"}</button>}
      {showMusic && <><audio ref={audio} src={decoration.musicUrl} preload="none" loop hidden /><button type="button" onClick={music}>{playing && playingFor === musicKey ? "Pause festival music" : "Play festival music"}</button></>}
      {musicError && <span role="status">{musicError}</span>}
    </div>
  </div>, destination);
}
