import { useEffect, useRef } from "react";

export function usePanelLiveRefresh(resources, onChange) {
  const callback = useRef(onChange);
  const timer = useRef(null);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    const allowed = new Set(resources.split("|"));
    const update = (event) => {
      if (event.detail?.resource && !allowed.has(event.detail.resource)) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => callback.current(), 120);
    };
    window.addEventListener("panel:data-changed", update);
    return () => { window.clearTimeout(timer.current); window.removeEventListener("panel:data-changed", update); };
  }, [resources]);
}
