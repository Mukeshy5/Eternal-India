import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { Icon } from "./SiteUI";

export default function PanelAuth({ technical, busy, error, onError, onLogin }) {
  const base = technical ? "/technical" : "/admin";
  const location = useLocation(), navigate = useNavigate();
  const mode = location.pathname.endsWith("/forgot-password") ? "forgot" : location.pathname.endsWith("/reset-password") ? "reset" : location.pathname.endsWith("/register") ? "register" : "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState(() => typeof location.state?.notice === "string" ? location.state.notice : "");
  const notice = typeof location.state?.notice === "string" ? location.state.notice : "";
  useEffect(() => { if (notice) setMessage(notice); }, [notice]);
  const locked = busy || working;
  const title = { login: "Sign in to your workspace", register: `Create a ${technical ? "technical" : "admin"} account`, forgot: "Forgot your password?", reset: "Choose a new password" }[mode];
  const action = { login: "Sign in", register: "Create account", forgot: "Send reset link", reset: "Reset password" }[mode];
  const changeMode = () => { onError(""); setMessage(""); setPassword(""); setConfirmation(""); };
  async function submit(event) {
    event.preventDefault();
    if (locked) return;
    onError(""); setMessage("");
    if (["register", "reset"].includes(mode) && password !== confirmation) { onError("The passwords do not match."); return; }
    if (mode === "login") { onLogin({ email, password }); return; }
    setWorking(true);
    try {
      const result = await api(mode === "register" ? `${base}/register` : `${base}/${mode === "forgot" ? "forgot-password" : "reset-password"}`, { method: "POST", body: JSON.stringify(mode === "reset" ? { token: new URLSearchParams(location.search).get("token"), password } : { email, ...(mode === "register" ? { password } : {}) }) });
      setMessage(result.message); setPassword(""); setConfirmation("");
      if (mode === "reset") navigate(`${base}/login`, { replace: true });
    } catch (failure) { onError(failure.message); }
    finally { setWorking(false); }
  }
  return <div className="admin-shell">
    <header className="admin-header"><Link to="/" aria-label="Eternal India home"><img src="/logo.webp" alt="Eternal India" width="183" height="58" /></Link><span className="admin-header-label">{technical ? "Technical Panel" : "Administration"}</span><Link to="/">View website</Link></header>
    <div className="admin-login-layout"><div className="admin-login-story"><span className="admin-eyebrow">ETERNAL INDIA WORKSPACE</span><Icon name="compass" size={48} /><h1>Everything you need.<br /><em>One workspace.</em></h1><p>Manage staff, attendance, guest enquiries and journey operations from your {technical ? "technical" : "admin"} panel.</p><div className="admin-story-foot"><span className="availability-dot" />Connected to your Eternal India team.</div></div>
      <form className="admin-login-form" onSubmit={submit}><span className="admin-eyebrow">{technical ? "TECHNICAL PANEL" : "ADMIN PANEL"}</span><h2>{title}</h2><p>{mode === "register" ? "Create your account with your Gmail address and password. You can sign in once it is created." : mode === "forgot" ? "Enter your account email. We will send a link that expires in 30 minutes." : mode === "reset" ? "Use at least 8 characters for your new password." : "Use your authorized Eternal India account."}</p>
        <fieldset className="panel-auth-fields" disabled={locked}>
          {mode !== "reset" && <><label htmlFor="admin-email">Email address</label><input id="admin-email" type="email" autoComplete={mode === "login" ? "username" : "email"} required maxLength={200} value={email} onChange={(event) => { setEmail(event.target.value); if (mode === "register") { onError(""); setMessage(""); } }} /></>}
          {mode !== "forgot" && <><label htmlFor="admin-password">{mode === "reset" ? "New password" : "Password"}</label><div className="admin-password-field"><input id="admin-password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? undefined : 8} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button></div></>}
          {["register", "reset"].includes(mode) && <><label htmlFor="admin-confirm-password">Confirm password</label><input id="admin-confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></>}
        </fieldset>
        {error && <p className="admin-error" role="alert">{error}</p>}{message && <p className="admin-success" role="status">{message}</p>}
        <button className="button" type="submit" disabled={locked}>{locked ? "Please wait…" : action}<Icon size={18} /></button>
        <div className="panel-auth-links">{mode === "login" ? <><Link onClick={changeMode} to={`${base}/forgot-password`}>Forgot password?</Link><Link onClick={changeMode} to={`${base}/register`}>Create account</Link></> : <Link onClick={changeMode} to={`${base}/login`}>Back to sign in</Link>}</div>
        <span className="admin-login-note">For authorized Eternal India team members.</span><Link className="panel-other-login" onClick={changeMode} to={technical ? "/admin/login" : "/technical/login"}>Open {technical ? "admin" : "technical"} panel →</Link>
      </form>
    </div>
  </div>;
}
