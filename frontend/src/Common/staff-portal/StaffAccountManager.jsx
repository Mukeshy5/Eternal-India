import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { usePanelNavigationGuard } from "../panel/PanelNavigationContext";
import "./portal.css";

const blank = { employeeId: "", username: "", password: "" };
export default function StaffAccountManager({ onUnauthorized }) {
  const [form, setForm] = useState(blank), [employee, setEmployee] = useState(null), [hasAccount, setHasAccount] = useState(false);
  const [data, setData] = useState(null), [search, setSearch] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [showPassword, setShowPassword] = useState(false), [verifying, setVerifying] = useState(false);
  const [selected, setSelected] = useState(null), [password, setPassword] = useState(""), [invoiceSearch, setInvoiceSearch] = useState(""), [invoiceQuery, setInvoiceQuery] = useState(""), [options, setOptions] = useState([]), [granted, setGranted] = useState([]);
  const lock = useRef(false), lookup = useRef(null), operation = useRef(null);
  usePanelNavigationGuard(Boolean(form.employeeId || form.username || form.password || password), busy);
  useEffect(() => () => { lookup.current?.abort(); operation.current?.abort(); }, []);
  const fail = useCallback((failure) => { if (failure.name === "AbortError") return; setError(failure.message); if (failure.status === 401) onUnauthorized?.(); }, [onUnauthorized]);
  useEffect(() => {
    const controller = new AbortController(); let running = false;
    const load = async () => {
      if (running) return; running = true;
      try { const result = await api(`/technical/staff-accounts?${new URLSearchParams({ search: query, page })}`, { signal: controller.signal }); if (!controller.signal.aborted) setData(result); }
      catch (failure) { if (!controller.signal.aborted) fail(failure); }
      finally { running = false; if (!controller.signal.aborted) setLoading(false); }
    };
    setLoading(true); void load(); const timer = window.setInterval(load, 15000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [query, page, refresh, fail]);
  useEffect(() => {
    if (!selected) return undefined;
    const controller = new AbortController(); setOptions([]); setGranted([]);
    Promise.all([api(`/technical/staff-invoice-options?${new URLSearchParams({ search: invoiceQuery })}`, { signal: controller.signal }), api(`/technical/staff-accounts/${selected._id}/invoices`, { signal: controller.signal })]).then(([available, assigned]) => { if (!controller.signal.aborted) { setOptions(available.invoices); setGranted(assigned.invoices); } }).catch((failure) => { if (!controller.signal.aborted) fail(failure); });
    return () => controller.abort();
  }, [selected, invoiceQuery, refresh, fail]);
  async function run(action) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    const controller = new AbortController(); operation.current = controller;
    try { await action(controller.signal); } catch (failure) { if (!controller.signal.aborted) fail(failure); }
    finally { lock.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  function verifyEmployee() {
    lookup.current?.abort(); const controller = new AbortController(); lookup.current = controller;
    setEmployee(null); setHasAccount(false); setError(""); setVerifying(true);
    void api(`/technical/staff-account-employee?${new URLSearchParams({ employeeId: form.employeeId })}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) { setEmployee(result.employee); setHasAccount(result.hasAccount); } }).catch((failure) => { if (!controller.signal.aborted) fail(failure); }).finally(() => { if (!controller.signal.aborted) setVerifying(false); });
  }
  function create(event) {
    event.preventDefault(); if (!employee || hasAccount) return;
    void run(async (signal) => { const result = await api("/technical/staff-accounts", { method: "POST", body: JSON.stringify(form), signal }); if (signal.aborted) return; setNotice(`${result.message} Username: ${result.account.username}`); setForm(blank); setEmployee(null); setShowPassword(false); setRefresh((value) => value + 1); });
  }
  function change(account, status) {
    if (!window.confirm(`${status === "active" ? "Activate" : "Deactivate"} Staff Login for ${account.employeeId}? Existing sessions will be revoked.`)) return;
    void run(async (signal) => { const result = await api(`/technical/staff-accounts/${account._id}`, { method: "PATCH", body: JSON.stringify({ status, version: account.version }), signal }); if (!signal.aborted) { setNotice(result.message); setSelected(null); setRefresh((value) => value + 1); } });
  }
  function remove(account) {
    if (!window.confirm(`Delete the Staff Login account for ${account.employeeId}? Employee, attendance, invoice and journey records will be retained.`)) return;
    void run(async (signal) => { await api(`/technical/staff-accounts/${account._id}`, { method: "DELETE", body: JSON.stringify({ version: account.version }), signal }); if (!signal.aborted) { setNotice("Staff Login deleted. Employee records are retained."); setSelected(null); setRefresh((value) => value + 1); } });
  }
  function authorize(invoice, authorized) { void run(async (signal) => { const result = await api(`/technical/staff-accounts/${selected._id}/invoices/${invoice._id}`, { method: "PATCH", body: JSON.stringify({ authorized }), signal }); if (!signal.aborted) { setNotice(result.message); setRefresh((value) => value + 1); } }); }
  return <section className="staff-portal staff-account-manager">
    <header className="staff-page-heading"><div><span className="staff-eyebrow">TECHNICAL PANEL / PEOPLE</span><h1>Staff Login Accounts</h1><p>Create and control staff access using verified employee records.</p></div><a href="/staff/login" target="_blank" rel="noreferrer">Open Staff Login ↗</a></header>
    {error && <p className="staff-error" role="alert">{error}</p>}{notice && <p className="staff-success" role="status">{notice}</p>}
    <form className="staff-surface staff-create-form" onSubmit={create}>
      <h2>Create staff account</h2><p>Verify an active employee, then assign a unique username and secure password.</p>
      <div className="staff-fields"><label>Employee ID<input name="employeeId" required maxLength={15} placeholder="EI-…" value={form.employeeId} onChange={(event) => { lookup.current?.abort(); setVerifying(false); setEmployee(null); setHasAccount(false); setForm((current) => ({ ...current, employeeId: event.target.value.toUpperCase() })); }} /></label><button type="button" disabled={busy || verifying || !form.employeeId} onClick={verifyEmployee}>{verifying ? "Verifying…" : "Verify employee"}</button></div>
      {employee && <div className="staff-employee-summary"><strong>{employee.name} · {employee.employeeId}</strong><span>{employee.designation} · {employee.department}</span><span>{employee.email} · {employee.phone}</span><small>{hasAccount ? "This employee already has a Staff Login account." : "Active employee verified. Details will be linked automatically."}</small></div>}
      <div className="staff-fields"><label>Username<input name="username" autoComplete="off" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} /></label><label>Password<input name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={256} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /><small>12+ characters, uppercase, lowercase, number and symbol.</small></label></div>
      <div className="staff-actions"><button type="button" disabled={busy} onClick={() => void run(async (signal) => { const result = await api("/technical/staff-credentials", { method: "POST", body: "{}", signal }); if (!signal.aborted) { setForm((current) => ({ ...current, ...result })); setShowPassword(true); } })}>Generate secure credentials</button><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide password" : "Show password"}</button><button type="submit" className="staff-primary" disabled={busy || !employee || hasAccount}>{busy ? "Saving…" : "Create Staff Login"}</button></div>
    </form>
    <section className="staff-surface"><div className="staff-section-heading"><h2>Staff accounts</h2><span>{data?.total ?? "—"} accounts</span></div><form className="staff-fields" onSubmit={(event) => { event.preventDefault(); setQuery(search); setPage(1); }}><label>Find account<input type="search" placeholder="Employee ID or username" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button>Search</button><button type="button" onClick={() => setRefresh((value) => value + 1)}>Refresh</button></form>
      {loading && <p role="status">Loading staff accounts…</p>}
      <div className="staff-table-wrap"><table><thead><tr><th>Employee</th><th>Username</th><th>Employee status</th><th>Login status</th><th>Actions</th></tr></thead><tbody>{data?.accounts.map((account) => <tr key={account._id}><td><strong>{account.employee?.name || "Employee unavailable"}</strong><small>{account.employeeId}</small></td><td>@{account.username}</td><td>{account.employee?.status || "Unavailable"}</td><td><span className={`staff-badge ${account.status === "active" ? "is-active" : ""}`}>{account.status}</span></td><td><div className="staff-actions"><button disabled={busy || account.status !== "active" && account.employee?.status !== "active"} onClick={() => change(account, account.status === "active" ? "inactive" : "active")}>{account.status === "active" ? "Deactivate" : "Activate"}</button><button disabled={busy} onClick={() => { setSelected(account); setPassword(""); setInvoiceSearch(""); setInvoiceQuery(""); }}>Manage access</button><button disabled={busy} className="staff-danger" onClick={() => remove(account)}>Delete login</button></div></td></tr>)}</tbody></table></div>
      {!loading && !data?.total && <p className="staff-empty">No staff accounts found. Verify an employee above to create one.</p>}
      <div className="staff-pagination"><button disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {data?.page || page} of {data?.pages || 1}</span><button disabled={loading || page >= (data?.pages || 1)} onClick={() => setPage((value) => value + 1)}>Next</button></div>
    </section>
    {selected && <section className="staff-surface" aria-label="Manage staff access"><div className="staff-section-heading"><h2>Access for {selected.employeeId}</h2><button onClick={() => { setSelected(null); setPassword(""); }}>Close</button></div>
      <form className="staff-fields" onSubmit={(event) => { event.preventDefault(); void run(async (signal) => { const result = await api(`/technical/staff-accounts/${selected._id}`, { method: "PATCH", body: JSON.stringify({ version: selected.version, password }), signal }); if (!signal.aborted) { setNotice(result.message); setSelected(result.account); setPassword(""); setRefresh((value) => value + 1); } }); }}><label>Reset assigned password<input name="resetPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} /></label><button disabled={busy}>Reset password & revoke sessions</button></form>
      <section className="staff-activity-access"><div><strong>Peer activity history</strong><p>Allow this staff account to view activity performed by other Staff accounts. Changes apply immediately.</p></div><button type="button" disabled={busy} onClick={() => void run(async (signal) => { const result = await api(`/technical/staff-accounts/${selected._id}`, { method: "PATCH", body: JSON.stringify({ version: selected.version, canViewActivity: !selected.canViewActivity }), signal }); if (!signal.aborted) { setSelected(result.account); setNotice(result.account.canViewActivity ? "Peer activity access enabled." : "Peer activity access revoked."); setRefresh((value) => value + 1); } })}>{selected.canViewActivity ? "Revoke access" : "Grant access"}</button></section>
      <h3>Authorized billing invoices</h3><p>Staff can view and download only invoices granted here. Search returns up to 50 matching invoices.</p>
      <div className="staff-actions">{granted.map((invoice) => <button key={invoice._id} disabled={busy} onClick={() => authorize(invoice, false)}>Revoke {invoice.invoiceNumber}</button>)}</div>
      <form className="staff-fields" onSubmit={(event) => { event.preventDefault(); setInvoiceQuery(invoiceSearch); }}><label>Find invoice<input type="search" placeholder="Invoice number or client" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} /></label><button>Find invoices</button></form>
      <div className="staff-table-wrap"><table><thead><tr><th>Invoice</th><th>Client</th><th>Access</th></tr></thead><tbody>{options.map((invoice) => { const authorized = granted.some((row) => row._id === invoice._id); return <tr key={invoice._id}><td>{invoice.invoiceNumber}</td><td>{invoice.clientName}</td><td><button disabled={busy} onClick={() => authorize(invoice, !authorized)}>{authorized ? "Revoke access" : "Grant access"}</button></td></tr>; })}</tbody></table></div>
    </section>}
  </section>;
}
