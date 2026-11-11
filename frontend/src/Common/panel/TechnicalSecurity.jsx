import { useState } from "react";
import { api } from "../api";
import "../AdminTools.css";
import "./TechnicalSecurity.css";

export default function TechnicalSecurity({ apiBase, admin, onUnauthorized, onPasswordChanged }) {
  const [email, setEmail] = useState(admin.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("New passwords do not match."); return; }
    setBusy(true);
    try {
      const result = await api(`${apiBase}/change-password`, { method: "POST", body: JSON.stringify({ email, currentPassword, password, confirmPassword }) });
      onPasswordChanged(result.message);
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 401) onUnauthorized();
    } finally { setBusy(false); }
  }

  return <section className="admin-tools technical-security">
    <header className="admin-tools-heading"><div><span className="dashboard-section-label">TECHNICAL PANEL / ACCOUNT</span><h1>Profile & security</h1><p>Review your account and change your password securely.</p></div></header>
    <section className="admin-tool-card technical-profile-card" aria-label="Technical account profile">
      <h2>Account details</h2>
      {admin.name && <p><strong>Name</strong><span>{admin.name}</span></p>}
      {admin.username && <p><strong>Username</strong><span>{admin.username}</span></p>}
      <p><strong>Gmail address</strong><span>{admin.email}</span></p>
    </section>
    <form className="admin-tool-card admin-tool-form technical-password-form" onSubmit={submit}>
      <h2>Change password</h2>
      <p>Your current password and registered Gmail are required. Changing your password signs out other active sessions.</p>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <fieldset disabled={busy} className="panel-auth-fields"><div className="panel-account-form-grid">
        <label className="admin-tool-field"><span>Gmail address</span><input type="email" name="securityEmail" autoComplete="email" maxLength={200} required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="admin-tool-field"><span>Current password</span><input type="password" name="currentPassword" autoComplete="current-password" minLength={8} maxLength={256} required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
        <label className="admin-tool-field"><span>New password</span><input type="password" name="newPassword" autoComplete="new-password" minLength={8} maxLength={256} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="admin-tool-field"><span>Confirm new password</span><input type="password" name="confirmNewPassword" autoComplete="new-password" minLength={8} maxLength={256} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
      </div></fieldset>
      <div className="admin-tool-actions"><button type="submit" className="dashboard-button dashboard-button-primary" disabled={busy}>{busy ? "Updating…" : "Change password"}</button></div>
    </form>
  </section>;
}
