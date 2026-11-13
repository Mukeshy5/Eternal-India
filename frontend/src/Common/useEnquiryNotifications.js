import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, socketServerUrl } from "./api";
import { createNotificationSound } from "./notificationSound";
import { voucherOptionsChanged } from "./voucherClient";

const initialPreferences = { popup: true, sound: true };
const maxNotifications = 20;

export default function useEnquiryNotifications({ admin, apiBase, onRefresh, onUnauthorized, socketFactory = io }) {
  const adminId = admin?.id || admin?._id;
  const [items, setItems] = useState([]), [unread, setUnread] = useState(0);
  const [preferences, setPreferences] = useState(initialPreferences), [toasts, setToasts] = useState([]);
  const [connected, setConnected] = useState(false), [loading, setLoading] = useState(false), [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(""), [connectionNotice, setConnectionNotice] = useState("");
  const [soundReady, setSoundReady] = useState(false), [soundNotice, setSoundNotice] = useState(""), [savingPreferences, setSavingPreferences] = useState(false);
  const runtime = useRef(null), itemsRef = useRef([]), preferencesRef = useRef(initialPreferences);
  const callbacks = useRef({ onRefresh, onUnauthorized });
  useEffect(() => { callbacks.current = { onRefresh, onUnauthorized }; }, [onRefresh, onUnauthorized]);
  const updateItems = useCallback((update) => {
    const next = typeof update === "function" ? update(itemsRef.current) : update;
    itemsRef.current = next; setItems(next);
  }, []);
  const updatePreferences = useCallback((next) => {
    preferencesRef.current = next; setPreferences(next);
    if (!next.sound) runtime.current?.audio.stop();
  }, []);
  const failure = useCallback((err) => {
    if (err.name === "AbortError") return;
    setError(err.message || "Notifications could not be updated.");
    if (err.status === 401) callbacks.current.onUnauthorized?.(err.message);
  }, []);
  const dismiss = useCallback((id) => setToasts((current) => current.filter((item) => item.id !== id)), []);
  const request = useCallback((path, options = {}) => api(`${apiBase}${path}`, { ...options, signal: runtime.current?.controller.signal }), [apiBase]);
  const refresh = useCallback(() => runtime.current?.refresh().catch(failure), [failure]);

  const loadMore = useCallback(async () => {
    const current = runtime.current;
    if (!current?.cursor || current.loadingMore) return;
    current.loadingMore = true; setLoading(true);
    try {
      const page = await request(`/notifications?limit=${maxNotifications}&cursor=${encodeURIComponent(current.cursor)}`);
      if (runtime.current !== current) return;
      current.cursor = page.cursor || ""; setHasMore(page.hasMore);
      const ids = new Set(itemsRef.current.map((item) => item.id));
      updateItems((items) => [...items, ...page.notifications.filter((item) => !ids.has(item.id))]); setError("");
    } catch (err) { if (runtime.current === current) failure(err); }
    finally { current.loadingMore = false; if (runtime.current === current) setLoading(false); }
  }, [request, failure, updateItems]);
  const mutate = useCallback(async (path, method) => {
    const current = runtime.current;
    if (!current) return;
    try {
      await request(path, { method });
      if (runtime.current !== current) return;
      await current.refresh(); setError("");
    } catch (err) { if (runtime.current === current) failure(err); }
  }, [request, failure]);
  const markRead = useCallback((id) => { dismiss(id); return mutate(`/notifications/${encodeURIComponent(id)}/read`, "PATCH"); }, [mutate, dismiss]);
  const markAllRead = useCallback(() => mutate("/notifications/read-all", "PATCH"), [mutate]);
  const remove = useCallback((id) => { dismiss(id); return mutate(`/notifications/${encodeURIComponent(id)}`, "DELETE"); }, [mutate, dismiss]);
  const clearAll = useCallback(() => mutate("/notifications", "DELETE"), [mutate]);
  const unlockSound = useCallback(() => runtime.current?.audio.unlock(), []);
  const savePreference = useCallback(async (key, value) => {
    const current = runtime.current;
    if (!current || current.savingPreferences) return;
    current.savingPreferences = true; setSavingPreferences(true);
    const previous = preferencesRef.current;
    updatePreferences({ ...previous, [key]: value });
    try {
      const saved = await request("/notifications/settings", { method: "PATCH", body: JSON.stringify({ [key]: value }) });
      if (runtime.current === current) { updatePreferences(saved); setError(""); }
    } catch (err) { if (runtime.current === current) { updatePreferences(previous); failure(err); } }
    finally { current.savingPreferences = false; if (runtime.current === current) setSavingPreferences(false); }
  }, [request, updatePreferences, failure]);
  const toggleSound = useCallback(() => {
    const enabled = !preferencesRef.current.sound;
    if (enabled) void unlockSound();
    return savePreference("sound", enabled);
  }, [savePreference, unlockSound]);
  const togglePopup = useCallback(() => savePreference("popup", !preferencesRef.current.popup), [savePreference]);

  useEffect(() => {
    if (!adminId) return undefined;
    const current = { controller: new AbortController(), liveSeen: new Set(), cursor: "", revision: 0, startedAt: Date.now(), settingsLoaded: false, retries: 0 };
    const active = () => runtime.current === current && !current.controller.signal.aborted;
    current.audio = createNotificationSound({ onState: (ready) => { if (active()) setSoundReady(ready); }, onNotice: (notice) => { if (active()) setSoundNotice(notice); } });
    runtime.current = current;
    updateItems([]); setUnread(0); setToasts([]); setHasMore(false); setConnected(false); setError(""); setConnectionNotice(""); setSoundNotice(""); setSoundReady(false); setLoading(true); setSavingPreferences(false); updatePreferences(initialPreferences);
    const prime = () => { void current.audio.unlock(); };
    document.addEventListener("pointerdown", prime, { passive: true }); document.addEventListener("keydown", prime); document.addEventListener("touchend", prime, { passive: true });
    const call = (path, options = {}) => api(`${apiBase}${path}`, { ...options, signal: current.controller.signal });
    const report = (err) => { if (active()) failure(err); };
    current.loadSettings = async () => {
      const settings = await call("/notifications/settings");
      if (active() && !current.savingPreferences) { updatePreferences({ popup: settings.popup, sound: settings.sound }); current.settingsLoaded = true; }
    };
    // Coalesce activity bursts. Discard a snapshot overtaken by live mutations.
    current.refresh = () => {
      current.refreshAgain = true;
      if (current.refreshing) return current.refreshing;
      current.refreshing = (async () => {
        while (active() && current.refreshAgain) {
          current.refreshAgain = false;
          const revision = current.revision;
          const page = await call(`/notifications?limit=${maxNotifications}`);
          if (!active()) return;
          if (revision !== current.revision) { current.refreshAgain = true; continue; }
          current.cursor = page.cursor || ""; setHasMore(Boolean(page.hasMore));
          updateItems(page.notifications); setUnread(page.unread); setError("");
        }
      })().finally(() => { current.refreshing = null; });
      return current.refreshing;
    };
    const socket = socketFactory(socketServerUrl(), {
      autoConnect: false, path: "/api/enquiries/socket.io",
      auth: (done) => { void call("/socket-ticket", { method: "POST", body: "{}" }).then(({ ticket }) => {
        if (active()) done({ panel: apiBase.slice(1), ticket, since: new Date(current.startedAt).toISOString() });
      }).catch((err) => { report(err); if (active()) done({ panel: apiBase.slice(1) }); }); },
      transports: ["websocket", "polling"], tryAllTransports: true, reconnection: true,
    });
    const receive = (event) => {
      if (!active() || event.userId && event.userId !== adminId) return;
      current.revision++;
      if (event.action === "settings") { updatePreferences(event.preferences); return; }
      if (event.action === "created" && event.notification?.id) {
        const item = { ...event.notification, read: Boolean(event.notification.read || event.actorId === adminId) };
        if (current.liveSeen.has(item.id)) return;
        current.liveSeen.add(item.id);
        updateItems((items) => [item, ...items.filter((entry) => entry.id !== item.id)].slice(0, maxNotifications));
        if (!item.read) setUnread((count) => count + 1);
        // Initial loads and recovered history never produce audio or popups.
        if (!event.replay && !item.read && current.settingsLoaded && (event.fresh === true || Date.parse(item.createdAt) >= current.startedAt)) {
          if (preferencesRef.current.sound) void current.audio.play(item.id, () => active() && preferencesRef.current.sound && itemsRef.current.some((entry) => entry.id === item.id && !entry.read));
          if (preferencesRef.current.popup) setToasts((items) => [item, ...items].slice(0, 3));
        }
      } else if (event.action === "read") {
        const unreadItem = itemsRef.current.some((item) => item.id === event.id && !item.read);
        updateItems((items) => items.map((item) => item.id === event.id ? { ...item, read: true } : item));
        if (unreadItem) setUnread((count) => Math.max(0, count - 1)); dismiss(event.id);
      } else if (event.action === "deleted") {
        updateItems((items) => items.filter((item) => item.id !== event.id)); dismiss(event.id);
      } else if (["read-all", "cleared"].includes(event.action)) {
        const affected = (item) => (!event.panel || !item.audience || item.audience.includes(event.panel)) && (!event.before || Date.parse(item.createdAt) <= Date.parse(event.before));
        updateItems((items) => event.action === "cleared" ? items.filter((item) => !affected(item)) : items.map((item) => affected(item) ? { ...item, read: true } : item));
        setToasts((items) => items.filter((item) => !affected(item)));
      }
      void current.refresh().catch(report);
    };
    const onConnect = () => { if (active()) { current.retries = 0; window.clearTimeout(current.retry); setConnected(true); setConnectionNotice(""); voucherOptionsChanged(); void current.refresh().catch(report); if (!current.settingsLoaded) void current.loadSettings().catch(report); } };
    const reconnect = () => {
      if (!active()) return;
      setConnected(false); window.clearTimeout(current.retry);
      current.retry = window.setTimeout(() => { if (active() && !socket.connected) socket.connect(); }, Math.min(30000, 1000 * 2 ** Math.min(current.retries++, 5)));
    };
    const onError = (err) => { if (active()) { setConnectionNotice(err.message || "Live connection interrupted. Reconnecting…"); reconnect(); } };
    const onDisconnect = () => { if (active()) reconnect(); };
    const refreshData = () => { if (active()) { callbacks.current.onRefresh?.(); void current.refresh().catch(report); if (!current.settingsLoaded) void current.loadSettings().catch(report); } };
    const onOnline = () => { if (!socket.connected) socket.connect(); refreshData(); };
    const onGstChanged = () => { if (active()) voucherOptionsChanged(); };
    socket.on("connect", onConnect); socket.on("connect_error", onError); socket.on("disconnect", onDisconnect); socket.on("enquiry:event", refreshData); socket.on("notification:event", receive); socket.on("gst:changed", onGstChanged);
    window.addEventListener("online", onOnline); window.addEventListener("focus", refreshData);
    const interval = window.setInterval(() => { if (!document.hidden) refreshData(); }, 30000);
    Promise.all([current.loadSettings(), current.refresh()]).catch(report).finally(() => { if (active()) { setLoading(false); socket.connect(); } });
    return () => {
      current.controller.abort(); runtime.current = null;
      document.removeEventListener("pointerdown", prime); document.removeEventListener("keydown", prime); document.removeEventListener("touchend", prime);
      window.removeEventListener("online", onOnline); window.removeEventListener("focus", refreshData); window.clearInterval(interval); window.clearTimeout(current.retry);
      socket.off("connect", onConnect); socket.off("connect_error", onError); socket.off("disconnect", onDisconnect); socket.off("enquiry:event", refreshData); socket.off("notification:event", receive); socket.off("gst:changed", onGstChanged); socket.disconnect(); current.audio.dispose();
    };
  }, [adminId, apiBase, socketFactory, dismiss, failure, updateItems, updatePreferences]);
  return { items, unread, preferences, toasts, connected, loading, hasMore, error, connectionNotice, soundReady, soundNotice, savingPreferences, loadMore, markRead, markAllRead, remove, clearAll, dismiss, toggleSound, togglePopup, unlockSound, refresh };
}
