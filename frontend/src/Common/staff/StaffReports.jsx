import { attendancePolicy, attendanceStatuses, legacyAttendanceStatuses } from "../../../../shared/staff.js";
import { Field } from "./StaffForms";
const statusLabel = (status) => attendanceStatuses[status] || legacyAttendanceStatuses[status] || status;

export function Pager({ data, onPage, busy }) {
  return data.pages > 1 && <div className="staff-pagination"><button className="dashboard-button" disabled={busy || data.page <= 1} onClick={() => onPage(data.page - 1)}>Previous</button><span>Page {data.page} of {data.pages} · {data.total} records</span><button className="dashboard-button" disabled={busy || data.page >= data.pages} onClick={() => onPage(data.page + 1)}>Next</button></div>;
}
export function StaffStats({ stats }) {
  if (!stats) return null;
  const entries = Object.hasOwn(stats, "totalStaff") ? [["Total staff", stats.totalStaff], ["Active staff", stats.activeStaff], ["Present", stats.present], ["Absent", stats.absent], ["On Leave", stats.leave], ["Unmarked", stats.unmarked]] : [["Working days", stats.totalWorkingDays], ["Present days", stats.present], ["Absent days", stats.absent], ["Leave days", stats.leave], ["Attendance", `${stats.attendancePercentage}%`]];
  return <div className="staff-stats">{entries.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}
export function ReportFilters({ filters, onChange, individual }) {
  const change = (key, value) => onChange({ ...filters, [key]: value });
  return <div className="staff-filters">{!individual && <Field label="Report period"><select value={filters.period} onChange={(event) => change("period", event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly (Monday–Sunday)</option><option value="monthly">Monthly</option><option value="custom">Date range</option></select></Field>}
    {individual && <Field label="Filter by"><select value={filters.period} onChange={(event) => change("period", event.target.value)}><option value="monthly">Month</option><option value="custom">Date range</option></select></Field>}
    {filters.period === "monthly" ? <Field label="Month"><input type="month" required value={filters.month} onChange={(event) => change("month", event.target.value)} /></Field> : filters.period === "custom" ? <><Field label="From date"><input type="date" required value={filters.from} onChange={(event) => change("from", event.target.value)} /></Field><Field label="To date"><input type="date" required value={filters.to} onChange={(event) => change("to", event.target.value)} /></Field></> : <Field label={filters.period === "weekly" ? "Date within week" : "Date"}><input type="date" required value={filters.date} onChange={(event) => change("date", event.target.value)} /></Field>}
  </div>;
}
function Breakdown({ label, rows }) {
  return <details className="staff-breakdown"><summary>{label}</summary><div className="admin-tool-table-wrap"><table className="admin-tool-table"><thead><tr><th>Period</th><th>Present</th><th>Absent</th><th>Leave</th><th>Attendance %</th></tr></thead><tbody>{rows.map((row) => <tr key={row.date}><td>{row.date}</td><td>{row.present}</td><td>{row.absent}</td><td>{row.leave}</td><td>{row.attendancePercentage}%</td></tr>)}</tbody></table></div></details>;
}
function AttendanceCalendar({ records, month }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const byDate = Object.fromEntries(records.map((record) => [record.date, record.status]));
  const cells = Array.from({ length: firstDay + days }, (_, index) => {
    if (index < firstDay) return null;
    const day = index - firstDay + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    return { day, date, status: byDate[date] || "" };
  });
  return <section className="staff-calendar" aria-label={`Attendance calendar for ${month}`}><div className="staff-calendar-heading"><strong>{month}</strong><span>Attendance calendar</span></div><div className="staff-calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div><div className="staff-calendar-grid">{cells.map((cell, index) => cell ? <div className={`staff-calendar-day${cell.status ? ` staff-calendar-${cell.status}` : ""}`} key={cell.date}><strong>{cell.day}</strong><span>{statusLabel(cell.status) || "—"}</span></div> : <span className="staff-calendar-empty" key={`empty-${index}`} />)}</div></section>;
}
export function AttendanceReport({ data, individual, canExport, onExport, busy, onProfile, onEdit, canEdit, onPage }) {
  return <><StaffStats stats={data.summary} /><section className="admin-tool-card"><div className="staff-section-heading"><div><h2>{individual ? "Attendance history" : "Attendance report"}</h2><p className="staff-note">{data.from} to {data.to} · {data.total} marked records</p></div>{canExport && <div className="staff-actions"><button className="dashboard-button" disabled={busy} onClick={() => onExport("pdf")}>Export PDF</button><button className="dashboard-button" disabled={busy} onClick={() => onExport("xlsx")}>Export Excel</button></div>}</div>
    <p className="staff-note">{attendancePolicy}</p><div className="admin-tool-table-wrap"><table className="admin-tool-table staff-history"><thead><tr>{!individual && <th>Staff</th>}<th>Date</th><th>Status</th>{canEdit && <th>Action</th>}</tr></thead><tbody>{data.records.map((row) => <tr key={row._id}>{!individual && <td><button onClick={() => onProfile(row.staffId)}>{row.name}</button><small>{row.employeeId}</small></td>}<td>{row.date}</td><td><span className={`staff-badge staff-badge-${row.status}`}>{statusLabel(row.status)}</span></td>{canEdit && <td><button disabled={busy} onClick={() => onEdit(row)}>Edit attendance</button></td>}</tr>)}</tbody></table></div>{!data.records.length && <p className="admin-tool-empty">No attendance has been marked for this period.</p>}<Pager data={data} onPage={onPage} busy={busy} />
    {individual && <AttendanceCalendar records={data.records} month={data.from.slice(0, 7)} />}<Breakdown label="Daily totals" rows={data.daily} /><Breakdown label="Monthly totals" rows={data.monthly} />
  </section></>;
}
