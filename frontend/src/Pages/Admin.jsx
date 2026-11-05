import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../Common/api";
import { Icon } from "../Common/SiteUI";
import AdminDashboard from "../Common/AdminDashboard";
import AdminTools from "../Common/AdminTools";
import "./Admin.css";

const emptyData = { enquiries: [], total: 0, pages: 1, stats: { total: 0, new: 0, pending: 0, confirmed: 0, cancelled: 0, contacted: 0, closed: 0 } };

export default function Admin() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [admin, setAdmin] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState("");
  const [data, setData] = useState(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTool, setActiveTool] = useState("");
  const intentionalLogout = useRef(false);
  const selected = data.enquiries.find((entry) => entry._id === selectedId);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [activeTool, page, showHistory, status]);

  function clearAdminState() {
    setAdmin(null); setData(emptyData); setSelectedId(""); setPage(1); setSearch(""); setSearchInput(""); setStatus(""); setHistory([]); setShowHistory(false); setActiveTool("");
    setLoaded(false); setLastUpdated(null);
  }

  useEffect(() => {
    const signOutOnPageExit = () => {
      if (intentionalLogout.current) return;
      void fetch("/api/admin/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        keepalive: true,
      }).catch((failure) => console.error("Could not sign out before leaving the admin panel.", failure));
    };
    const handlePageShow = (event) => {
      if (!event.persisted) return;
      clearAdminState();
      navigate("/admin/login", { replace: true });
    };
    window.addEventListener("pagehide", signOutOnPageExit);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pagehide", signOutOnPageExit);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [navigate]);

  useEffect(() => {
    const controller = new AbortController();
    api("/admin/me", { signal: controller.signal }).then(({ admin: account }) => {
      setAdmin(account);
      navigate("/admin", { replace: true });
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      if (failure.status !== 401) setError(failure.message);
      navigate("/admin/login", { replace: true });
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [navigate]);

  useEffect(() => {
    if (!admin) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page), search, status });
    api(`/admin/enquiries?${query}`, { signal: controller.signal }).then((result) => {
      setData({ ...result, stats: { ...emptyData.stats, ...result.stats } });
      setLoaded(true);
      setLastUpdated(new Date());
      if (page > result.pages) setPage(result.pages);
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setError(failure.message);
      if (failure.status === 401) { setAdmin(null); setData(emptyData); setLoaded(false); setLastUpdated(null); navigate("/admin/login", { replace: true }); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [admin, page, search, status, refresh, navigate]);

  useEffect(() => {
    if (!admin || !loaded) return undefined;
    const timer = window.setInterval(() => setRefresh((value) => value + 1), 5000);
    return () => window.clearInterval(timer);
  }, [admin, loaded]);

  useEffect(() => {
    if (!admin || !showHistory) return undefined;
    const controller = new AbortController();
    api("/admin/history", { signal: controller.signal }).then((result) => setHistory(result.history || [])).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [admin, showHistory, refresh]);

  async function login(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setPassword("");
      setAdmin(result.admin);
      navigate("/admin", { replace: true });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function logout() {
    intentionalLogout.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/admin/logout", { method: "POST", body: "{}" });
      clearAdminState();
      intentionalLogout.current = false;
      navigate("/admin/login", { replace: true });
    } catch (failure) { intentionalLogout.current = false; setError(failure.message); }
    finally { setBusy(false); }
  }
  async function updateStatus(id, nextStatus) {
    setUpdating(id);
    setError("");
    try {
      await api(`/admin/enquiries/${id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 401) { setAdmin(null); setData(emptyData); setLoaded(false); setLastUpdated(null); navigate("/admin/login", { replace: true }); }
    } finally { setUpdating(""); }
  }
  async function deleteEnquiry(id) {
    if (!window.confirm("Delete this enquiry? Its history will be kept.")) return;
    setUpdating(id);
    setError("");
    try {
      await api(`/admin/enquiries/${id}`, { method: "DELETE" });
      setSelectedId("");
      setRefresh((value) => value + 1);
    } catch (failure) { setError(failure.message); }
    finally { setUpdating(""); }
  }

  function selectStatus(value, clearSearch = true) {
    setStatus(value);
    setPage(1);
    setSelectedId("");
    if (clearSearch) { setSearch(""); setSearchInput(""); }
  }

  if (checking) return <section className="admin-checking"><h1>Admin workspace</h1><p role="status">Checking your session…</p></section>;
  return <div className="admin-shell">
    {!admin && <header className="admin-header"><Link to="/" aria-label="Eternal India home"><img src="/logo.webp" alt="Eternal India" width="183" height="58" /></Link><span className="admin-header-label">Administration</span><div className="admin-header-actions"><Link to="/request-quote">View enquiry form<Icon name="diagonal" size={15} /></Link>{admin && <button type="button" onClick={logout} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>}</div></header>}
    {!admin ? <div className="admin-login-layout">
      <div className="admin-login-story"><span className="admin-eyebrow">ETERNAL INDIA · ADMIN</span><Icon name="compass" size={52} /><h1>Every enquiry.<br /><em>A new journey.</em></h1><p>A dedicated space to follow up on travel plans, connect with guests and take care of the next step.</p><div className="admin-story-foot"><span className="availability-dot" />Your travel enquiries, in one place.</div></div>
      <form className="admin-login-form" onSubmit={login}>
        <span className="admin-eyebrow">WELCOME BACK</span><h2>Sign in to your workspace.</h2><p>Use your administrator account to view travel enquiries.</p>
        <label htmlFor="admin-email">Email address</label><input id="admin-email" type="email" autoComplete="username" required maxLength={200} value={email} onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="admin-password">Password</label><input id="admin-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="admin-error" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<Icon size={18} /></button>
        <span className="admin-login-note">For Eternal India administrators.</span>
      </form>
    </div> : activeTool ? <AdminTools tool={activeTool} onBack={() => { setActiveTool(""); setError(""); }} onError={setError} error={error} /> : <AdminDashboard
      admin={admin} data={data} loaded={loaded} loading={loading} busy={busy}
      updating={updating} error={error} searchInput={searchInput} search={search}
      status={status} page={page} lastUpdated={lastUpdated} selected={selected}
      onSearchInput={(value) => { setSearchInput(value); if (!value) { setSearch(""); setPage(1); } }}
      onSearch={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1); setSelectedId(""); }}
      onStatusFilter={(value) => selectStatus(value, false)}
      onSelectStatus={selectStatus} onClearFilters={() => selectStatus("")}
      onPage={(value) => { setPage(value); setSelectedId(""); }}
      onOpen={setSelectedId} onClose={() => setSelectedId("")}
      onUpdate={updateStatus} onDelete={deleteEnquiry} onRefresh={() => setRefresh((value) => value + 1)} onLogout={logout}
      history={history} showHistory={showHistory} onToggleHistory={() => setShowHistory((value) => !value)} onTool={(tool) => { setError(""); setActiveTool(tool); }}
    />}
    <footer className="admin-footer">Eternal India · Thoughtfully planned. Personally yours.</footer>
  </div>;
}
