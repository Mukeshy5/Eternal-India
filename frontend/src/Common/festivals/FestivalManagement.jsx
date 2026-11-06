import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { animationDefaults, decorationPermissions } from "../../../../shared/decorationCatalog.js";
import { DecorationSettings, FestivalEditor, ScheduleEditor } from "./FestivalForms";
import FestivalPreview from "./FestivalPreview";
import "../AdminTools.css";
import "./FestivalManagement.css";

const sections = [
  ["dashboard", "Decoration Dashboard", "dashboard", "01"], ["effects", "Effects Library", "effects", "02"],
  ["festivals", "Festival Management", "dashboard", "03"], ["schedules", "Schedule Management", "dashboard", "04"],
  ["preview", "Live Preview", "effects", "05"], ["active", "Active Decorations", "dashboard", "06"],
  ["history", "Decoration History", "history", "07"], ["settings", "Global Settings", "settings", "08"],
];
const time = (value, zone = "Asia/Kolkata") => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(new Date(value)) : "—";
const counterLabels = { totalEffects: "Available effects", scheduledFestivals: "Scheduled festivals", activeDecorations: "Active decorations", upcomingFestivals: "Upcoming festivals", expiredDecorations: "Expired decorations", enabledEffects: "Enabled effects", disabledEffects: "Disabled effects", totalFestivals: "Saved festivals" };
export default function FestivalManagement({ admin, onBack, onUnauthorized, onLogout }) {
  const permissionKey = (admin.technicalPermissions || []).join(",");
  const permissions = permissionKey.split(",");
  const can = (permission) => permissions.includes(permission);
  const [section, setSection] = useState(() => sections.find((entry) => can(entry[2]))?.[0] || "dashboard");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [previewDraft, setPreviewDraft] = useState(null);
  const [scheduleFestival, setScheduleFestival] = useState("");
  const [historyQuery, setHistoryQuery] = useState({ search: "", action: "", from: "", to: "", page: 1 });
  const actionLock = useRef(false);
  const mounted = useRef(false);
  const actionController = useRef(null);
  const historyKey = JSON.stringify(historyQuery);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; actionController.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    const has = (key) => permissionKey.split(",").includes(key);
    const load = async () => {
      try {
        const results = await Promise.all([
          has("dashboard") ? api("/technical/decoration-dashboard", { signal: controller.signal }) : null,
          has("effects") ? api("/technical/decoration-effects", { signal: controller.signal }) : { effects: [] },
          has("dashboard") ? api("/technical/festivals", { signal: controller.signal }) : { festivals: [] },
          has("dashboard") ? api("/technical/festival-schedules", { signal: controller.signal }) : { schedules: [] },
          has("dashboard") || has("settings") ? api("/technical/decoration-settings", { signal: controller.signal }) : { settings: {} },
          has("dashboard") ? api("/technical/festival-decorations/active", { signal: controller.signal }) : { decorations: [], settings: {} },
          has("history") && section === "history" ? api(`/technical/decoration-history?${new URLSearchParams(JSON.parse(historyKey))}`, { signal: controller.signal }) : { history: [], pages: 1, total: 0 },
        ]);
        if (!controller.signal.aborted) setData({ dashboard: results[0], effects: results[1].effects, festivals: results[2].festivals, schedules: results[3].schedules, settings: results[4].settings, active: results[5], history: results[6] });
      } catch (failure) {
        if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized(); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    const timer = ["dashboard", "active", "history"].includes(section) ? window.setInterval(load, 5000) : null;
    return () => { controller.abort(); if (timer) window.clearInterval(timer); };
  }, [refresh, section, permissionKey, historyKey, onUnauthorized]);

  async function perform(path, options, message) {
    if (actionLock.current) return false;
    actionLock.current = true; setBusy(true); setError(""); setNotice("");
    const controller = new AbortController(); actionController.current = controller;
    try {
      const result = typeof path === "function" ? await path(controller.signal) : await api(`/technical${path}`, { ...options, signal: controller.signal });
      if (!mounted.current) return false;
      setNotice(message); return result;
    } catch (failure) { if (mounted.current && !controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized(); } return false; }
    finally { actionLock.current = false; if (mounted.current) { setBusy(false); reload(); } }
  }
  const choose = (value) => { setSection(value); setError(""); setNotice(""); window.scrollTo({ top: 0, behavior: "instant" }); };
  const preview = (festival) => { setPreviewDraft(festival); choose("preview"); };
  const master = (enabled) => perform("/decoration-settings", { method: "PUT", body: JSON.stringify({ ...data.settings, enabled }) }, enabled ? "Decoration system enabled." : "Master OFF applied. All public decorations have stopped.");
  const sectionTitle = sections.find((entry) => entry[0] === section)?.[1];
  return <div className="admin-tools festival-workspace">
    <header className="admin-tools-heading"><div><span className="dashboard-section-label">TECHNICAL PANEL / WEBSITE EXPERIENCE</span><h1>Special Days & Festival Management</h1><p>Create celebrations with care. Schedule, preview and control every public decoration.</p></div><div className="festival-header-actions"><button type="button" className="dashboard-button" disabled={busy} onClick={onBack}>← Back to enquiries</button><button type="button" className="dashboard-button" disabled={busy} onClick={onLogout}>Sign out</button></div></header>
    <div className="festival-workspace-layout"><aside className="festival-navigation" aria-label="Festival management sections"><span className="festival-kicker">CELEBRATION WORKSPACE</span><nav>{sections.filter((entry) => can(entry[2])).map(([key, label, , number]) => <button type="button" key={key} disabled={busy} aria-current={section === key ? "page" : undefined} onClick={() => choose(key)}><span>{number}</span>{label}</button>)}</nav><div className="festival-access"><strong>{admin.email}</strong><span>Technical team member</span><details><summary>Your permissions</summary>{permissions.filter(Boolean).map((permission) => <small key={permission}>{decorationPermissions[permission]}</small>)}</details></div></aside>
      <section className="festival-content" aria-label={sectionTitle}><div className="festival-section-top"><div><span className="festival-kicker">CENTRALIZED TECHNICAL CONTROL</span><h2>{sectionTitle}</h2></div><div>{data && can("settings") && <button type="button" className={`dashboard-button ${data.settings.enabled ? "dashboard-button-danger" : "dashboard-button-primary"}`} disabled={busy} onClick={() => master(!data.settings.enabled)}>{data.settings.enabled ? "Master OFF" : "Turn decorations ON"}</button>}<button type="button" className="dashboard-button" disabled={busy} onClick={reload}>Refresh</button></div></div>
      {error && <p className="admin-error admin-tool-error" role="alert">{error}</p>}{notice && <p className="admin-success" role="status">{notice}</p>}
      {!data ? <div className="admin-tool-card"><p role="status">{loading ? "Loading decoration records from MongoDB…" : "Decoration data could not be loaded."}</p>{!loading && <button type="button" className="dashboard-button" onClick={reload}>Retry</button>}</div> : <>
        {section === "dashboard" && data.dashboard && <DecorationDashboard data={data} onChoose={choose} />}
        {section === "effects" && <EffectsLibrary effects={data.effects} can={can} busy={busy} perform={perform} onPreview={(effect) => preview({ ...effect.defaults, name: `${effect.name} celebration`, selectedEffects: [effect._id], category: effect.group === "Indian Festivals" ? "Indian Festivals" : "General Animations", description: "", enabled: true, priority: 0, bannerImage: "" })} />}
        {section === "festivals" && <FestivalEditor data={data} can={can} busy={busy} perform={perform} onPreview={preview} onSchedule={(id) => { setScheduleFestival(id); choose("schedules"); }} />}
        {section === "schedules" && <ScheduleEditor key={scheduleFestival} data={data} can={can} busy={busy} perform={perform} festivalId={scheduleFestival} />}
        {section === "preview" && <FestivalPreview key={previewDraft?._id || previewDraft?.selectedEffects?.join(",") || "new"} data={data} initial={previewDraft || { ...animationDefaults, intensity: data.settings.defaultIntensity || "medium" }} can={can} busy={busy} perform={perform} onCancel={() => choose("effects")} />}
        {section === "active" && <ActiveDecorations data={data} can={can} busy={busy} perform={perform} onPreview={preview} />}
        {section === "history" && <DecorationHistory result={data.history} query={historyQuery} onQuery={setHistoryQuery} timezone={data.history.timezone || data.settings.timezone} />}
        {section === "settings" && can("settings") && <DecorationSettings key={`${data.settings.updatedAt}:${data.settings.enabled}`} settings={data.settings} busy={busy} perform={perform} />}
      </>}
      </section>
    </div>
  </div>;
}

