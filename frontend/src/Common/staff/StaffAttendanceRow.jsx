import { attendanceStatuses } from "../../../../shared/staff.js";

export default function StaffAttendanceRow({ person, status, canEdit, busy, future, onProfile, onChange }) {
  return <tr>
    <td data-label="Staff"><button type="button" onClick={() => onProfile(person._id)}>{person.name}</button><small>{person.employeeId}</small></td>
    <td data-label="Attendance">{canEdit ? <select className={`staff-attendance-select staff-badge-${status || "unmarked"}`} aria-label={`Attendance status for ${person.name}`} value={status} disabled={busy || future} onChange={(event) => onChange(person._id, event.target.value)}><option value="">Select attendance</option>{Object.entries(attendanceStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select> : <span className={`staff-badge staff-badge-${person.attendance?.status || "unmarked"}`}>{attendanceStatuses[person.attendance?.status] || "Unmarked"}</span>}</td>
  </tr>;
}
