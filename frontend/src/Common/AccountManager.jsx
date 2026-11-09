import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { usePanelNavigationGuard } from "./panel/PanelNavigationContext";
import "./AdminTools.css";

export default function AccountManager({ apiBase, admin, onUnauthorized }) {
  const [accounts, setAccounts] = useState([]), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [role, setRole] = useState("technical");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const lock = useRef(false);
  usePanelNavigationGuard(!!email || !!password, busy, "Discard the account details you entered?");
  useEffect(() => {
    const controller = new AbortController();
    api(`${apiBase}/accounts`, { signal: controller.signal }).then((result) => setAccounts(result.accounts)).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiBase, onUnauthorized]);
  async function perform(action, message) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); setAccounts((await api(`${apiBase}/accounts`)).accounts); setNotice(message); }
    catch (failure) { setError(failure.message); if (failure.status === 401) onUnauthorized(); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="admin-tools"><header className="admin-tools-heading"><div><span className="dashboard-section-label">ADMINISTRATION / ACCESS</span><h1>Panel accounts</h1><p>Create login credentials for the Admin and Technical panels and approve account requests.</p></div></header>
    {error && <p className="admin-error" role="alert">{error}</p>}{notice && <p className="admin-success" role="status">{notice}</p>}
    <form className="admin-tool-card admin-tool-form" onSubmit={(event) => { event.preventDefault(); void perform(async () => { await api(`${apiBase}/accounts`, { method: "POST", body: JSON.stringify({ email, password, role }) }); setEmail(""); setPassword(""); }, "Account created. Share the login details privately with the account holder."); }}>
      <h2>Create account</h2><fieldset disabled={busy} className="panel-auth-fields"><div className="admin-tool-grid"><label className="admin-tool-field"><span>Panel</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="technical">Technical Panel</option><option value="admin">Admin Panel</option></select></label><label className="admin-tool-field"><span>Login email</span><input name="accountEmail" type="email" required maxLength={200} autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="admin-tool-field"><span>Password</span><input name="accountPassword" type="password" required minLength={8} maxLength={256} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label></div><button className="dashboard-button dashboard-button-primary" disabled={busy}>{busy ? "Saving…" : "Create login credentials"}</button></fieldset>
    </form>
    <section className="admin-tool-card panel-records"><h2>Accounts & requests</h2>{loading && <p role="status">Loading accounts…</p>}{accounts.map((account) => <article className="panel-record-row" key={account._id}><div><strong>{account.email}</strong><p>{account.status === "pending" ? "Awaiting approval" : `${account.roles.join(", ")} · Active`}</p></div><div className="admin-tool-actions">{account.status === "pending" && <button className="dashboard-button dashboard-button-primary" disabled={busy} onClick={() => perform(() => api(`${apiBase}/accounts/${account._id}/approve`, { method: "PATCH", body: "{}" }), "Admin account approved.")}>Approve admin</button>}{account._id !== admin.id && <button className="dashboard-button dashboard-button-danger" disabled={busy} onClick={() => { if (window.confirm(`Permanently delete the account ${account.email}?`)) void perform(() => api(`${apiBase}/accounts/${account._id}`, { method: "DELETE" }), "Account deleted."); }}>{account.status === "pending" ? "Reject request" : "Delete account"}</button>}</div></article>)}</section>
  </div>;
}