function DecorationDashboard({ data, onChoose }) {
  const dashboard = data.dashboard;
  return <><div className="festival-stat-grid">{Object.entries(counterLabels).map(([key, label]) => <div className={`festival-stat festival-stat-${key}`} key={key}><span>{label}</span><strong>{dashboard.stats[key]}</strong><small>From saved MongoDB records</small></div>)}</div><div className="festival-dashboard-grid"><section className="admin-tool-card festival-status-card"><span className="festival-kicker">RIGHT NOW</span><h3>{dashboard.activeFestival || "A little room for celebration"}</h3><span className="festival-status-pill">{dashboard.status}</span><dl><div><dt>Next upcoming festival</dt><dd>{dashboard.nextFestival?.name || "None scheduled"}</dd></div><div><dt>Next start</dt><dd>{time(dashboard.nextFestival?.start, data.settings.timezone)}</dd></div><div><dt>Last activation</dt><dd>{time(dashboard.lastActivationDate, data.settings.timezone)}</dd></div><div><dt>Last modified by</dt><dd>{dashboard.lastModifiedBy?.email || "No technical changes yet"}</dd></div></dl><button type="button" className="dashboard-button" onClick={() => onChoose("active")}>View active decorations →</button></section><section className="admin-tool-card"><h3>Recently updated decorations</h3><div className="festival-compact-list">{dashboard.recentlyUpdated.map((festival) => <article key={festival._id}><strong>{festival.name}</strong><span>{festival.published ? "Published" : "Draft"} · {time(festival.updatedAt, data.settings.timezone)}</span><small>{festival.updatedBy?.email}</small></article>)}</div>{!dashboard.recentlyUpdated.length && <p className="admin-tool-empty">Create your first festival to start building the collection.</p>}</section><section className="admin-tool-card"><h3>Upcoming festival windows</h3><div className="festival-compact-list">{dashboard.upcoming.map((item) => <article key={item.scheduleId}><strong>{item.name}</strong><span>{time(item.start, data.settings.timezone)}</span></article>)}</div>{!dashboard.upcoming.length && <p className="admin-tool-empty">No upcoming enabled schedules.</p>}</section><section className="admin-tool-card"><h3>Recent technical activity</h3><div className="festival-compact-list">{dashboard.recentActivity.map((item) => <article key={item._id}><strong>{item.action.replaceAll("_", " ")}</strong><span>{item.festivalName || "Global configuration"} · {item.performedBy.email}</span><small>{time(item.timestamp, data.settings.timezone)}</small></article>)}</div>{!dashboard.recentActivity.length && <p className="admin-tool-empty">Changes and activations will be recorded here.</p>}</section></div></>;
}
function EffectsLibrary({ effects, can, busy, perform, onPreview }) {
  const [search, setSearch] = useState(""); const [group, setGroup] = useState("");
  const visible = effects.filter((effect) => (!group || effect.group === group) && effect.name.toLowerCase().includes(search.toLowerCase()));
  return <><div className="festival-library-filters"><label className="admin-tool-field"><span>Search effects</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Snow, Diwali, fireworks…" /></label><label className="admin-tool-field"><span>Effect group</span><select value={group} onChange={(event) => setGroup(event.target.value)}><option value="">All effects</option>{[...new Set(effects.map((item) => item.group))].map((value) => <option key={value}>{value}</option>)}</select></label><p>{visible.length} of {effects.length} reusable effects</p></div><div className="festival-effects-grid">{visible.map((effect) => <article key={effect._id} className="festival-effect-card"><div className={`festival-effect-art festival-effect-art-${effect.motion}`} style={{ "--effect-color": effect.colors[0] }}><span aria-hidden="true">{effect.symbol}</span><small>{effect.scene ? "FESTIVAL SCENE" : "GENERAL ANIMATION"}</small></div><div><span className="festival-kicker">{effect.group}</span><h3>{effect.name}</h3><p>{effect.enabled ? "Enabled in the public library" : "Disabled for public decorations"}</p><div className="festival-effect-actions"><button type="button" className="dashboard-button" onClick={() => onPreview(effect)} disabled={busy}>Preview effect</button>{can("settings") && <button type="button" className="dashboard-button" disabled={busy} onClick={() => perform(`/decoration-effects/${effect._id}`, { method: "PATCH", body: JSON.stringify({ enabled: !effect.enabled }) }, "Effect availability updated.")}>{effect.enabled ? "Disable" : "Enable"}</button>}</div></div></article>)}</div>{!visible.length && <p className="admin-tool-card">No effects match this search.</p>}</>;
}
function ActiveDecorations({ data, can, busy, perform, onPreview }) {
  return <><p className="festival-help">The backend selects one highest-priority eligible festival. Manual activation overrides schedules. Turning an active scheduled festival OFF suppresses its current occurrence until expiry.</p>{data.active.decorations.map((decoration) => <article key={decoration.id} className="admin-tool-card festival-active-card"><span className="festival-status-pill">ACTIVE · {decoration.source.toUpperCase()}</span><h3>{decoration.name}</h3><p>{decoration.selectedEffects.join(" · ")}</p><p>{decoration.greetingMessage}</p><dl><div><dt>Started</dt><dd>{time(decoration.startsAt, data.settings.timezone)}</dd></div><div><dt>Ends</dt><dd>{decoration.endsAt ? time(decoration.endsAt, data.settings.timezone) : "Manual control — no expiry"}</dd></div></dl><div className="admin-tool-actions">{can("activate") && <button type="button" className="dashboard-button dashboard-button-danger" disabled={busy} onClick={() => perform(`/festival-decorations/${decoration.id}/deactivate`, { method: "POST", body: "{}" }, "Decoration stopped. Current scheduled occurrence remains OFF until expiry.")}>Deactivate immediately</button>}{can("effects") && <button type="button" className="dashboard-button" onClick={() => onPreview(data.festivals.find((festival) => festival._id === decoration.id))}>Preview</button>}</div></article>)}{!data.active.decorations.length && <div className="admin-tool-card"><h3>No active public decorations</h3><p className="festival-help">{data.settings.enabled ? "Publish a festival and activate it, or create a schedule." : "The master switch is OFF."}</p></div>}<section className="admin-tool-card"><h3>Published festivals ready for manual control</h3><div className="festival-record-list">{data.festivals.filter((festival) => festival.published && festival.enabled).map((festival) => <div className="festival-manual-row" key={festival._id}><strong>{festival.name}</strong>{can("activate") && <button type="button" className="dashboard-button" disabled={busy || !data.settings.enabled} onClick={() => perform(`/festival-decorations/${festival._id}/activate`, { method: "POST", body: "{}" }, "Festival activated manually.")}>Activate now</button>}</div>)}</div></section></>;
}
function DecorationHistory({ result, query, onQuery, timezone }) {
  const [form, setForm] = useState(query);
  return <><form className="admin-tool-card festival-history-filters" onSubmit={(event) => { event.preventDefault(); onQuery({ ...form, page: 1 }); }}><label className="admin-tool-field"><span>Search festival, member or remarks</span><input name="historySearch" type="search" maxLength={100} value={form.search} onChange={(event) => setForm({ ...form, search: event.target.value })} /></label><label className="admin-tool-field"><span>Action</span><input name="historyAction" maxLength={80} value={form.action} placeholder="e.g. decoration_published" onChange={(event) => setForm({ ...form, action: event.target.value })} /></label><label className="admin-tool-field"><span>From date</span><input name="historyFrom" type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} /></label><label className="admin-tool-field"><span>To date</span><input name="historyTo" type="date" min={form.from || undefined} value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} /></label><button className="dashboard-button">Apply filters</button></form><section className="admin-tool-card"><h3>Decoration activity history <span className="festival-help">{result.total} records · {timezone}</span></h3><p className="festival-help">History is append-only. Ordinary Technical Panel controls cannot edit or delete records.</p><div className="festival-history-list">{result.history.map((entry) => <article key={entry._id}><div><strong>{entry.action.replaceAll("_", " ")}</strong><time dateTime={entry.timestamp}>{time(entry.timestamp, timezone)}</time></div><p>{entry.festivalName || "Global configuration"} · {entry.performedBy.email} ({entry.performedByRole})</p><p>{entry.remarks}</p><details><summary>Previous and updated values</summary><div className="festival-history-diff"><div><span>Previous</span><pre>{JSON.stringify(entry.previousValues, null, 2)}</pre></div><div><span>Updated</span><pre>{JSON.stringify(entry.newValues, null, 2)}</pre></div></div></details></article>)}</div>{!result.history.length && <p className="admin-tool-empty">No activity matches these filters.</p>}<div className="festival-pagination"><button type="button" className="dashboard-button" disabled={query.page <= 1} onClick={() => onQuery({ ...query, page: query.page - 1 })}>Previous</button><span>Page {query.page} of {result.pages}</span><button type="button" className="dashboard-button" disabled={query.page >= result.pages} onClick={() => onQuery({ ...query, page: query.page + 1 })}>Next</button></div></section></>;
}
