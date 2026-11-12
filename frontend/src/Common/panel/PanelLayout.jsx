import { Component, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardIcon } from "../AdminDashboard";
import { panelSections } from "./panelNavigation";
import { usePanelNavigation } from "./PanelNavigationContext";
import "./PanelLayout.css";

export class PanelErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className="panel-failure" role="alert"><DashboardIcon name="refresh" size={30} /><h1>This section could not open</h1><p>Reload the workspace to fetch the latest application files.</p><button className="dashboard-button dashboard-button-primary" onClick={() => window.location.reload()}>Reload workspace</button><button className="dashboard-button" onClick={this.props.onHome}>Back to enquiries</button></section>;
    return this.props.children;
  }
}

export default function PanelLayout({ admin, technical, section, busy, onNavigate, onLogout, notifications, children }) {
  const [menuOpen, setMenuOpen] = useState(false), menuButton = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const sidebar = useRef(null);
  const navigation = usePanelNavigation();
  const guardLink = (event) => { if (navigation && !navigation.confirmNavigation()) event.preventDefault(); };
  const visible = Object.entries(panelSections).filter(([, item]) => (!item.adminPanelOnly || !technical) && (!item.technical || technical) && (!item.adminOnly || !technical && admin.canManageAccounts) && (!item.permission || admin.staffPermissions?.includes(item.permission)) && (item !== panelSections.festivals || !Array.isArray(admin.technicalPermissions) || admin.technicalPermissions.length));
  const groups = [...new Set(visible.map(([, item]) => item.group))];
  const current = panelSections[section];
  useEffect(() => { setMenuOpen(false); }, [section]);
  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 980px)");
    const resize = () => { setMobile(viewport.matches); setMenuOpen(false); };
    resize();
    viewport.addEventListener("change", resize);
    return () => viewport.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!menuOpen || !mobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...sidebar.current.querySelectorAll('a[href], button:not(:disabled)')].filter((element) => !element.classList.contains("panel-collapse-button"));
    focusable()[0]?.focus();
    const close = (event) => {
      if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); }
      if (event.key !== "Tab") return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = previousOverflow; menuButton.current?.focus(); };
  }, [menuOpen, mobile]);
  const choose = (key) => { if (onNavigate(key) !== false) setMenuOpen(false); };
  return <div className={`panel-app ${technical ? "panel-technical" : "panel-admin"}${collapsed ? " panel-app-collapsed" : ""}`}>
    {menuOpen && <button className="panel-backdrop" aria-label="Close workspace navigation" onClick={() => setMenuOpen(false)} />}
    <aside ref={sidebar} role={mobile && menuOpen ? "dialog" : undefined} aria-modal={mobile && menuOpen ? true : undefined} inert={mobile && !menuOpen ? true : undefined} className={`panel-sidebar dashboard-sidebar ${menuOpen ? "panel-sidebar-open" : ""}`} aria-label={technical ? "Technical workspace" : "Admin workspace"}>
      <button type="button" className="panel-drawer-close" aria-label="Close workspace navigation" onClick={() => setMenuOpen(false)}><DashboardIcon name="close" size={20} /></button>
      <Link to="/" onClick={guardLink} className="panel-brand" aria-label="Eternal India home"><img src="/logo.webp" alt="Eternal India" width="183" height="58" /><strong className="panel-brand-mark">EI</strong></Link>
      <div className="panel-workspace-name"><span className="panel-workspace-symbol"><DashboardIcon name={technical ? "spark" : "inbox"} size={16} /></span><div><strong>{technical ? "Technical Panel" : "Admin Panel"}</strong><small>Eternal India Workspace</small></div><span className="panel-workspace-version">EI</span></div>
      <button type="button" className="panel-collapse-button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed((value) => !value)}><DashboardIcon name={collapsed ? "right" : "left"} size={15} /><span>Collapse menu</span></button>
      <nav id="panel-navigation" className="panel-navigation dashboard-status-navigation" aria-label="Workspace navigation">{groups.map((group) => <div className="panel-nav-group" key={group}><span className="panel-nav-label">{group}</span>{visible.filter(([, item]) => item.group === group).map(([key, item]) => <button type="button" key={key} disabled={busy} aria-current={section === key ? "page" : undefined} aria-label={item.label} title={item.label} onClick={() => choose(key)}><DashboardIcon name={item.icon} size={18} /><span>{item.label}</span>{section === key && <i className="panel-nav-active-dot" />}</button>)}</div>)}</nav>
      <div className="panel-account"><span className="panel-avatar">{(admin.name || admin.email)?.slice(0, 2).toUpperCase()}</span><div><strong>{admin.name || (technical ? "Technical account" : "Administrator")}</strong><small title={admin.email}>{admin.username ? `@${admin.username} · ` : ""}{admin.email}</small></div></div>
    </aside>
    <div className="panel-body" inert={mobile && menuOpen ? true : undefined}><header className="panel-topbar"><div className="panel-breadcrumb"><button ref={menuButton} type="button" className="panel-menu-button dashboard-mobile-menu" aria-label="Toggle workspace navigation" aria-expanded={menuOpen} aria-controls="panel-navigation" onClick={() => setMenuOpen((value) => !value)}><span aria-hidden="true">☰</span></button><span>{technical ? "Technical" : "Admin"}</span><DashboardIcon name="right" size={13} /><strong>{current?.title || "Workspace"}</strong></div><div className="panel-topbar-actions">{notifications}{technical && <Link onClick={guardLink} to="/admin">Admin panel</Link>}<Link onClick={guardLink} to="/" className="panel-website-link"><DashboardIcon name="globe" size={16} />View website</Link><button type="button" className="dashboard-button dashboard-sign-out-button" disabled={busy} onClick={onLogout}><DashboardIcon name="logout" size={15} />{busy ? "Signing out…" : "Sign out"}</button></div></header>
      <div className="panel-page">{children}</div>
      <footer className="panel-footer"><span>© {new Date().getFullYear()} Eternal India</span><span>{technical ? "Technical" : "Admin"} workspace · Asia/Kolkata</span></footer>
    </div>
  </div>;
}
