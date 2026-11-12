import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, socketServerUrl } from "./api";
import notificationRing from "../assets/Notification Ring/notification-ring.mp3";

const initialPreferences = { popup: true, sound: true };
const maxNotifications = 20;

export default function useEnquiryNotifications({ admin, apiBase, onRefresh, onUnauthorized, socketFactory = io }) {
  const adminId = admin?.id || admin?._id;
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [toasts, setToasts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedAccount, setLoadedAccount] = useState("");
  const loading = Boolean(adminId && loadedAccount !== adminId) || loadingMore;
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const cursor = useRef("");
  const seen = useRef(new Set());
  const itemsRef = useRef(items);
  const preferencesRef = useRef(preferences);
  const sound = useRef(null);
  const soundUnlocked = useRef(false);
  const queuedSound = useRef(false);
  const loaded = useRef(false);
  const notificationReceivedDuringLoad = useRef(false);
  const mounted = useRef(false);
  const callbacks = useRef({ onRefresh, onUnauthorized });
  const updateItems = useCallback((update) => {
    const next = typeof update === "function" ? update(itemsRef.current) : update;
    itemsRef.current = next;
    setItems(next);
  }, []);
  const updatePreferences = useCallback((update) => {
    const next = typeof update === "function" ? update(preferencesRef.current) : update;
    preferencesRef.current = next;
    setPreferences(next);
  }, []);

  useEffect(() => { callbacks.current = { onRefresh, onUnauthorized }; }, [onRefresh, onUnauthorized]);

  const handleFailure = useCallback((failure) => {
    if (failure?.name === "AbortError") return;
    setError(failure?.message || "Notifications could not be updated.");
    if (failure?.status === 401) callbacks.current.onUnauthorized?.(failure.message);
  }, []);

  const refreshUnread = useCallback(async () => {
    const result = await api(`${apiBase}/notifications/unread-count`);
    setUnread(result.unread);
  }, [apiBase]);

  const loadFirstPage = useCallback(async () => {
    const [page, count] = await Promise.all([
      api(`${apiBase}/notifications?limit=${maxNotifications}`),
      api(`${apiBase}/notifications/unread-count`),
    ]);
    cursor.current = page.cursor || "";
    setHasMore(Boolean(page.hasMore));
    setUnread(count.unread);
    for (const item of page.notifications) seen.current.add(item.id);
    const live = itemsRef.current.filter((item) => !page.notifications.some((loaded) => loaded.id === item.id));
    updateItems([...live, ...page.notifications].slice(0, maxNotifications));
    loaded.current = true;
    if (notificationReceivedDuringLoad.current) {
      notificationReceivedDuringLoad.current = false;
      void refreshUnread().catch(handleFailure);
    }
    setError("");
  }, [apiBase, handleFailure, refreshUnread, updateItems]);

  const loadMore = useCallback(async () => {
    if (!cursor.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api(`${apiBase}/notifications?limit=${maxNotifications}&cursor=${encodeURIComponent(cursor.current)}`);
      cursor.current = page.cursor || "";
      setHasMore(Boolean(page.hasMore));
      for (const item of page.notifications) seen.current.add(item.id);
      const ids = new Set(itemsRef.current.map((item) => item.id));
      updateItems([...itemsRef.current, ...page.notifications.filter((item) => !ids.has(item.id))]);
      setError("");
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setLoadingMore(false);
    }
  }, [apiBase, handleFailure, loadingMore, updateItems]);

  const markRead = useCallback(async (id) => {
    try {
      await api(`${apiBase}/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
      const changed = itemsRef.current.some((item) => item.id === id && !item.read);
      updateItems((current) => current.map((item) => {
        if (item.id !== id || item.read) return item;
        return { ...item, read: true };
      }));
      if (changed) setUnread((value) => Math.max(0, value - 1));
      setError("");
    } catch (failure) {
      handleFailure(failure);
    }
  }, [apiBase, handleFailure, updateItems]);

  const markAllRead = useCallback(async () => {
    try {
      await api(`${apiBase}/notifications/read-all`, { method: "PATCH" });
      updateItems((current) => current.map((item) => ({ ...item, read: true })));
      setUnread(0);
      setError("");
    } catch (failure) {
      handleFailure(failure);
    }
  }, [apiBase, handleFailure, updateItems]);

  const remove = useCallback(async (id) => {
    try {
      await api(`${apiBase}/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
      const wasUnread = itemsRef.current.some((item) => item.id === id && !item.read);
      updateItems((current) => current.filter((item) => item.id !== id));
      if (wasUnread) setUnread((value) => Math.max(0, value - 1));
      setError("");
    } catch (failure) {
      handleFailure(failure);
    }
  }, [apiBase, handleFailure, updateItems]);

  const clearAll = useCallback(async () => {
    try {
      await api(`${apiBase}/notifications`, { method: "DELETE" });
      updateItems([]);
      setUnread(0);
      setHasMore(false);
      cursor.current = "";
      setError("");
    } catch (failure) {
      handleFailure(failure);
    }
  }, [apiBase, handleFailure, updateItems]);

  const dismiss = useCallback((id) => setToasts((current) => current.filter((item) => item.id !== id)), []);

  const savePreference = useCallback(async (key, value) => {
    const previous = preferencesRef.current;
    const next = { ...previous, [key]: value };
    updatePreferences(next);
    try {
      await api(`${apiBase}/enquiry-notification-settings`, { method: "PATCH", body: JSON.stringify(next) });
      setError("");
      return true;
    } catch (failure) {
      if (preferencesRef.current[key] === value) updatePreferences(previous);
      handleFailure(failure);
      return false;
    }
  }, [apiBase, handleFailure, updatePreferences]);

  const unlockSound = useCallback(async () => {
    const player = sound.current;
    if (!player || soundUnlocked.current) return;
    player.muted = true;
    try {
      await player.play();
      player.pause();
      player.currentTime = 0;
      player.muted = false;
      soundUnlocked.current = true;
      const shouldPlay = queuedSound.current && preferencesRef.current.sound;
      queuedSound.current = false;
      if (shouldPlay) {
        player.currentTime = 0;
        await player.play();
      }
    } catch {
      player.muted = false;
    }
  }, []);

  const toggleSound = useCallback(async () => {
    const enabled = !preferencesRef.current.sound;
    await savePreference("sound", enabled);
  }, [savePreference]);

  const togglePopup = useCallback(() => { void savePreference("popup", !preferencesRef.current.popup); }, [savePreference]);

  useEffect(() => {
    if (!adminId) return undefined;
    mounted.current = true;
    const startedAt = Date.now();
    seen.current.clear();
    loaded.current = false;
    notificationReceivedDuringLoad.current = false;
    updateItems([]);
    setUnread(0);
    setToasts([]);
    setHasMore(false);
    setConnected(false);
    setError("");
    updatePreferences(initialPreferences);
    cursor.current = "";
    soundUnlocked.current = false;
    queuedSound.current = false;
    const player = document.createElement("audio");
    player.src = notificationRing;
    player.preload = "auto";
    player.volume = 0.55;
    sound.current = player;
    const prime = () => { void unlockSound(); };
    document.addEventListener("pointerdown", prime, { passive: true });
    document.addEventListener("keydown", prime);
    Promise.all([
      api(`${apiBase}/enquiry-notification-settings`),
      api(`${apiBase}/notifications?limit=${maxNotifications}`),
    ]).then(([settings, page]) => {
      if (!mounted.current) return;
      updatePreferences({ popup: settings.popup, sound: settings.sound });
      cursor.current = page.cursor || "";
      setHasMore(Boolean(page.hasMore));
      setUnread(settings.unread);
      for (const item of page.notifications) seen.current.add(item.id);
      const live = itemsRef.current.filter((item) => !page.notifications.some((loaded) => loaded.id === item.id));
      updateItems([...live, ...page.notifications].slice(0, maxNotifications));
      setError("");
    }).catch(handleFailure).finally(() => {
      if (mounted.current) {
        loaded.current = true;
        setLoadedAccount(adminId);
      }
    });

    const socket = socketFactory(socketServerUrl(), {
      path: "/api/enquiries/socket.io",
      auth: (done) => {
        void api(`${apiBase}/socket-ticket`, { method: "POST", body: "{}" })
          .then(({ ticket }) => done({ panel: apiBase.slice(1), ticket }))
          .catch((failure) => { handleFailure(failure); done({ panel: apiBase.slice(1) }); });
      },
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    const refreshData = () => {
      callbacks.current.onRefresh?.();
      if (loaded.current) void loadFirstPage().catch(handleFailure);
    };
    const receiveNotification = (event) => {
      if (event.action === "created" && event.notification) {
        const item = { ...event.notification, read: Boolean(event.notification.read || event.actorId === adminId) };
        if (seen.current.has(item.id)) return;
        seen.current.add(item.id);
        if (!loaded.current) notificationReceivedDuringLoad.current = true;
        updateItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, maxNotifications));
        if (!item.read) {
          setUnread((value) => value + 1);
          const createdAt = new Date(item.createdAt).getTime();
          if (createdAt >= startedAt) {
            if (preferencesRef.current.sound) {
              if (soundUnlocked.current) {
                player.currentTime = 0;
                void player.play().catch(() => setError("A new notification arrived, but your browser blocked the sound."));
              } else queuedSound.current = true;
            }
            if (preferencesRef.current.popup) setToasts((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 3));
          }
        }
      } else if (event.action === "read") {
        const wasUnread = itemsRef.current.some((item) => item.id === event.id && !item.read);
        updateItems((current) => current.map((item) => item.id === event.id ? { ...item, read: true } : item));
        if (wasUnread) setUnread((value) => Math.max(0, value - 1));
      } else if (event.action === "read-all") {
        updateItems((current) => current.map((item) => ({ ...item, read: true })));
        setUnread(0);
      } else if (event.action === "deleted") {
        const wasUnread = itemsRef.current.some((item) => item.id === event.id && !item.read);
        updateItems((current) => current.filter((item) => item.id !== event.id));
        if (wasUnread) setUnread((value) => Math.max(0, value - 1));
        dismiss(event.id);
      } else if (event.action === "cleared") {
        updateItems([]);
        setUnread(0);
        setHasMore(false);
        cursor.current = "";
        setToasts([]);
      }
    };
    const onConnect = () => setConnected(true);
    const onReady = () => { setConnected(true); refreshData(); };
    const onDisconnect = () => setConnected(false);
    const onOnline = () => { if (!socket.connected) socket.connect(); else refreshData(); };
    const onFocus = () => refreshData();
    const onEnquiry = () => refreshData();
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("enquiry:ready", onReady);
    socket.on("enquiry:event", onEnquiry);
    socket.on("notification:event", receiveNotification);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => { if (!document.hidden) void refreshUnread().catch(handleFailure); }, 30000);
    socket.connect();
    return () => {
      mounted.current = false;
      document.removeEventListener("pointerdown", prime);
      document.removeEventListener("keydown", prime);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("enquiry:ready", onReady);
      socket.off("enquiry:event", onEnquiry);
      socket.off("notification:event", receiveNotification);
      socket.disconnect();
      player.pause();
      sound.current = null;
      setConnected(false);
    };
  }, [adminId, apiBase, dismiss, handleFailure, loadFirstPage, refreshUnread, socketFactory, unlockSound, updateItems, updatePreferences]);

  return {
    items, unread, preferences, toasts, connected, loading, hasMore, error,
    loadMore, markRead, markAllRead, remove, clearAll, dismiss, toggleSound, togglePopup,
  };
}
