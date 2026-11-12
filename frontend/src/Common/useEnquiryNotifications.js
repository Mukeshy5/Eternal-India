import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, apiUrl } from "./api";
import notificationRing from "../assets/Notification Ring/notification-ring.mp3";

export default function useEnquiryNotifications({ admin, apiBase, onRefresh, onUnauthorized, socketFactory = io }) {
  const [preferences, setPreferences] = useState({ popup: true, sound: true }), [unread, setUnread] = useState(0), [connected, setConnected] = useState(false), [soundReady, setSoundReady] = useState(false), [toasts, setToasts] = useState([]), [error, setError] = useState("");
  const callbacks = useRef({ onRefresh, onUnauthorized }); callbacks.current = { onRefresh, onUnauthorized };
  const options = useRef(preferences); options.current = preferences;
  const audio = useRef(null), seen = useRef(new Set()), since = useRef(new Date().toISOString()), timers = useRef(new Set()), saving = useRef(false);
  useEffect(() => {
    if (!admin) return;
    since.current = new Date().toISOString();
    const controller = new AbortController();
    const player = document.createElement("audio"); player.src = notificationRing; player.preload = "none"; player.volume = .7; audio.current = player;
    api(`${apiBase}/enquiry-notification-settings`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) { setPreferences({ popup: result.popup !== false, sound: result.sound !== false }); if (Number.isInteger(result.unread)) setUnread(result.unread); } }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) callbacks.current.onUnauthorized(); } });
    const origin = new URL(apiUrl("/"), window.location.origin).origin;
    const socket = socketFactory(origin, { path: "/api/enquiries/socket.io", transports: ["polling"], withCredentials: true, autoConnect: false, auth: (done) => done({ panel: apiBase.slice(1), since: since.current }), reconnectionDelay: 1000, reconnectionDelayMax: 15000 });
    const refreshCounts = () => api(`${apiBase}/enquiry-summary`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setUnread(result.unread); }).catch((failure) => { if (!controller.signal.aborted && failure.status === 401) callbacks.current.onUnauthorized(); });
    socket.on("enquiry:ready", () => { setConnected(true); setError(""); callbacks.current.onRefresh(); void refreshCounts(); });
    socket.on("disconnect", (reason) => { setConnected(false); if (reason === "io server disconnect") { void api(`${apiBase}/me`, { signal: controller.signal }).then(() => { if (!controller.signal.aborted) socket.connect(); }).catch((failure) => { if (!controller.signal.aborted && failure.status === 401) callbacks.current.onUnauthorized(); }); } });
    socket.on("connect_error", () => setConnected(false));
    socket.on("enquiry:event", (event) => {
      if (typeof event?.id !== "string" || seen.current.has(event.id)) return;
      seen.current.add(event.id); if (seen.current.size > 5000) seen.current.delete(seen.current.values().next().value);
      if (Date.parse(event.publishedAt) > Date.parse(since.current)) since.current = event.publishedAt;
      callbacks.current.onRefresh(); void refreshCounts();
      if (event.type !== "created") return;
      if (options.current.popup) {
        setToasts((items) => [...items.slice(-3), event]);
        const timer = window.setTimeout(() => { setToasts((items) => items.filter((item) => item.id !== event.id)); timers.current.delete(timer); }, 10000); timers.current.add(timer);
      }
      if (options.current.sound) { player.pause(); player.currentTime = 0; void player.play().then(() => setSoundReady(true)).catch(() => setSoundReady(false)); }
    });
    socket.connect();
    const countsTimer = window.setInterval(() => { if (!document.hidden) void refreshCounts(); }, 30000);
    return () => { controller.abort(); socket.disconnect(); player.pause(); player.removeAttribute("src"); audio.current = null; window.clearInterval(countsTimer); for (const timer of timers.current) window.clearTimeout(timer); timers.current.clear(); seen.current.clear(); setToasts([]); setConnected(false); };
  }, [admin?.id, apiBase, socketFactory]);
  const savePreferences = useCallback(async (next) => {
    if (saving.current) return false; saving.current = true; setError("");
    try { const saved = await api(`${apiBase}/enquiry-notification-settings`, { method: "PATCH", body: JSON.stringify(next) }); setPreferences(saved); return true; }
    catch (failure) { setError(failure.message); if (failure.status === 401) callbacks.current.onUnauthorized(); return false; }
    finally { saving.current = false; }
  }, [apiBase]);
  async function toggleSound() {
    if (preferences.sound && soundReady) { if (await savePreferences({ ...preferences, sound: false })) { audio.current?.pause(); setSoundReady(false); } }
    else {
      if (!audio.current) return;
      try { audio.current.currentTime = 0; await audio.current.play(); setSoundReady(true); await savePreferences({ ...preferences, sound: true }); }
      catch { setError("Your browser could not play the notification sound. Try enabling sound again."); }
    }
  }
  return { preferences, unread, connected, soundReady, toasts, error, toggleSound, togglePopup: () => void savePreferences({ ...preferences, popup: !preferences.popup }), dismiss: (id) => setToasts((items) => items.filter((event) => event.id !== id)) };
}


