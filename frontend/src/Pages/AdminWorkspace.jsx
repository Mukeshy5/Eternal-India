import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../Common/api";
import PanelAuth from "../Common/PanelAuth";
import AccountManager from "../Common/AccountManager";
import VoucherHistory from "../Common/VoucherHistory";
import AdminDashboard from "../Common/AdminDashboard";
import AdminTools from "../Common/AdminTools";
import GstManager from "../Common/GstManager";
import OfficeAddressManager from "../Common/OfficeAddressManager";
import PromotionManager from "../Common/PromotionManager";
import PanelLayout, { PanelErrorBoundary } from "../Common/panel/PanelLayout";
import TechnicalSecurity from "../Common/panel/TechnicalSecurity";
import { PanelNavigationProvider, usePanelNavigation } from "../Common/panel/PanelNavigationContext";
import { panelSection, panelSections, safePanelDestination, sectionPath } from "../Common/panel/panelNavigation";
import "./Admin.css";
import { enquirySources, enquiryStatus, enquirySorts, enquiryKinds } from "../../../shared/enquiries.js";
import useEnquiryNotifications from "../Common/useEnquiryNotifications";
import EnquiryNotifications from "../Common/EnquiryNotifications";
import NotificationCenter from "../Common/NotificationCenter";

const FestivalManagement = lazy(() => import("../Common/festivals/FestivalManagement"));
const StaffWorkspace = lazy(() => import("../Common/staff/StaffWorkspace"));
const LetterWorkspace = lazy(() => import("../Common/letters/LetterWorkspace"));
const PaymentManagement = lazy(() => import("../Common/PaymentManagement"));
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
  const authNotice = useRef("");
  const authReturn = useRef("");
  const params = new URLSearchParams(location.search);
  const search = (params.get("search") || "").trim().slice(0, 120);
  const status = enquiryStatus(params.get("status"));
  const source = Object.hasOwn(enquirySources, params.get("source")) ? params.get("source") : "";
  const kind = Object.hasOwn(enquiryKinds, params.get("kind")) ? params.get("kind") : "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.get("from")) ? params.get("from") : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.get("to")) ? params.get("to") : "";
  const archived = params.get("archived") === "true";
  const sort = Object.hasOwn(enquirySorts, params.get("sort")) ? params.get("sort") : "newest";
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.get("page"), 10) || 1));
  const queryKey = `${basePath}/enquiries?${new URLSearchParams({ page: String(page), search, status, source, ...(kind ? { kind } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(sort !== "newest" ? { sort } : {}), ...(archived ? { archived: "true" } : {}) })}`;
  const data = response?.key === queryKey ? response.data : emptyData;
  const loaded = response?.key === queryKey;
  const [detail, setDetail] = useState(null), [assignees, setAssignees] = useState([]);
  const selected = detail?._id === selectedId ? detail : data.enquiries.find((entry) => entry._id === selectedId);
  useEffect(() => { alive.current = true; return () => { alive.current = false; actionController.current?.abort(); }; }, []);
  useEffect(() => { setSearchInput(search); }, [search]);
  const clearAccount = useCallback(() => { setAdmin(null); setResponse(null); setSelectedId(""); setDetail(null); setAssignees([]); setLastUpdated(null); setLoading(false); }, []);
  const handleUnauthorized = useCallback((message, { notice = false } = {}) => {
    if (notice) authNotice.current = message;
    if (!route.current.startsWith(`${basePath}/login`)) authReturn.current = safePanelDestination(route.current, basePath);
    const from = authReturn.current || safePanelDestination(route.current, basePath);
    clearAccount(); navigateRef.current(`${basePath}/login`, { replace: true, state: { from, notice: authNotice.current || (typeof message === "string" ? message : "") } });
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
  useEffect(() => {
    if (technical && section === "register") navigate(`${basePath}/login`, { replace: true });
  }, [technical, section, basePath, navigate]);

  function enquiryQuery(patch, replace = false) {
    const next = { search, status, source, kind, from, to, page, archived, sort, ...patch }, query = new URLSearchParams();
    for (const key of ["kind", "from", "to"]) if (next[key]) query.set(key, next[key]);
    if (next.sort !== "newest") query.set("sort", next.sort);
    if (next.source) query.set("source", next.source); if (next.search) query.set("search", next.search); if (next.status) query.set("status", next.status); if (next.page > 1) query.set("page", String(next.page)); if (next.archived) query.set("archived", "true");
    navigate(`${basePath}${query.size ? `?${query}` : ""}`, { replace }); setSelectedId("");
  }
  useEffect(() => {
    if (!admin || section !== "enquiries") return;
    const controller = new AbortController(); setLoading(true);
    api(queryKey, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setResponse({ key: queryKey, data: { ...result, stats: { ...emptyData.stats, ...result.stats } } }); setLastUpdated(new Date());
      if (page > result.pages) { const next = new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}), ...(source ? { source } : {}), ...(kind ? { kind } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(sort !== "newest" ? { sort } : {}), ...(archived ? { archived: "true" } : {}), ...(result.pages > 1 ? { page: String(result.pages) } : {}) }); navigate(`${basePath}${next.size ? `?${next}` : ""}`, { replace: true }); }
    }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) handleUnauthorized(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [admin, section, queryKey, refresh, page, search, status, source, kind, from, to, archived, sort, basePath, navigate, handleUnauthorized]);
  const notifications = useEnquiryNotifications({ admin, apiBase: basePath, onRefresh: () => setRefresh((value) => value + 1), onUnauthorized: handleUnauthorized });
  useEffect(() => {
    if (!admin || !selectedId) return;
    const controller = new AbortController();
    api(`${basePath}/enquiries/${selectedId}`, { signal: controller.signal }).then(({ enquiry }) => { if (!controller.signal.aborted) setDetail(enquiry); }).catch((failure) => { if (!controller.signal.aborted) { setError("The complete enquiry could not be loaded. Refresh the inbox and try again."); if (failure.status === 401) handleUnauthorized(); } });
    api(`${basePath}/enquiry-assignees`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setAssignees(result.assignees); }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) handleUnauthorized(); } });
    return () => controller.abort();
  }, [admin, selectedId, refresh, basePath, handleUnauthorized]);
  function openEnquiry(id) { if (!navigation.confirmNavigation()) return; setSelectedId(id); setDetail(null); if (section !== "enquiries") navigate(basePath); }
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
    void perform((signal) => api(`${basePath}/login`, { method: "POST", body: JSON.stringify(credentials), signal }), ({ admin: account }) => { authNotice.current = ""; authReturn.current = ""; setAdmin(account); navigate(safePanelDestination(location.state?.from, basePath), { replace: true }); });
  }
  function logout() {
    if (!navigation.confirmNavigation()) return;
    void perform((signal) => api(`${basePath}/logout`, { method: "POST", body: "{}", signal }), () => { clearAccount(); navigate(`${basePath}/login`, { replace: true }); });
  }
  function passwordChanged(message) {
    authNotice.current = message;
    clearAccount();
    navigate(`${basePath}/login`, { replace: true, state: { notice: message } });
  }
  function updateStatus(id, nextStatus) { void perform((signal) => api(`${basePath}/enquiries/${id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }), signal }), () => setRefresh((value) => value + 1), id); }
  function archiveEnquiry(id, archive) {
    void perform((signal) => api(`${basePath}/enquiries/${id}`, { method: "PATCH", body: JSON.stringify({ archive }), signal }), () => {
      setSelectedId(""); setRefresh((value) => value + 1);
      if (!archive && archived) enquiryQuery({ archived: false, page: 1 });
    }, id);
  }
  function permanentlyDeleteEnquiry(id) {
    if (actionLock.current || !window.confirm("Permanently delete this enquiry and its message? This cannot be undone.")) return;
    void perform((signal) => api(`${basePath}/enquiries/${id}/permanent`, { method: "DELETE", signal }), () => { setSelectedId(""); setRefresh((value) => value + 1); }, id);
  }
  const toolError = useCallback((message) => setError(message), []);
  const sectionInfo = panelSections[section];
  const forbidden = sectionInfo && ((sectionInfo.adminPanelOnly && technical) || (sectionInfo.technical && !technical) || (sectionInfo.adminOnly && (technical || !admin?.canManageAccounts)) || (sectionInfo.permission && !admin?.staffPermissions?.includes(sectionInfo.permission)));
  if (checking) return <section className="admin-checking"><h1>{technical ? "Technical Panel" : "Admin Panel"}</h1><p role="status">Checking your session…</p></section>;
  if (technical && section === "register") return null;
  if (!admin || ["register", "forgot-password", "reset-password"].includes(section)) return <PanelAuth technical={technical} busy={busy} error={error} onError={setError} onLogin={login} />;
  return <div className="admin-shell"><PanelLayout admin={admin} technical={technical} section={section} busy={busy || !!updating} onNavigate={go} onLogout={logout} notifications={<EnquiryNotifications notifications={notifications} onOpen={openEnquiry} onOpenAll={() => go("notifications")} />}>
    {error && !["enquiries", "hotels", "vouchers"].includes(section) && <p className="admin-error panel-global-error" role="alert">{error}</p>}
    <PanelErrorBoundary key={section} onHome={() => go("enquiries")}><Suspense fallback={<div className="admin-tools" role="status">Loading workspace…</div>}>
      {forbidden ? <section className="panel-failure"><h1>Access restricted</h1><p>Your account does not have permission to open this section.</p><button className="dashboard-button" onClick={() => go("enquiries")}>Back to enquiries</button></section> : section === "notifications" ? <NotificationCenter notifications={notifications} onOpenEnquiry={openEnquiry} /> : section === "payments" ? <PaymentManagement onUnauthorized={handleUnauthorized} /> : section === "accounts" ? <AccountManager apiBase={basePath} admin={admin} onUnauthorized={handleUnauthorized} /> : section === "office-addresses" ? <OfficeAddressManager apiBase={basePath} onUnauthorized={handleUnauthorized} /> : section === "gst" ? <GstManager apiBase={basePath} onUnauthorized={handleUnauthorized} /> : section === "security" && technical ? <TechnicalSecurity apiBase={basePath} admin={admin} onUnauthorized={handleUnauthorized} onPasswordChanged={passwordChanged} /> : section === "voucher-history" ? <VoucherHistory apiBase={basePath} onUnauthorized={handleUnauthorized} /> : ["joining-letters", "experience-letters"].includes(section) ? <LetterWorkspace key={section} type={section === "joining-letters" ? "joining" : "experience"} apiBase={basePath} admin={admin} onUnauthorized={handleUnauthorized} /> : section.startsWith("staff") ? <StaffWorkspace key={section} apiBase={basePath} technical={technical} admin={admin} section={section} onSection={go} onBack={() => go("enquiries")} onUnauthorized={handleUnauthorized} onLogout={logout} /> : section === "festivals" ? <FestivalManagement admin={admin} onBack={() => go("enquiries")} onUnauthorized={handleUnauthorized} onLogout={logout} /> : section === "promotions" ? <PromotionManager apiBase={basePath} onBack={() => go("enquiries")} onUnauthorized={handleUnauthorized} /> : ["hotels", "vouchers"].includes(section) ? <AdminTools key={section} apiBase={basePath} technical={technical} tool={section} onBack={() => go("enquiries")} onUnauthorized={handleUnauthorized} onError={toolError} error={error} /> : section !== "enquiries" ? <section className="panel-failure"><h1>Section not found</h1><p>Choose a section from the workspace navigation.</p><button className="dashboard-button" onClick={() => go("enquiries")}>Back to enquiries</button></section> : <AdminDashboard kind={kind} from={from} to={to} onKind={(value) => enquiryQuery({ kind: value, source: "", page: 1 })} onDateRange={(patch) => enquiryQuery({ ...patch, page: 1 })} sort={sort} onSort={(value) => enquiryQuery({ sort: value, page: 1 })} archived={archived} onToggleArchived={(value) => enquiryQuery({ archived: value, page: 1 })} source={source} onSource={(value) => enquiryQuery({ source: value, kind: "", page: 1 })} apiBase={basePath} onUnauthorized={handleUnauthorized} assignees={assignees} onAssign={(id, assignedTo) => { void perform((signal) => api(`${basePath}/enquiries/${id}`, { method: "PATCH", body: JSON.stringify({ assignedTo }), signal }), () => setRefresh((value) => value + 1), id); }} technical={technical} admin={admin} data={data} loaded={loaded} loading={loading} updating={updating} error={error} searchInput={searchInput} search={search} status={status} page={page} lastUpdated={lastUpdated} selected={selected} onSearchInput={(value) => { setSearchInput(value); if (!value && search) enquiryQuery({ search: "", page: 1 }); }} onSearch={(event) => { event.preventDefault(); enquiryQuery({ search: searchInput.trim(), page: 1 }); }} onStatusFilter={(value) => enquiryQuery({ status: value, page: 1 })} onSelectStatus={(value) => enquiryQuery({ status: value, search: "", page: 1 })} onClearFilters={() => enquiryQuery({ status: "", search: "", source: "", kind: "", from: "", to: "", page: 1 })} onPage={(value) => enquiryQuery({ page: value })} onOpen={openEnquiry} onClose={() => setSelectedId("")} onUpdate={updateStatus} onArchive={archiveEnquiry} onPermanentDelete={permanentlyDeleteEnquiry} onRefresh={() => { setError(""); setRefresh((value) => value + 1); }} onLogout={logout} onTool={go} />}
    </Suspense></PanelErrorBoundary>
  </PanelLayout></div>;
}
