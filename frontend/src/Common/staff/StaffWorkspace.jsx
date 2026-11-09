import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiUrl } from "../api";
import { indiaDate } from "../../../../shared/staff.js";
import { AttendanceEditor, Field, StaffEditor, StaffPhoto } from "./StaffForms";
import { AttendanceReport, Pager, ReportFilters, StaffStats } from "./StaffReports";
import StaffAttendanceCalendar from "./AttendanceCalendar";
import { useStaffEvents } from "./useStaffEvents";
import { usePanelNavigation, usePanelNavigationGuard } from "../panel/PanelNavigationContext";
import StaffAttendanceRow from "./StaffAttendanceRow";
import EmployeeIdCard, { printIdCard } from "./EmployeeIdCard";
import "../AdminTools.css";
import "./staff.css";

const sections = { staff: "Staff Management", "staff-attendance": "Staff Attendance", "staff-cards": "Download ID Card", "staff-reports": "Attendance Reports" };
export default function StaffWorkspace({ apiBase, technical, admin, section, onSection, onBack, onUnauthorized, onLogout }) {
  const can = (key) => admin.staffPermissions?.includes(key);
  const today = indiaDate();
  const [date, setDate] = useState(today), [searchInput, setSearchInput] = useState(""), [search, setSearch] = useState("");
  const [status, setStatus] = useState(""), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [filters, setFilters] = useState({ period: "monthly", date: today, month: today.slice(0, 7), from: `${today.slice(0, 7)}-01`, to: today });
  const [profileId, setProfileId] = useState(""), [response, setResponse] = useState(null), [attendanceDrafts, setAttendanceDrafts] = useState({});
  const [editor, setEditor] = useState(null), [attendanceEditor, setAttendanceEditor] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [errors, setErrors] = useState({}), [notice, setNotice] = useState("");
  const lock = useRef(false), alive = useRef(true), actionController = useRef(null);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  const live = useStaffEvents(apiBase, reload);
  const navigation = usePanelNavigation();
  const dailyDirty = Object.values(attendanceDrafts).some((entry) => entry?.dirty);
  usePanelNavigationGuard(dailyDirty, busy, "Discard unsaved attendance choices and change section?");
  useEffect(() => { alive.current = true; return () => { alive.current = false; actionController.current?.abort(); }; }, []);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [searchInput]);
  const query = new URLSearchParams({ page: String(page), search, ...(profileId || section === "staff-reports" ? filters.period === "custom" ? { from: filters.from, to: filters.to } : filters.period === "monthly" ? { month: filters.month } : { period: filters.period, date: filters.date } : section === "staff-attendance" ? { date } : { status }) }).toString();
  const path = profileId ? `/staff/${profileId}/attendance` : section === "staff-reports" ? "/staff-reports" : section === "staff-attendance" ? "/staff-attendance" : "/staff";
  const requestKey = `${apiBase}${path}?${query}`;
  const data = response?.key === requestKey ? response.data : null;
  const loading = response?.key !== requestKey || response.loading;
  useEffect(() => {
    const controller = new AbortController(); let inFlight = false;
    setResponse((previous) => previous?.key === requestKey && previous.data ? previous : { key: requestKey, data: null, loading: true });
    async function load() {
      if (inFlight || document.hidden) return; inFlight = true;
      try { const result = await api(requestKey, { signal: controller.signal }); if (!controller.signal.aborted) setResponse({ key: requestKey, data: result, loading: false }); }
      catch (failure) { if (!controller.signal.aborted) { setError(failure.message); setResponse({ key: requestKey, data: null, loading: false }); if (failure.status === 401) onUnauthorized(); } }
      finally { inFlight = false; }
    }
    void load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", load);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", load); };
  }, [requestKey, refresh, onUnauthorized]);
  function choose(key) { if (onSection(key) === false) return; setProfileId(""); setEditor(null); setAttendanceEditor(null); setPage(1); setError(""); setErrors({}); setNotice(""); setSearchInput(""); setSearch(""); }
  function profile(id, month) { if (navigation && !navigation.confirmNavigation()) return; setProfileId(id); setEditor(null); setAttendanceEditor(null); setPage(1); setFilters({ ...filters, period: "monthly", ...(month ? { month } : {}) }); setError(""); setNotice(""); }
  async function perform(action, message) {
    if (lock.current) return null; lock.current = true; setBusy(true); setError(""); setErrors({}); setNotice("");
    const controller = new AbortController(); actionController.current = controller;
    try { const result = await action(controller.signal); if (!alive.current) return null; setNotice(message); return { result }; }
    catch (failure) { if (!controller.signal.aborted && alive.current) { setError(failure.message); setErrors(failure.errors || {}); if (failure.status === 401) onUnauthorized(); } return null; }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function saveStaff(form) {
    const response = await perform((signal) => api(`${apiBase}/staff${editor.staff ? `/${editor.staff._id}` : ""}`, { method: editor.staff ? "PATCH" : "POST", body: form, signal }), editor.staff ? "Staff details and ID card updated." : "Staff saved. Your ID card is ready in Download ID Card.");
    if (response) { setEditor(null); reload(); }
  }
  async function toggleStaffStatus(person) {
    const nextStatus = person.status === "active" ? "inactive" : "active";
    const response = await perform((signal) => api(`${apiBase}/staff/${person._id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus, version: person.version }),
      signal,
    }), `${person.name} marked ${nextStatus}.`);
    if (response) reload();
  }
  async function saveAttendance(body) {
    const response = await perform((signal) => api(`${apiBase}/staff-attendance${attendanceEditor.record ? `/${attendanceEditor.record._id}` : ""}`, { method: attendanceEditor.record ? "PATCH" : "POST", body: JSON.stringify(body), signal }), "Attendance saved.");
    if (response) { setAttendanceEditor(null); reload(); }
  }
  useEffect(() => {
    if (section !== "staff-attendance" || profileId || !Array.isArray(data?.staff)) return;
    setAttendanceDrafts((previous) => Object.fromEntries(data.staff.map((person) => [person._id, previous[person._id]?.dirty ? previous[person._id] : { status: person.attendance?.status || "", version: person.attendance?.version || 0, dirty: false }])));
  }, [section, profileId, date, data]);
  async function submitAttendance() {
    const attendance = data?.staff.map((person) => ({ staffId: person._id, status: attendanceDrafts[person._id]?.status, version: attendanceDrafts[person._id]?.version }));
    if (!attendance?.length || attendance.some((entry) => !entry.status)) { setError("Choose Present, Absent or Leave for every staff member."); return; }
    const result = await perform((signal) => api(`${apiBase}/staff-attendance/bulk`, { method: "POST", body: JSON.stringify({ date, attendance }), signal }), "Today's attendance saved.");
    if (result) { setAttendanceDrafts((previous) => Object.fromEntries(Object.entries(previous).map(([id, value]) => [id, { ...value, dirty: false }]))); reload(); }
  }
  async function remove(staff) {
    if (!window.confirm(`Delete ${staff.name} (${staff.employeeId})? Their attendance history will be preserved.`)) return;
    const response = await perform((signal) => api(`${apiBase}/staff/${staff._id}`, { method: "DELETE", body: JSON.stringify({ version: staff.version }), signal }), "Staff deleted. Attendance history remains available in reports.");
    if (response) reload();
  }
  async function fetchFile(url, signal) {
      const response = await fetch(apiUrl(`${apiBase}${url}`), { credentials: "include", signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
      if (!response.ok) { const failure = await response.json().catch(() => ({})); const error = new Error(failure.message || "Download failed. Try again."); error.status = response.status; throw error; }
      return response.blob();
  }
  async function download(url, filename) {
    await perform(async (signal) => {
      const blob = await fetchFile(url, signal); if (signal.aborted) return;
      const href = URL.createObjectURL(blob), link = document.createElement("a"); link.href = href; link.download = filename; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    }, "Download ready.");
  }
  async function printCard(person) {
    await perform(async (signal) => { const blob = await fetchFile(`/staff/${person._id}/card?format=png`, signal); if (!signal.aborted) await printIdCard(blob, signal); }, "Print dialog opened. Use actual size (100%) and disable printer headers and footers.");
  }
  const exportReport = (format) => download(`${path}?${query}&format=${format}`, `attendance-${profileId || "staff"}.${format}`);
  function editAttendance(staff, record, selectedDate) { setAttendanceEditor({ staff, record, date: selectedDate }); setErrors({}); setError(""); setNotice(""); }
  const changeFilters = (value) => { setFilters(value); setPage(1); setAttendanceEditor(null); };
  return <div className="admin-tools staff-workspace">
    <header className="admin-tools-heading"><div><a href="/" aria-label="Eternal India home"><img className="staff-logo" src="/logo.webp" alt="Eternal India" width="183" height="58" /></a><span className="dashboard-section-label">{technical ? "TECHNICAL" : "ADMIN"} WORKSPACE / PEOPLE</span><h1>Our people. <span>Every day.</span></h1><p>Staff details, attendance and identity cards in one shared workspace.</p></div><div className="staff-actions"><button className="dashboard-button" onClick={onBack} disabled={busy}>← Back to enquiries</button><button className="dashboard-button" onClick={onLogout} disabled={busy}>Sign out</button></div></header>
    <div className="staff-layout"><aside className="staff-navigation"><span className="dashboard-section-label">STAFF WORKSPACE</span><nav aria-label="Staff navigation">{Object.entries(sections).filter(([key]) => key !== "staff-cards" || can("export")).map(([key, label], index) => <button key={key} type="button" disabled={busy} aria-current={section === key && !profileId ? "page" : undefined} onClick={() => choose(key)}><span>0{index + 1}</span>{label}</button>)}</nav><p>{admin.email}</p><small>Shared Admin & Technical records</small></aside>
    <section className="staff-content">{!profileId && ["staff", "staff-attendance"].includes(section) && <StaffAttendanceCalendar apiBase={apiBase} canEdit={can("attendance")} onProfile={profile} onUnauthorized={onUnauthorized} refreshToken={refresh} onChanged={reload} live={live} />}
    <div className="staff-section-heading"><div><span className="dashboard-section-label">ETERNAL INDIA / STAFF</span><h2>{profileId ? "Individual attendance profile" : sections[section]}</h2></div><div className="staff-actions">{profileId && <button className="dashboard-button" onClick={() => choose(section)} disabled={busy}>Back to list</button>}<button className="dashboard-button" disabled={busy || loading} onClick={reload}>Refresh</button>{section === "staff" && !profileId && can("create") && <button className="dashboard-button dashboard-button-primary" disabled={busy} onClick={() => { setEditor({ staff: null }); setErrors({}); setError(""); }}>+ Add staff</button>}</div></div>
    {error && <p className="admin-error admin-tool-error" role="alert">{error}</p>}{notice && <p className="admin-success" role="status">{notice}</p>}
    {editor && <StaffEditor key={editor.staff?._id || "new"} staff={editor.staff} busy={busy} errors={errors} onSave={saveStaff} onCancel={() => setEditor(null)} apiBase={apiBase} />}
    {attendanceEditor && <AttendanceEditor key={`${attendanceEditor.staff._id}:${attendanceEditor.date}:${attendanceEditor.record?.version || 0}`} {...attendanceEditor} busy={busy} errors={errors} onSave={saveAttendance} onCancel={() => setAttendanceEditor(null)} />}
    {profileId && data?.staff && <section className="admin-tool-card staff-profile"><StaffPhoto staff={data.staff} apiBase={apiBase} /><div><h2>{data.staff.name}</h2><strong>{data.staff.employeeId}</strong><p>{data.staff.department} · {data.staff.designation}</p><p>{data.staff.phone} · {data.staff.email}</p><span className={`staff-badge staff-badge-${data.staff.status}`}>{data.staff.deletedAt ? "Deleted · history preserved" : data.staff.status}</span></div></section>}
    <div className="staff-filter-card">{!profileId && <Field label="Search staff name or employee ID"><input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search staff…" /></Field>}
    {profileId || section === "staff-reports" ? <ReportFilters filters={filters} onChange={changeFilters} individual={!!profileId} /> : section === "staff-attendance" ? null : <Field label="Staff status"><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All staff</option><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>}</div>
    {loading ? <p className="admin-tool-empty" role="status">Loading saved records…</p> : !data ? <div className="admin-tool-card"><p>Records could not be loaded.</p><button className="dashboard-button" onClick={reload}>Retry</button></div> : profileId || section === "staff-reports" ? <AttendanceReport data={data} individual={!!profileId} canExport={can("export")} canEdit={can("attendance")} onExport={exportReport} busy={busy} onProfile={profile} onEdit={(row) => editAttendance({ _id: row.staffId, name: row.name, employeeId: row.employeeId }, row, row.date)} onPage={setPage} /> : section === "staff-attendance" ? <>
      <StaffStats stats={data.stats} />
      <section className="admin-tool-card"><h3>Mark staff attendance</h3><p className="staff-note">Choose Present, Absent or Leave for every employee. Attendance for this page is submitted together for the selected date.</p>
        <div className="admin-tool-table-wrap"><table className="admin-tool-table staff-attendance-table"><thead><tr><th>Staff</th><th>Attendance</th></tr></thead><tbody>{data.staff.map((person) => <StaffAttendanceRow key={`${person._id}:${date}`} person={person} status={attendanceDrafts[person._id]?.status || ""} canEdit={can("attendance")} busy={busy} future={date > today} onProfile={profile} onChange={(id, value) => setAttendanceDrafts((previous) => ({ ...previous, [id]: { status: value, version: previous[id]?.version ?? person.attendance?.version ?? 0, dirty: value !== (person.attendance?.status || "") } }))} />)}</tbody></table></div>
        {!data.staff.length && <p className="admin-tool-empty">No active staff found. Add or activate staff in Staff Management.</p>}
        <div className="admin-tool-actions staff-attendance-submit"><Field label="Attendance date (Asia/Kolkata)"><input type="date" value={date} max={today} onChange={(event) => { if (!navigation || navigation.confirmNavigation()) { setDate(event.target.value); setPage(1); } }} /></Field><button type="button" className="dashboard-button dashboard-button-primary" disabled={busy || !data.staff.length || date > today} onClick={submitAttendance}>{busy ? "Submitting…" : "Submit attendance"}</button></div>
      </section>
      <Pager data={data} busy={busy} onPage={(value) => { if (!navigation || navigation.confirmNavigation()) setPage(value); }} />
    </> : <>
      <div className="staff-stats"><div><span>Total staff</span><strong>{data.stats.total}</strong></div><div><span>Active</span><strong>{data.stats.active}</strong></div><div><span>Inactive</span><strong>{data.stats.inactive}</strong></div></div>
      {section === "staff-cards" && <div className="staff-card-intro"><strong>A professional identity. Ready to print.</strong><p>Each card uses the latest saved staff details. Download a 600 DPI PNG or an exact-size 53.98 mm × 85.60 mm PDF. Print at actual size (100%) with margins set to none.</p></div>}
      <div className={`staff-grid ${section === "staff-cards" ? "staff-card-grid" : ""}`}>{data.staff.map((person) => <article className="staff-person" key={person._id}>
        {section === "staff-cards" ? <EmployeeIdCard person={person} apiBase={apiBase} /> : <>
          <div className="staff-person-heading"><StaffPhoto staff={person} apiBase={apiBase} /><div><button className="staff-name" onClick={() => profile(person._id)}>{person.name}</button><small>{person.employeeId}</small><span className={`staff-badge staff-badge-${person.status}`}>{person.status}</span></div></div><p>{person.department} · {person.designation}</p><a href={`mailto:${person.email}`}>{person.email}</a><a href={`tel:${person.phone}`}>{person.phone}</a>
          <details className="staff-card-preview-details" open><summary>Employee ID card preview</summary><EmployeeIdCard person={person} apiBase={apiBase} /></details>
        </>}
        <div className="staff-person-actions"><button disabled={busy} onClick={() => profile(person._id)}>View attendance</button>{section === "staff" && can("edit") && <><button disabled={busy} onClick={() => toggleStaffStatus(person)}>{person.status === "active" ? "Mark inactive" : "Mark active"}</button><button disabled={busy} onClick={() => { setEditor({ staff: person }); setErrors({}); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button></>}{section === "staff" && can("delete") && <button disabled={busy} onClick={() => remove(person)}>Delete</button>}</div>
        {can("export") && <div className="staff-card-download-actions"><button className="staff-card-primary" disabled={busy} onClick={() => download(`/staff/${person._id}/card?format=pdf`, `${person.employeeId}-card.pdf`)}>Download PDF</button><button disabled={busy} onClick={() => download(`/staff/${person._id}/card?format=png`, `${person.employeeId}-card.png`)}>Download PNG</button><button disabled={busy} onClick={() => printCard(person)}>Print ID Card</button></div>}
      </article>)}</div>
      {!data.staff.length && <div className="admin-tool-card"><h3>No staff found</h3><p className="admin-tool-empty">Add your first staff member, or adjust the search and status filters.</p></div>}<Pager data={data} busy={busy} onPage={setPage} />
    </>}
    </section></div>
  </div>;
}
