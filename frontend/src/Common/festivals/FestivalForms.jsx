import { useRef, useState } from "react";
import { animationDefaults, effectsCompatibility, festivalCategories, globalDecorationDefaults } from "../../../../shared/decorationCatalog.js";
import { api } from "../api";
import { AnimationFields, EffectPicker, FestivalField } from "./FestivalFields";
import { usePanelNavigationGuard } from "../panel/PanelNavigationContext";

const newFestival = (settings) => ({ ...animationDefaults, intensity: settings.defaultIntensity, animationSpeed: settings.defaultAnimationSpeed, particleDensity: settings.defaultParticleDensity, name: "", description: "", category: festivalCategories[0], selectedEffects: ["diwali"], enabled: true, priority: 0, bannerImage: "" });
export function FestivalEditor({ data, can, busy, perform, onPreview, onSchedule }) {
  const [form, setForm] = useState(() => newFestival(data.settings));
  const [dirty, setDirty] = useState(false);
  usePanelNavigationGuard(dirty, busy, "Discard unsaved festival changes?");
  const [editing, setEditing] = useState("");
  const [search, setSearch] = useState("");
  const file = useRef(null);
  const change = (key, value) => { setForm((previous) => ({ ...previous, [key]: value })); setDirty(true); };
  const editable = can(editing ? "editFestival" : "createFestival");
  async function save(event) {
    event.preventDefault();
    if (effectsCompatibility(form.selectedEffects) || !event.currentTarget.reportValidity()) return;
    const result = await perform(`/festivals${editing ? `/${editing}` : ""}`, { method: editing ? "PUT" : "POST", body: JSON.stringify(form) }, "Festival saved as a draft. Publish it when ready.");
    if (result) { setEditing(result.festival._id); setForm(result.festival); setDirty(false); }
  }
  async function upload(event) {
    const image = event.target.files?.[0];
    if (!image) return;
    const body = new FormData(); body.append("image", image);
    const result = await perform("/festival-assets", { method: "POST", body }, "Banner uploaded. Save the festival to attach it.");
    if (result) change("bannerImage", result.image);
    if (file.current) file.current.value = "";
  }
  async function publishAndActivate(festival) {
    await perform(async (signal) => {
      await api(`/technical/festival-decorations/${festival._id}/publish`, { method: "PATCH", body: JSON.stringify({ published: true }), signal });
      return api(`/technical/festival-decorations/${festival._id}/activate`, { method: "POST", body: "{}", signal });
    }, {}, "Festival published and applied on the public website.");
  }
  const visible = data.festivals.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="festival-editor-layout">
    <section className="admin-tool-card"><div className="festival-card-heading"><h2>Festival collection <span>{data.festivals.length}</span></h2>{can("createFestival") && <button type="button" className="dashboard-button" disabled={busy} onClick={() => { setEditing(""); setForm(newFestival(data.settings)); }}>+ New festival</button>}</div><FestivalField label="Search festivals"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></FestivalField>
      <div className="festival-record-list">{visible.map((festival) => <article className="festival-record" key={festival._id}><div><span className="festival-kicker">{festival.category}</span><h3>{festival.name}</h3><p>{festival.description || "No description added."}</p><div className="festival-badges"><span>{festival.published ? "Published" : "Draft"}</span><span>{festival.enabled ? "Enabled" : "Disabled"}</span><span>{festival.selectedEffects.length} effects</span></div></div><div className="festival-record-actions">
        <button type="button" className="dashboard-button" onClick={() => { setEditing(festival._id); setForm(festival); }} disabled={busy}>Open editor</button>
        {can("effects") && <button type="button" className="dashboard-button" onClick={() => onPreview(festival)}>Preview</button>}
        {can("createSchedule") && <button type="button" className="dashboard-button" onClick={() => onSchedule(festival._id)}>Schedule</button>}
        {can("publish") && <button type="button" className="dashboard-button" disabled={busy} onClick={() => perform(`/festival-decorations/${festival._id}/publish`, { method: "PATCH", body: JSON.stringify({ published: !festival.published }) }, festival.published ? "Decoration returned to draft." : "Decoration published. Schedules can now activate it.")}>{festival.published ? "Unpublish" : "Publish"}</button>}
        {can("publish") && can("activate") && <button type="button" className="dashboard-button dashboard-button-primary" disabled={busy || !festival.enabled} onClick={() => publishAndActivate(festival)}>Publish & activate</button>}
        {can("activate") && <button type="button" className="dashboard-button" disabled={busy} onClick={() => perform(`/festival-decorations/${festival._id}/toggle`, { method: "PATCH", body: JSON.stringify({ enabled: !festival.enabled }) }, "Festival availability updated.")}>{festival.enabled ? "Disable" : "Enable"}</button>}
        {can("deleteFestival") && <button type="button" className="dashboard-button dashboard-button-danger" disabled={busy} onClick={async () => { if (window.confirm(`Delete ${festival.name}? Its schedules, activity history and unused banner image will also be permanently deleted.`)) { const result = await perform(`/festivals/${festival._id}`, { method: "DELETE" }, "Festival, schedules and activity history permanently deleted."); if (result !== false && editing === festival._id) { setEditing(""); setForm(newFestival(data.settings)); } } }}>Delete</button>}
      </div></article>)}</div>{!visible.length && <p className="admin-tool-empty">No matching festivals. Create your first festival to begin.</p>}
    </section>
    <form className="admin-tool-card festival-form" onSubmit={save}><h2>{editing ? "Edit festival" : "Create festival"}</h2><p className="festival-help">Saved edits are drafts. Preview and publish separately. Yearly recurrence is configured in Schedule Management.</p><fieldset disabled={busy || !editable}>
      <FestivalField label="Festival name"><input name="name" required maxLength={120} pattern=".*\S.*" value={form.name} onChange={(event) => change("name", event.target.value)} /></FestivalField>
      <FestivalField label="Festival category"><select name="category" value={form.category} onChange={(event) => change("category", event.target.value)}>{festivalCategories.map((category) => <option key={category}>{category}</option>)}</select></FestivalField>
      <FestivalField label="Description"><textarea name="description" maxLength={1000} value={form.description} onChange={(event) => change("description", event.target.value)} /></FestivalField>
      <div className="admin-tool-grid"><FestivalField label="Decoration priority"><input name="priority" type="number" required min="0" max="1000" step="1" value={form.priority} onChange={(event) => change("priority", Number(event.target.value))} /></FestivalField><label className="festival-check"><input name="enabled" type="checkbox" checked={form.enabled} onChange={(event) => change("enabled", event.target.checked)} />Festival enabled</label></div>
      <EffectPicker selected={form.selectedEffects} onChange={(value) => change("selectedEffects", value)} effects={data.effects} />
      <AnimationFields form={form} change={change} />
      <FestivalField label="Optional festival banner" hint="JPG, PNG, WebP or GIF, up to 2 MB. Save after uploading."><input ref={file} name="banner" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={!can("createFestival") && !can("editFestival")} onChange={upload} /></FestivalField>
      {form.bannerImage && <div className="festival-banner-selection"><img src={form.bannerImage} alt="Selected festival banner" /><button type="button" className="dashboard-button" onClick={() => change("bannerImage", "")}>Remove banner</button></div>}
      <div className="admin-tool-actions"><button className="dashboard-button dashboard-button-primary" type="submit" disabled={busy || !!effectsCompatibility(form.selectedEffects)}>Save draft</button>{can("effects") && <button type="button" className="dashboard-button" onClick={() => onPreview(form)}>Preview this draft</button>}</div>
    </fieldset>{!editable && <p className="festival-help">Your account can view this festival but cannot edit it.</p>}</form>
  </div>;
}

