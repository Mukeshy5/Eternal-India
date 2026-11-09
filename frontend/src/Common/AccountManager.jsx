import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import GmailVerification from "./GmailVerification";
import { useGmailVerification } from "./useGmailVerification";
import { usePanelNavigationGuard } from "./panel/PanelNavigationContext";
import "./AdminTools.css";

export default function AccountManager({ apiBase, onUnauthorized }) {
  const [accounts, setAccounts] = useState([]), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [role, setRole] = useState("technical"), [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const lock = useRef(false), editorHeading = useRef(null);
  const verification = useGmailVerification({ email, purpose: editing ? "account-edit" : "account-create", accountId: editing?._id, onUnauthorized });
  const unchangedVerified = !!editing?.emailVerified && email.trim().toLowerCase() === editing.email;
  const unchangedExisting = !!editing && (editing.isCurrent || editing.isOwner) && email.trim().toLowerCase() === editing.email;
  const verified = unchangedVerified || unchangedExisting || verification.verified;
  const locked = busy || verification.busy;
  const dirty = editing ? email !== editing.email || !!password || role !== (editing.roles[0] || "admin") : !!email || !!password;
  usePanelNavigationGuard(dirty, locked, "Discard the account details you entered?");
  useEffect(() => {
    const controller = new AbortController();
    api(`${apiBase}/accounts`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setAccounts(result.accounts); }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiBase, onUnauthorized]);
  useEffect(() => {
    if (!editing) return;
    editorHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    editorHeading.current?.focus({ preventScroll: true });
  }, [editing?._id]);
  function clear() { setEditing(null); setEmail(""); setPassword(""); setRole("technical"); verification.reset(); }
  function edit(account) {
    if (!account.editable || lock.current || locked || dirty && !window.confirm("Discard the account details you entered?")) return;
    verification.reset(); setEditing(account); setEmail(account.email); setPassword(""); setRole(account.roles[0] || "admin"); setError(""); setNotice("");
  }
  async function perform(action, message) {
    if (lock.current || verification.busy) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await action();
      if (result?.account) {
        setAccounts((current) => current.some((account) => account._id === result.account._id) ? current.map((account) => account._id === result.account._id ? result.account : account) : [result.account, ...current]);
        setEditing((current) => current?._id === result.account._id ? result.account : current);
      }
      setNotice(result?.message || message);
      if (result?.reauthenticate) onUnauthorized(result.message);
    }
    catch (failure) { setError(failure.message); if (failure.status === 401) onUnauthorized(); }
    finally { lock.current = false; setBusy(false); }
  }
  function remove(account) {
    if (!account.deletable || lock.current || locked) return;
    const pending = account.status === "pending";
    if (!window.confirm(pending ? `Reject and permanently delete the account request from ${account.email}?` : `Permanently delete the account ${account.email}? This removes its sign-in access and cannot be undone.`)) return;
    void perform(async () => {
      const result = await api(`${apiBase}/accounts/${account._id}`, { method: "DELETE" });
      setAccounts((current) => current.filter((item) => item._id !== account._id));
      if (editing?._id === account._id) clear();
      return result;
    }, pending ? "Account request rejected and deleted." : "Account deleted.");
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
      <h2 ref={editorHeading} tabIndex={-1}>{editing ? `Edit account · ${editing.email}` : "Create account"}</h2><fieldset disabled={locked} className="panel-auth-fields"><div className="panel-account-form-grid">
        <GmailVerification id="account-gmail" name="accountEmail" email={email} onEmailChange={(value) => { setEmail(value); setError(""); }} verification={verification} existingVerified={unchangedVerified} existingAllowed={unchangedExisting} disabled={locked} />
        <label className="admin-tool-field"><span>Panel</span><select name="accountRole" value={role} onChange={(event) => setRole(event.target.value)}><option value="technical">Technical Panel</option><option value="admin">Admin Panel</option></select></label>
        <label className="admin-tool-field"><span>{editing ? "New password (optional)" : "Password"}</span><input name="accountPassword" type="password" required={!editing} minLength={8} maxLength={256} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />{editing && <small>Leave blank to keep the existing password.</small>}</label>
      </div><div className="admin-tool-actions"><button type="submit" className="dashboard-button dashboard-button-primary" disabled={locked || !verified}>{busy ? "Saving…" : editing ? "Save account changes" : "Create login credentials"}</button>{editing && <button type="button" className="dashboard-button" disabled={locked} onClick={clear}>Cancel edit</button>}</div></fieldset>
    </form>
    <section className="admin-tool-card panel-records" aria-labelledby="panel-accounts-heading">
      <h2 id="panel-accounts-heading">Accounts & requests</h2>
      <p className="admin-tool-empty">Edit an account’s email, panel or password, or permanently delete its access. Keep at least one active Admin Panel account.</p>
      {loading && <p role="status">Loading accounts…</p>}
      {!loading && !error && accounts.length === 0 && <p className="admin-tool-empty">No accounts or requests found.</p>}
      {accounts.map((account) => {
        const restriction = account.managementRestriction || ((!account.editable || !account.deletable) ? "This account is protected. Editing and deletion are unavailable here." : "");
        const restrictionId = `account-restriction-${account._id}`;
        return <article className="panel-record-row" key={account._id} aria-labelledby={`account-email-${account._id}`}>
          <div><strong id={`account-email-${account._id}`}>{account.email}</strong><p>{account.status === "pending" ? "Awaiting approval" : `${account.roles.join(", ")} · ${account.status === "disabled" ? "Disabled" : "Active"}`}</p><p>{account.emailVerified ? "Gmail verified" : "Existing account · Gmail not verified"}</p>{account.isCurrent && <p>Your signed-in account · Saving or deleting it will sign you out.</p>}{restriction && <p id={restrictionId}>{restriction}</p>}</div>
          <div className="admin-tool-actions">
            {account.status === "pending" && <button type="button" className="dashboard-button dashboard-button-primary" disabled={locked || !account.emailVerified} onClick={() => perform(() => api(`${apiBase}/accounts/${account._id}/approve`, { method: "PATCH", body: "{}" }), "Account approved.")}>Approve account</button>}
            <button type="button" className="dashboard-button" disabled={locked || !account.editable} aria-describedby={restriction ? restrictionId : undefined} onClick={() => edit(account)}>Edit account</button>
            <button type="button" className="dashboard-button dashboard-button-danger" disabled={locked || !account.deletable} aria-describedby={restriction ? restrictionId : undefined} onClick={() => remove(account)}>{account.status === "pending" ? "Reject request" : "Delete account"}</button>
          </div>
        </article>;
      })}
    </section>
  </div>;
}
