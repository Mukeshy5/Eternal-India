import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef } from "react";

const NavigationContext = createContext(null);
export function PanelNavigationProvider({ children }) {
  const guards = useRef(new Map());
  const register = useCallback((id, guard) => { guards.current.set(id, guard); return () => guards.current.delete(id); }, []);
  const confirmNavigation = useCallback(() => {
    const active = [...guards.current.values()];
    if (active.some((guard) => guard.busy)) return false;
    const dirty = active.find((guard) => guard.dirty);
    return !dirty || window.confirm(dirty.message || "Discard unsaved changes and open another section?");
  }, []);
  useEffect(() => {
    const beforeUnload = (event) => { if ([...guards.current.values()].some((guard) => guard.dirty || guard.busy)) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  return <NavigationContext.Provider value={useMemo(() => ({ register, confirmNavigation }), [register, confirmNavigation])}>{children}</NavigationContext.Provider>;
}
export const usePanelNavigation = () => useContext(NavigationContext);
export function usePanelNavigationGuard(dirty, busy = false, message) {
  const navigation = usePanelNavigation(), id = useId();
  useEffect(() => navigation?.register(id, { dirty: !!dirty, busy: !!busy, message }), [navigation, id, dirty, busy, message]);
}