export function ScheduleEditor({ data, can, busy, perform, festivalId = "" }) {
  const blank = { festivalId: festivalId || data.festivals[0]?._id || "", startDate: "", endDate: "", startTime: "00:00", endTime: "23:59", timezone: data.settings.timezone, recurringYearly: false, enabled: true, priority: 10 };
  const [form, setForm] = useState(blank);
  const [dirty, setDirty] = useState(false);
  usePanelNavigationGuard(dirty, busy, "Discard unsaved schedule changes?");
  const [editing, setEditing] = useState("");
  const change = (key, value) => { setForm((previous) => ({ ...previous, [key]: value })); setDirty(true); };
  const name = (id) => data.festivals.find((festival) => festival._id === id)?.name || "Removed festival";
  async function save(event) {
    event.preventDefault();
    const result = await perform(`/festival-schedules${editing ? `/${editing}` : ""}`, { method: editing ? "PUT" : "POST", body: JSON.stringify(form) }, "Schedule saved. The backend will activate eligible published decorations automatically.");
    if (result) { setEditing(result.schedule._id); setForm(result.schedule); setDirty(false); }
  }
  return <div className="festival-editor-layout"><section className="admin-tool-card"><div className="festival-card-heading"><h2>Festival schedules <span>{data.schedules.length}</span></h2>{can("createSchedule") && <button type="button" className="dashboard-button" disabled={busy} onClick={() => { setEditing(""); setForm(blank); }}>+ New schedule</button>}</div><p className="festival-help">Higher priority wins during overlaps. Equal-priority overlapping windows are rejected. End times are exclusive.</p><div className="festival-record-list">{data.schedules.map((schedule) => <article className="festival-record" key={schedule._id}><div><h3>{name(schedule.festivalId)}</h3><p>{schedule.startDate} {schedule.startTime} → {schedule.endDate} {schedule.endTime}</p><p>{schedule.timezone} · Priority {schedule.priority}</p><div className="festival-badges"><span>{schedule.recurringYearly ? "Yearly recurring" : "One time"}</span><span>{schedule.enabled ? "Enabled" : "Disabled"}</span></div></div><div className="festival-record-actions">{can("editSchedule") && <button type="button" className="dashboard-button" disabled={busy} onClick={() => { setEditing(schedule._id); setForm(schedule); }}>Edit schedule</button>}{can("deleteSchedule") && <button type="button" className="dashboard-button dashboard-button-danger" disabled={busy} onClick={async () => { if (window.confirm(`Delete the schedule for ${name(schedule.festivalId)}?`)) { const result = await perform(`/festival-schedules/${schedule._id}`, { method: "DELETE" }, "Schedule deleted."); if (result !== false && editing === schedule._id) { setEditing(""); setForm(blank); } } }}>Delete schedule</button>}</div></article>)}</div>{!data.schedules.length && <p className="admin-tool-empty">No schedules yet. Add dates manually; lunar festival dates are never guessed.</p>}</section>
    <form className="admin-tool-card festival-form" onSubmit={save}><h2>{editing ? "Edit schedule" : "Create schedule"}</h2><fieldset disabled={busy || !can(editing ? "editSchedule" : "createSchedule")}>
      <FestivalField label="Festival"><select name="festivalId" required value={form.festivalId} onChange={(event) => change("festivalId", event.target.value)}><option value="">Select festival</option>{data.festivals.map((festival) => <option key={festival._id} value={festival._id}>{festival.name}{!festival.published ? " · draft" : ""}</option>)}</select></FestivalField>
      <div className="admin-tool-grid"><FestivalField label="Start date"><input name="startDate" type="date" required value={form.startDate} onChange={(event) => change("startDate", event.target.value)} /></FestivalField><FestivalField label="Start time"><input name="startTime" type="time" required value={form.startTime} onChange={(event) => change("startTime", event.target.value)} /></FestivalField><FestivalField label="End date"><input name="endDate" type="date" required min={form.startDate || undefined} value={form.endDate} onChange={(event) => change("endDate", event.target.value)} /></FestivalField><FestivalField label="End time"><input name="endTime" type="time" required value={form.endTime} onChange={(event) => change("endTime", event.target.value)} /></FestivalField></div>
      <FestivalField label="Timezone (IANA)" hint="For example Asia/Kolkata, Europe/London or America/New_York."><input name="timezone" required maxLength={100} value={form.timezone} onChange={(event) => change("timezone", event.target.value)} list="festival-timezones" /><datalist id="festival-timezones">{["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York", "UTC"].map((zone) => <option key={zone}>{zone}</option>)}</datalist></FestivalField>
      <FestivalField label="Schedule priority"><input name="schedulePriority" required type="number" min="0" max="1000" step="1" value={form.priority} onChange={(event) => change("priority", Number(event.target.value))} /></FestivalField>
      <label className="festival-check"><input name="recurringYearly" type="checkbox" checked={form.recurringYearly} onChange={(event) => change("recurringYearly", event.target.checked)} />Repeat every year on these dates</label><label className="festival-check"><input name="scheduleEnabled" type="checkbox" checked={form.enabled} onChange={(event) => change("enabled", event.target.checked)} />Schedule enabled</label>
      <p className="festival-help">Yearly schedules preserve the local date and timezone, including New Year windows spanning two calendar years. February 29 repeats only in leap years.</p><div className="admin-tool-actions"><button className="dashboard-button dashboard-button-primary" disabled={busy || !data.festivals.length}>Save schedule</button></div>
    </fieldset></form></div>;
}

