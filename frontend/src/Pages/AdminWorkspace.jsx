import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../Common/api";
import PanelAuth from "../Common/PanelAuth";
import AccountManager from "../Common/AccountManager";
import VoucherHistory from "../Common/VoucherHistory";
import AdminDashboard, { adminStatuses } from "../Common/AdminDashboard";
import AdminTools from "../Common/AdminTools";
import PromotionManager from "../Common/PromotionManager";
import PanelLayout, { PanelErrorBoundary } from "../Common/panel/PanelLayout";
import { PanelNavigationProvider, usePanelNavigation } from "../Common/panel/PanelNavigationContext";
import { panelSection, panelSections, safePanelDestination, sectionPath } from "../Common/panel/panelNavigation";
import "./Admin.css";

const FestivalManagement = lazy(() => import("../Common/festivals/FestivalManagement"));
const StaffWorkspace = lazy(() => import("../Common/staff/StaffWorkspace"));
const emptyData = { enquiries: [], total: 0, pages: 1, stats: { total: 0, new: 0, pending: 0, confirmed: 0, cancelled: 0, contacted: 0, closed: 0 } };
export default function Admin({ technical = false }) { return <PanelNavigationProvider><Workspace technical={technical} /></PanelNavigationProvider>; }

function Workspace({ technical }) {
  const basePath = technical ? "/technical" : "/admin";
  const navigate = useNavigate(), location = useLocation(), navigation = usePanelNavigation();
  const navigateRef = useRef(navigate); navigateRef.current = navigate;
  const section = panelSection(location.pathname, basePath);
  const route = useRef(""); route.current = location.pathname + location.search;
  const initial = useRef({ path: route.current, from: location.state?.from });
  const [admin, setAdmin] = useState(null), [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false), [updating, setUpdating] = useState(""), [error, setError] = useState("");
  const [response, setResponse] = useState(null), [loading, setLoading] = useState(false), [lastUpdated, setLastUpdated] = useState(null);
  const [searchInput, setSearchInput] = useState(""), [refresh, setRefresh] = useState(0), [selectedId, setSelectedId] = useState("");
  const actionLock = useRef(false), actionController = useRef(null), alive = useRef(true);
  const params = new URLSearchParams(location.search);
  const search = (params.get("search") || "").trim().slice(0, 120);
  const status = Object.hasOwn(adminStatuses, params.get("status")) ? params.get("status") : "";
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.get("page"), 10) || 1));
  const queryKey = `${basePath}/enquiries?${new URLSearchParams({ page: String(page), search, status })}`;
  const data = response?.key === queryKey ? response.data : emptyData;
  const loaded = response?.key === queryKey;
  const selected = data.enquiries.find((entry) => entry._id === selectedId);
  useEffect(() => { alive.current = true; return () => { alive.current = false; actionController.current?.abort(); }; }, []);
  useEffect(() => { setSearchInput(search); }, [search]);
  const clearAccount = useCallback(() => { setAdmin(null); setResponse(null); setSelectedId(""); setLastUpdated(null); setLoading(false); }, []);
  const handleUnauthorized = useCallback(() => {
    const from = safePanelDestination(route.current, basePath);
    clearAccount(); navigateRef.current(`${basePath}/login`, { replace: true, state: { from } });
  }, [basePath, clearAccount]);
  useEffect(() => {
    const controller = new AbortController();
    api(`${basePath}/me`, { signal: controller.signal }).then(({ admin: account }) => {
      if (controller.signal.aborted) return;
      setAdmin(account);
      if (panelSection(initial.current.path.split("?")[0], basePath) === "login") navigateRef.current(safePanelDestination(initial.current.from, basePath), { replace: true });
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      if (failure.status !== 401) setError(failure.message);
      if (!["register", "forgot-password", "reset-password"].includes(panelSection(initial.current.path.split("?")[0], basePath))) navigateRef.current(`${basePath}/login`, { replace: true, state: { from: safePanelDestination(initial.current.path, basePath) } });
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [basePath]);

  function enquiryQuery(patch, replace = false) {
    const next = { search, status, page, ...patch }, query = new URLSearchParams();
    if (next.search) query.set("search", next.search); if (next.status) query.set("status", next.status); if (next.page > 1) query.set("page", String(next.page));
    navigate(`${basePath}${query.size ? `?${query}` : ""}`, { replace }); setSelectedId("");
  }
  useEffect(() => {
    if (!admin || section !== "enquiries") return;
    const controller = new AbortController(); setLoading(true);
    api(queryKey, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setResponse({ key: queryKey, data: { ...result, stats: { ...emptyData.stats, ...result.stats } } }); setLastUpdated(new Date());
      if (page > result.pages) { const next = new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}), ...(result.pages > 1 ? { page: String(result.pages) } : {}) }); navigate(`${basePath}${next.size ? `?${next}` : ""}`, { replace: true }); }
    }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) handleUnauthorized(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [admin, section, queryKey, refresh, page, search, status, basePath, navigate, handleUnauthorized]);
  useEffect(() => {
    if (!admin || section !== "enquiries") return;
    const reload = () => { if (!document.hidden && !actionLock.current) setRefresh((value) => value + 1); };
    const timer = window.setInterval(reload, 30000); window.addEventListener("focus", reload); document.addEventListener("visibilitychange", reload);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", reload); document.removeEventListener("visibilitychange", reload); };
  }, [admin, section]);

  async function perform(action, onSuccess, updatingId = "") {
    if (actionLock.current) return; actionLock.current = true;
    const controller = new AbortController(); actionController.current = controller;
    if (updatingId) setUpdating(updatingId); else setBusy(true); setError("");
    try { const result = await action(controller.signal); if (alive.current && !controller.signal.aborted) onSuccess(result); }
    catch (failure) { if (alive.current && !controller.signal.aborted) { setError(Object.values(failure.errors || {}).join(" ") || failure.message); if (failure.status === 401 && admin) handleUnauthorized(); } }
    finally { actionLock.current = false; if (alive.current) { setBusy(false); setUpdating(""); } }
  }
  function go(key) {
    if (busy || updating || !navigation.confirmNavigation()) return false;
    setError(""); setSelectedId(""); navigate(sectionPath(basePath, key)); return true;
  }
  function login(credentials) {
    void perform((signal) => api(`${basePath}/login`, { method: "POST", body: JSON.stringify(credentials), signal }), ({ admin: account }) => { setAdmin(account); navigate(safePanelDestination(location.state?.from, basePath), { replace: true }); });
  }
  function logout() {
    if (!navigation.confirmNavigation()) return;
    void perform((signal) => api(`${basePath}/logout`, { method: "POST", body: "{}", signal }), () => { clearAccount(); navigate(`${basePath}/login`, { replace: true }); });
  }
  function updateStatus(id, nextStatus) { void perform((signal) => api(`${basePath}/enquiries/${id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }), signal }), () => setRefresh((value) => value + 1), id); }
  function deleteEnquiry(id) {
    if (actionLock.current || !window.confirm("Delete this enquiry permanently?")) return;
    void perform((signal) => api(`${basePath}/enquiries/${id}`, { method: "DELETE", signal }), () => { setSelectedId(""); setRefresh((value) => value + 1); }, id);
  }
  const toolError = useCallback((message) => setError(message), []);
  const sectionInfo = panelSections[section];
  const forbidden = sectionInfo && ((sectionInfo.technical && !technical) || (sectionInfo.accountManagement && !admin?.canManageAccounts) || (sectionInfo.permission && !admin?.staffPermissions?.includes(sectionInfo.permission)));
  if (checking) return <section className="admin-checking"><h1>{technical ? "Technical Panel" : "Admin Panel"}</h1><p role="status">Checking your session…</p></section>;
  if (!admin || ["register", "forgot-password", "reset-password"].includes(section)) return <PanelAuth technical={technical} busy={busy} error={error} onError={setError} onLogin={login} />;
  return <div className="admin-shell"><PanelLayout admin={admin} technical={technical} section={section} busy={busy || !!updating} onNavigate={go} onLogout={logout}>
    {error && !["enquiries", "hotels", "vouchers"].includes(section) && <p className="admin-error panel-global-error" role="alert">{error}</p>}
    <PanelErrorBoundary key={section} onHome={() => go("enquiries")}><Suspense fallback={<div className="admin-tools" role="status">Loading workspace…</div>}>
      {forbidden ? <section className="panel-failure"><h1>Access restricted</h1><p>Your account does not have permission to open this section.</p><button className="dashboard-button" onClick={() => go("enquiries")}>Back to enquiries</button></section> : section === "accounts" ? <AccountManager apiBase={basePath} admin={admin} onUnauthorized={handleUnauthorized} /> : section === "voucher-history" ? <VoucherHistory apiBase={basePath} onUnauthorized={handleUnauthorized} /> : section.startsWith("staff") ? <StaffWorkspace key={section} apiBase={basePath} technical={technical} admin={admin} section={section} onSection={go} onBack={() => go("enquiries")} onUnauthorized={handleUnauthorized} onLogout={logout} /> : section === "festivals" ? <FestivalManagement admin={admin} onBack={() => go("enquiries")} onUnauthorized={handleUnauthorized} onLogout={logout} /> : section === "promotions" ? <PromotionManager apiBase={basePath} onBack={() => go("enquiries")} onUnauthorized={handleUnauthorized} /> : ["hotels", "vouchers"].includes(section) ? <AdminTools key={section} apiBase={basePath} technical={technical} tool={section} onBack={() => go("enquiries")} onUnauthorized={handleUnauthorized} onError={toolError} error={error} /> : section !== "enquiries" ? <section className="panel-failure"><h1>Section not found</h1><p>Choose a section from the workspace navigation.</p><button className="dashboard-button" onClick={() => go("enquiries")}>Back to enquiries</button></section> : <AdminDashboard technical={technical} admin={admin} data={data} loaded={loaded} loading={loading} busy={busy} updating={updating} error={error} searchInput={searchInput} search={search} status={status} page={page} lastUpdated={lastUpdated} selected={selected} onSearchInput={(value) => { setSearchInput(value); if (!value && search) enquiryQuery({ search: "", page: 1 }); }} onSearch={(event) => { event.preventDefault(); enquiryQuery({ search: searchInput.trim(), page: 1 }); }} onStatusFilter={(value) => enquiryQuery({ status: value, page: 1 })} onSelectStatus={(value) => enquiryQuery({ status: value, search: "", page: 1 })} onClearFilters={() => enquiryQuery({ status: "", search: "", page: 1 })} onPage={(value) => enquiryQuery({ page: value })} onOpen={setSelectedId} onClose={() => setSelectedId("")} onUpdate={updateStatus} onDelete={deleteEnquiry} onRefresh={() => { setError(""); setRefresh((value) => value + 1); }} onLogout={logout} onTool={go} />}
    </Suspense></PanelErrorBoundary>
  </PanelLayout></div>;
}
