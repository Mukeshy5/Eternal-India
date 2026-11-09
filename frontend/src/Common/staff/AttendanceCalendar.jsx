import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { attendanceStatuses, indiaDate } from "../../../../shared/staff.js";
import { AttendanceEditor, StaffPhoto } from "./StaffForms";
import { Pager } from "./StaffReports";
import { usePanelNavigationGuard } from "../panel/PanelNavigationContext";
import "./calendar.css";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const symbols = { present: "P", absent: "A", leave: "L", half_day: "½", weekly_off: "WO" };
const periodLabel = (date, view) => new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...(view === "monthly" ? { month: "long", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" }) }).format(new Date(`${date}T00:00:00Z`));

export default function AttendanceCalendar({ apiBase, canEdit, onProfile, onUnauthorized, refreshToken, onChanged, live }) {
  const [anchor, setAnchor] = useState(indiaDate()), [view, setView] = useState("monthly"), [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(""), [search, setSearch] = useState(""), [department, setDepartment] = useState("");
  const [response, setResponse] = useState(null), [error, setError] = useState(""), [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false), [errors, setErrors] = useState({});
  const dialog = useRef(null), trigger = useRef(null), lock = useRef(false), action = useRef(null), alive = useRef(true);
  usePanelNavigationGuard(false, busy);
  const query = new URLSearchParams({ month: anchor.slice(0, 7), date: anchor, view, search, department, page: String(page) });
  const key = `${apiBase}/staff-calendar?${query}`;
  const data = response?.key === key ? response.data : null;
  const loading = response?.key !== key || response.loading;
  useEffect(() => { const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [searchInput]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; action.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController(); let inFlight = false;
    setResponse((previous) => previous?.key === key && previous.data ? previous : { key, loading: true, data: null });
    async function load() {
      if (document.hidden || inFlight) return; inFlight = true;
      try { const result = await api(key, { signal: controller.signal }); if (!controller.signal.aborted) { setResponse({ key, data: result, loading: false }); setError(""); if (page > result.pages) setPage(result.pages); } }
      catch (failure) { if (!controller.signal.aborted) { setError(failure.message); setResponse({ key, loading: false, data: null }); if (failure.status === 401) onUnauthorized(); } }
      finally { inFlight = false; }
    }
    void load(); const timer = setInterval(load, 30000);
    window.addEventListener("focus", load); document.addEventListener("visibilitychange", load);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", load); };
  }, [key, refreshToken, page, onUnauthorized]);
  useEffect(() => {
    if (!selected || !dialog.current) return;
    if (typeof dialog.current.showModal === "function") dialog.current.showModal(); else dialog.current.setAttribute("open", "");
    return () => trigger.current?.focus();
  }, [selected?.person._id, selected?.date]);
  function move(amount) {
    const date = new Date(`${anchor}T00:00:00Z`);
    if (view === "monthly") { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + amount); }
    else date.setUTCDate(date.getUTCDate() + amount * (view === "weekly" ? 7 : 1));
    const value = date.toISOString().slice(0, 10); if (value < "2000-01-01" || value > "2100-12-31") return;
    setAnchor(value); setPage(1);
  }
  function open(person, date, element) { trigger.current = element; setSelected({ person, date, record: person.attendance[date] || null }); setErrors({}); setError(""); }
  async function save(body) {
    if (lock.current) return; lock.current = true; setBusy(true); setErrors({}); setError("");
    const controller = new AbortController(); action.current = controller;
    try {
      await api(`${apiBase}/staff-attendance${selected.record ? `/${selected.record._id}` : ""}`, { method: selected.record ? "PATCH" : "POST", body: JSON.stringify(body), signal: controller.signal });
      if (alive.current) { setSelected(null); onChanged(); }
    } catch (failure) { if (alive.current && !controller.signal.aborted) { setError(Object.values(failure.errors || {}).join(" ") || failure.message); setErrors(failure.errors || {}); if (failure.status === 401) onUnauthorized(); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function reloadSelected() {
    if (lock.current) return; lock.current = true; setBusy(true);
    const controller = new AbortController(); action.current = controller;
    try { const result = await api(`${apiBase}/staff/${selected.person._id}/attendance?from=${selected.date}&to=${selected.date}`, { signal: controller.signal }); if (alive.current) { setSelected({ ...selected, record: result.records[0] || null }); setError(""); setErrors({}); } }
    catch (failure) { if (alive.current && !controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized(); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function setHoliday(day, enabled) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    const controller = new AbortController(); action.current = controller;
    const days = data.weeklyHolidays, weeklyHolidays = enabled ? [...new Set([...days, day])] : days.filter((value) => value !== day);
    try { const result = await api(`${apiBase}/staff-calendar-settings`, { method: "PATCH", body: JSON.stringify({ weeklyHolidays }), signal: controller.signal }); if (alive.current) { setResponse((previous) => previous?.key === key && previous.data ? { ...previous, data: { ...previous.data, weeklyHolidays: result.weeklyHolidays, dates: previous.data.dates.map((day) => ({ ...day, isWeeklyOff: result.weeklyHolidays.includes(day.weekday) })) } } : previous); onChanged(); } }
    catch (failure) { if (alive.current && !controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized(); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="attendance-calendar staff-attendance-calendar-top" aria-label="Advanced attendance calendar">
    <header className="attendance-calendar-heading"><div><span className="dashboard-section-label">TEAM ATTENDANCE</span><h2>Attendance calendar</h2><p>Every employee. Every day. Attendance from saved staff records.</p></div><span className={`attendance-live ${live ? "is-connected" : ""}`}><i />{live ? "Live updates" : "Auto refresh"}</span></header>
    <div className="attendance-calendar-toolbar"><div className="attendance-period"><button type="button" className="dashboard-button" aria-label={view === "monthly" ? "Previous Month" : "Previous period"} onClick={() => move(-1)}>‹</button><strong>{periodLabel(anchor, view)}</strong><button type="button" className="dashboard-button" aria-label={view === "monthly" ? "Next Month" : "Next period"} onClick={() => move(1)}>›</button><button type="button" className="dashboard-button" onClick={() => { setAnchor(indiaDate()); setPage(1); }}>Today</button></div><div className="attendance-view-switch" aria-label="Calendar view">{["daily", "weekly", "monthly"].map((value) => <button type="button" key={value} aria-pressed={view === value} onClick={() => { setView(value); setPage(1); }}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div>
    <div className="attendance-calendar-filters"><label>Search staff<input type="search" placeholder="Name or employee ID" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label><label>Department<select value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}><option value="">All departments</option>{(data?.departments || (department ? [department] : [])).map((value) => <option key={value}>{value}</option>)}</select></label><label>{view === "monthly" ? "Selected month" : "Selected date"}<input type={view === "monthly" ? "month" : "date"} min={view === "monthly" ? "2000-01" : "2000-01-01"} max={view === "monthly" ? "2100-12" : "2100-12-31"} value={view === "monthly" ? anchor.slice(0, 7) : anchor} onChange={(event) => { if (event.target.value) { setAnchor(view === "monthly" ? `${event.target.value}-01` : event.target.value); setPage(1); } }} /></label></div>
    {error && !selected && <p className="admin-error" role="alert">{error}</p>}
    <div className="attendance-legend">{[["present", "Present"], ["absent", "Absent"], ["leave", "Leave"], ["half_day", "Half Day"], ["weekly_off", "Sunday / Weekly Off"], ["missing", "Not marked"]].map(([key, label]) => <span key={key}><i className={`attendance-color-${key}`}>{key === "missing" ? "×" : ""}</i>{label}</span>)}</div>
    {loading ? <p className="attendance-calendar-empty" role="status">Loading attendance calendar…</p> : !data ? <p className="attendance-calendar-empty">Calendar unavailable. Use Refresh to retry.</p> : <>
      <div className="attendance-calendar-grid" tabIndex="0" aria-label="Scrollable employee attendance dates"><table style={{ "--calendar-days": data.dates.length }} className={`attendance-matrix attendance-matrix-${view}`}><caption className="admin-sr-only">Active staff attendance, {data.from} to {data.to}. Cross means attendance has not been marked.</caption><colgroup><col className="attendance-person-column" />{data.dates.map((day) => <col key={day.date} />)}</colgroup><thead><tr><th scope="col" className="attendance-person-cell">Employee <small>{data.total} active staff</small></th>{data.dates.map((day) => <th scope="col" key={day.date} className={`${day.isSunday || day.isWeeklyOff ? "attendance-day-off" : ""} ${day.date === data.today ? "attendance-day-today" : ""}`}><span>{dayNames[day.weekday]}</span><strong>{Number(day.date.slice(8))}</strong>{view !== "monthly" && <small>{day.date.slice(5, 7)}</small>}</th>)}</tr></thead><tbody>{data.staff.map((person) => <tr key={person._id}><th scope="row" className="attendance-person-cell"><button type="button" className="attendance-person" onClick={() => onProfile(person._id, anchor.slice(0, 7))}><StaffPhoto staff={person} apiBase={apiBase} /><span><strong>{person.name}</strong><small>{person.employeeId}</small><em>{person.department}</em></span></button></th>{data.dates.map((day) => { const record = person.attendance[day.date], status = record?.status || "missing"; return <td key={day.date} className={`${day.isSunday || day.isWeeklyOff ? "attendance-day-off" : ""} ${day.date === data.today ? "attendance-day-today" : ""}`}><button type="button" className={`attendance-cell attendance-color-${status} ${day.date > data.today ? "attendance-cell-future" : ""}`} aria-label={`${person.name}, ${day.date}: ${attendanceStatuses[status] || "Not marked"}${day.isSunday ? ", Sunday" : ""}`} title={`${attendanceStatuses[status] || "Attendance not marked"} · ${day.date}${record?.checkIn ? ` · ${record.checkIn}–${record.checkOut || "open"}` : ""}`} onClick={(event) => open(person, day.date, event.currentTarget)}>{symbols[status] || "×"}{view === "daily" && <span>{attendanceStatuses[status] || "Not marked"}</span>}</button></td>; })}</tr>)}</tbody></table>{!data.staff.length && <p className="attendance-calendar-empty">No active staff match these filters.</p>}</div>
      <footer className="attendance-calendar-bottom"><span>{data.from} to {data.to} · {data.sundayCount} Sundays · {data.staff.length} staff on this page</span><Pager data={data} onPage={setPage} busy={busy} /></footer><p className="attendance-calendar-note">Sunday/weekly holiday shading does not mark attendance automatically. A cross means no saved record. Future dates are view-only.</p>
      {canEdit && <details className="attendance-holiday-settings"><summary>Weekly holiday settings</summary><div>{dayNames.map((label, day) => <label key={day}><input type="checkbox" checked={data.weeklyHolidays.includes(day)} disabled={busy} onChange={(event) => setHoliday(day, event.target.checked)} />{label}</label>)}</div></details>}
    </>}
    {selected && <dialog ref={dialog} className="attendance-calendar-dialog" aria-label={`Attendance details for ${selected.person.name}`} onCancel={(event) => { event.preventDefault(); if (!busy) setSelected(null); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) setSelected(null); }}><button className="attendance-dialog-close" type="button" aria-label="Close attendance details" disabled={busy} onClick={() => setSelected(null)}>×</button>{error && <div className="attendance-dialog-error"><p className="admin-error" role="alert">{error}</p><button className="dashboard-button" disabled={busy} onClick={reloadSelected}>Reload saved attendance</button></div>}{canEdit && selected.date <= indiaDate() ? <AttendanceEditor key={`${selected.person._id}:${selected.date}:${selected.record?.version || 0}`} staff={selected.person} record={selected.record} date={selected.date} busy={busy} errors={errors} onSave={save} onCancel={() => setSelected(null)} /> : <section className="admin-tool-card"><h2>{selected.person.name}</h2><p>{selected.person.employeeId} · {selected.date}</p><dl className="attendance-readonly"><dt>Status</dt><dd>{attendanceStatuses[selected.record?.status] || "Not marked"}</dd><dt>Check-in</dt><dd>{selected.record?.checkIn || "—"}</dd><dt>Check-out</dt><dd>{selected.record?.checkOut || "—"}</dd><dt>Working hours</dt><dd>{((selected.record?.workingMinutes || 0) / 60).toFixed(2)}</dd></dl><button className="dashboard-button" onClick={() => setSelected(null)}>Close</button></section>}</dialog>}
  </section>;
}
