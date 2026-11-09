import { useEffect, useState } from "react";
import { apiUrl } from "../api";

export function useStaffEvents(apiBase, onChange) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (typeof window.EventSource !== "function") return;
    let source;
    try { source = new window.EventSource(apiUrl(`${apiBase}/staff-events`), { withCredentials: true }); } catch { return; }
    let revision;
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    const changed = (event) => {
      try { const next = JSON.parse(event.data).revision; if (revision !== undefined && revision !== next && !document.hidden) onChange(); revision = next; } catch { /* Ignore incomplete events; the next heartbeat reconnects. */ }
    };
    source.addEventListener("change", changed);
    return () => { source.close(); };
  }, [apiBase, onChange]);
  return connected;
}
