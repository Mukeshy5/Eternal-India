import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import GmailVerification from "./GmailVerification";
import { useGmailVerification } from "./useGmailVerification";
import { usePanelNavigationGuard } from "./panel/PanelNavigationContext";
import "./AdminTools.css";

export default function AccountManager({ apiBase, onUnauthorized }) {
  const [accounts, setAccounts] = useState([]), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [role, setRole] = useState("technical"), [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const lock = useRef(false);
  const verification = useGmailVerification({ email, purpose: editing ? "account-edit" : "account-create", accountId: editing?._id, onUnauthorized });
  const unchangedVerified = !!editing?.emailVerified && email.trim().toLowerCase() === editing.email;
  const verified = unchangedVerified || verification.verified;
  const locked = busy || verification.busy;
  const dirty = editing ? email !== editing.email || !!password || role !== (editing.roles[0] || "admin") : !!email || !!password;
  usePanelNavigationGuard(dirty, locked, "Discard the account details you entered?");
  useEffect(() => {
    const controller = new AbortController();
    api(`${apiBase}/accounts`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setAccounts(result.accounts); }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiBase, onUnauthorized]);
  function clear() { setEditing(null); setEmail(""); setPassword(""); setRole("technical"); verification.reset(); }
  function edit(account) {
    if (locked || dirty && !window.confirm("Discard the account details you entered?")) return;
    verification.reset(); setEditing(account); setEmail(account.email); setPassword(""); setRole(account.roles[0] || "admin"); setError(""); setNotice("");
    document.getElementById("panel-account-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function perform(action, message) {
    if (lock.current || verification.busy) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { const result = await action(); setAccounts((await api(`${apiBase}/accounts`)).accounts); setNotice(result?.message || message); }
    catch (failure) { setError(failure.message); if (failure.status === 401) onUnauthorized(); }
    finally { lock.current = false; setBusy(false); }
  }
  async function save(event) {
    event.preventDefault();
    if (!verified || locked) return;
    await perform(async () => {
      const result = await api(`${apiBase}/accounts${editing ? `/${editing._id}` : ""}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify({ email, role, ...(editing ? { version: editing.version, ...(password ? { password } : {}) } : { password }) }) });
      clear(); return result;
    }, editing ? "Account updated." : "Verified account created successfully.");
  }
  return <div className="admin-tools"><header className="admin-tools-heading"><div><span className="dashboard-section-label">ADMINISTRATION / ACCESS</span><h1>Panel accounts</h1><p>Create Gmail-verified Admin and Technical accounts, edit credentials and approve account requests.</p></div></header>
    {error && <p className="admin-error" role="alert">{error}</p>}{notice && <p className="admin-success" role="status">{notice}</p>}
    <form id="panel-account-editor" className="admin-tool-card admin-tool-form" onSubmit={save}>
      <h2>{editing ? "Edit account" : "Create account"}</h2><fieldset disabled={locked} className="panel-auth-fields"><div className="panel-account-form-grid">
        <GmailVerification id="account-gmail" name="accountEmail" email={email} onEmailChange={(value) => { setEmail(value); setError(""); }} verification={verification} existingVerified={unchangedVerified} disabled={locked} />
        <label className="admin-tool-field"><span>Panel</span><select name="accountRole" value={role} onChange={(event) => setRole(event.target.value)}><option value="technical">Technical Panel</option><option value="admin">Admin Panel</option></select></label>
        <label className="admin-tool-field"><span>{editing ? "New password (optional)" : "Password"}</span><input name="accountPassword" type="password" required={!editing} minLength={8} maxLength={256} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />{editing && <small>Leave blank to keep the existing password.</small>}</label>
      </div><div className="admin-tool-actions"><button type="submit" className="dashboard-button dashboard-button-primary" disabled={locked || !verified}>{busy ? "Saving…" : editing ? "Save account changes" : "Create login credentials"}</button>{editing && <button type="button" className="dashboard-button" disabled={locked} onClick={clear}>Cancel edit</button>}</div></fieldset>
    </form>
    <section className="admin-tool-card panel-records"><h2>Accounts & requests</h2>{loading && <p role="status">Loading accounts…</p>}{accounts.map((account) => <article className="panel-record-row" key={account._id}><div><strong>{account.email}</strong><p>{account.status === "pending" ? "Awaiting approval" : `${account.roles.join(", ")} · Active`}</p><p>{account.emailVerified ? "Gmail verified" : "Existing account · Gmail not verified"}</p></div><div className="admin-tool-actions">
      {account.status === "pending" && <button type="button" className="dashboard-button dashboard-button-primary" disabled={locked || !account.emailVerified} onClick={() => perform(() => api(`${apiBase}/accounts/${account._id}/approve`, { method: "PATCH", body: "{}" }), "Account approved.")}>Approve account</button>}
      {account.editable && <button type="button" className="dashboard-button" disabled={locked} onClick={() => edit(account)}>Edit account</button>}
      {account.deletable && <button type="button" className="dashboard-button dashboard-button-danger" disabled={locked} onClick={() => { if (window.confirm(`Permanently delete the account ${account.email}?`)) void perform(async () => { const result = await api(`${apiBase}/accounts/${account._id}`, { method: "DELETE" }); if (editing?._id === account._id) clear(); return result; }, "Account deleted."); }}>{account.status === "pending" ? "Reject request" : "Delete account"}</button>}
    </div></article>)}</section>
  </div>;
}
