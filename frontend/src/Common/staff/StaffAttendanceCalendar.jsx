import { attendanceStatuses, indiaDate } from "../../../../shared/staff.js";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (value) => String(value).padStart(2, "0");
const monthLabel = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const statusLabel = (status) => attendanceStatuses[status] || "Not marked";

function monthDays(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${pad(day)}`;
    return { day, date, sunday: new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay() === 0, weekday: new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay() };
  });
}

function Summary({ records, month, weeklyHolidays }) {
  const days = monthDays(month);
  const values = { present: 0, absent: 0, leave: 0, half_day: 0 };
  for (const record of records) if (values[record.status] !== undefined) values[record.status] += 1;
  const sundays = days.filter((day) => day.sunday).length;
  const holidays = days.filter((day) => !day.sunday && weeklyHolidays.includes(day.weekday)).length;
  const working = days.length - sundays - holidays;
  const percentage = working ? Math.round((values.present + values.half_day * 0.5) / working * 100) : 0;
  return <div className="staff-calendar-summary">{[["Present", values.present, "present"], ["Absent", values.absent, "absent"], ["Leave", values.leave, "leave"], ["Sundays", sundays, "sunday"], ["Holidays", holidays, "holiday"], ["Half Days", values.half_day, "half_day"], ["Working Days", working, "working"], ["Attendance", `${percentage}%`, "percentage"]].map(([label, value, tone]) => <div className={`staff-calendar-summary-${tone}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

export default function StaffAttendanceCalendar({ data, month, search, onSearch, onMonthChange, onToday, selectedId, onSelect, selectedDate, onDateSelect, weeklyHolidays, canEdit, onEdit, onSaveHolidays, technical }) {
  const people = data?.calendar || [];
  const selected = people.find((person) => person.staffId === selectedId) || people[0];
  const records = selected?.records || [];
  const byDate = Object.fromEntries(records.map((record) => [record.date, record]));
  const days = monthDays(month);
  const detail = byDate[selectedDate];
  const today = indiaDate();
  const moveMonth = (amount) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
    onMonthChange(`${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`);
  };
  return <section className="staff-attendance-calendar-top">
    <div className="staff-calendar-top-heading"><div><span className="dashboard-section-label">ATTENDANCE CONTROL</span><h2>Staff attendance calendar</h2><p>Choose a staff member to inspect and correct the complete monthly record.</p></div><div className="staff-calendar-navigation"><button className="dashboard-button" onClick={() => moveMonth(-1)}>Previous month</button><button className="dashboard-button" onClick={() => moveMonth(1)}>Next month</button><button className="dashboard-button dashboard-button-primary" onClick={onToday}>Today</button></div></div>
    <div className="staff-calendar-toolbar"><label>Search staff<input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Name or employee ID" /></label><strong>{monthLabel(month)}</strong></div>
    <div className="staff-calendar-layout"><aside className="staff-calendar-staff-list"><h3>Active staff <span>{people.length}</span></h3>{people.map((person) => <button className={person.staffId === selected?.staffId ? "is-selected" : ""} key={person.staffId} onClick={() => onSelect(person.staffId)}><strong>{person.name}</strong><span>{person.employeeId}</span><small>{person.designation} · {person.department}</small></button>)}{!people.length && <p>No active staff found.</p>}</aside>
      {selected && <div className="staff-calendar-main"><div className="staff-calendar-person"><div><h3>{selected.name}</h3><span>{selected.employeeId} · {selected.designation} · {selected.department}</span></div><span className="staff-calendar-panel-label">{technical ? "Technical Panel" : "Admin Panel"}</span></div><Summary records={records} month={month} weeklyHolidays={weeklyHolidays} />
        <div className="staff-calendar-month-grid">{days.map((day) => { const record = byDate[day.date]; const holiday = !day.sunday && weeklyHolidays.includes(day.weekday); const status = record?.status || ""; return <button className={`staff-calendar-month-day ${day.sunday ? "is-sunday" : ""} ${holiday ? "is-holiday" : ""} ${status ? `is-${status}` : ""} ${day.date === today ? "is-today" : ""} ${day.date === selectedDate ? "is-date-selected" : ""}`} key={day.date} onClick={() => onDateSelect(day.date)}><span>{dayNames[day.weekday]}</span><strong>{day.day}</strong><b>{status === "present" ? "✓" : status === "absent" ? "✕" : status === "leave" ? "L" : status === "half_day" ? "½" : day.sunday ? "S" : holiday ? "H" : ""}</b></button>; })}</div>
        <div className="staff-calendar-legend"><span><i className="legend-present" />Present ✓</span><span><i className="legend-absent" />Absent ✕</span><span><i className="legend-leave" />Leave L</span><span><i className="legend-sunday" />Sunday S</span><span><i className="legend-holiday" />Holiday H</span><span><i className="legend-half-day" />Half day ½</span><span><i className="legend-unmarked" />Not marked</span></div>
        <div className="staff-calendar-detail"><div><span className="dashboard-section-label">DATE DETAILS</span><h3>{selectedDate} · {new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" })}</h3></div>{detail ? <dl><dt>Staff</dt><dd>{selected.name} ({selected.employeeId})</dd><dt>Status</dt><dd>{statusLabel(detail.status)}</dd><dt>Check-in / Check-out</dt><dd>{detail.checkIn || "—"} / {detail.checkOut || "—"}</dd><dt>Total working hours</dt><dd>{(detail.workingMinutes / 60).toFixed(2)} hours</dd>{detail.leaveType && <><dt>Leave type</dt><dd>{detail.leaveType}</dd></>}{detail.remarks && <>        <dt>Remarks</dt><dd>{detail.remarks}</dd></>}<dt>Marked by</dt><dd>{detail.markedBy || (technical ? "Technical Panel" : "Admin Panel")}</dd></dl> : <p>No attendance record marked for this date. Sunday and holidays are not automatically absent.</p>}{canEdit && <button className="dashboard-button dashboard-button-primary" onClick={() => onEdit({ _id: selected.staffId, name: selected.name, employeeId: selected.employeeId }, detail || null, selectedDate)}>{detail ? "Update attendance" : "Mark attendance"}</button>}</div>
        <div className="staff-calendar-holidays"><strong>Weekly holidays</strong>{dayNames.map((day, index) => <label key={day}><input type="checkbox" disabled={!canEdit} checked={weeklyHolidays.includes(index)} onChange={(event) => onSaveHolidays(index, event.target.checked)} />{day}</label>)}</div>
      </div>}
    </div>
  </section>;
}