export function DecorationSettings({ settings, busy, perform }) {
  const [form, setForm] = useState(settings);
  const baseline = useRef(settings);
  usePanelNavigationGuard(JSON.stringify(form) !== JSON.stringify(baseline.current), busy, "Discard unsaved decoration settings?");
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  async function save(event) { event.preventDefault(); const result = await perform("/decoration-settings", { method: "PUT", body: JSON.stringify(form) }, "Global decoration settings saved."); if (result) { baseline.current = result.settings; setForm(result.settings); } }
  return <form className="admin-tool-card festival-form festival-settings-form" onSubmit={save}><h2>Global decoration settings</h2><p className="festival-help">Master OFF stops every public decoration immediately. Animation defaults apply when creating a new festival; saved designs retain their configuration.</p><fieldset disabled={busy}>
    <label className="festival-master-toggle"><input name="masterEnabled" type="checkbox" checked={form.enabled} onChange={(event) => change("enabled", event.target.checked)} /><span><strong>Master decoration system</strong><small>{form.enabled ? "ON — published decorations may run" : "OFF — public decorations are stopped"}</small></span></label>
    <div className="admin-tool-grid"><FestivalField label="Default intensity"><select name="defaultIntensity" value={form.defaultIntensity} onChange={(event) => change("defaultIntensity", event.target.value)}>{["low", "medium", "high"].map((value) => <option key={value}>{value}</option>)}</select></FestivalField><FestivalField label="Default speed"><input name="defaultAnimationSpeed" type="number" required min="0.25" max="3" step="0.25" value={form.defaultAnimationSpeed} onChange={(event) => change("defaultAnimationSpeed", Number(event.target.value))} /></FestivalField><FestivalField label="Default particle density"><input name="defaultParticleDensity" type="number" required min="1" max="120" step="1" value={form.defaultParticleDensity} onChange={(event) => change("defaultParticleDensity", Number(event.target.value))} /></FestivalField><FestivalField label="Default timezone"><input name="defaultTimezone" required maxLength={100} value={form.timezone} onChange={(event) => change("timezone", event.target.value)} /></FestivalField></div>
    {Object.entries({ visitorHideButton: "Visitor Hide Decoration control", greetingEnabled: "Public greeting banners", musicEnabled: "Optional background music (visitor consent required)", mobileOptimization: "Optimize particles on mobile", reducedMotion: "Respect prefers-reduced-motion" }).map(([key, label]) => <label className="festival-check" key={key}><input name={key} type="checkbox" checked={form[key]} onChange={(event) => change(key, event.target.checked)} />{label}</label>)}
    <div className="admin-tool-actions"><button className="dashboard-button dashboard-button-primary">Save global settings</button><button type="button" className="dashboard-button" onClick={async () => { if (window.confirm("Restore all global decoration defaults? Master decorations will be ON; festivals and schedules will be retained.")) { const result = await perform("/decoration-settings/restore-defaults", { method: "POST", body: "{}" }, "Global defaults restored."); if (result) setForm({ ...globalDecorationDefaults, ...result.settings }); } }}>Restore defaults</button></div>
  </fieldset></form>;
}
