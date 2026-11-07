import { useEffect, useState } from "react";
import { attendanceStatuses } from "../../../../shared/staff.js";

const draftFrom = (record) => ({ record, status: record?.status || "", checkIn: record?.checkIn || "", checkOut: record?.checkOut || "" });
export default function StaffAttendanceRow({ person, date, canEdit, busy, future, onProfile, onSave }) {
  const [draft, setDraft] = useState(() => draftFrom(person.attendance));
  const [dirty, setDirty] = useState(false);
  const record = person.attendance;
  useEffect(() => { if (!dirty) setDraft((previous) => (record?.version || 0) >= (previous.record?.version || 0) ? draftFrom(record) : previous); }, [record, dirty]);
  const timed = ["present", "half_day"].includes(draft.status);
  const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const hours = timed && draft.checkIn && draft.checkOut && draft.checkOut > draft.checkIn ? ((minutes(draft.checkOut) - minutes(draft.checkIn)) / 60).toFixed(2) : "0.00";
  const changedElsewhere = dirty && (record?.version || 0) > (draft.record?.version || 0);
  const invalidTime = !!draft.checkOut && (!draft.checkIn || draft.checkOut <= draft.checkIn);
  const change = (fields) => { setDraft({ ...draft, ...fields }); setDirty(true); };
  async function save() {
    const saved = await onSave(person, draft.record, { staffId: person._id, date, status: draft.status, checkIn: draft.checkIn, checkOut: draft.checkOut, ...(draft.record ? { version: draft.record.version } : {}) });
    if (saved) { setDraft(draftFrom(saved)); setDirty(false); }
  }
  return <tr className={dirty ? "staff-attendance-dirty" : undefined}>
    <td data-label="Staff"><button type="button" onClick={() => onProfile(person._id)}>{person.name}</button><small>{person.employeeId}</small></td>
    <td data-label="Attendance">{canEdit ? <select className={`staff-attendance-select staff-badge-${draft.status || "unmarked"}`} aria-label={`Attendance status for ${person.name}`} value={draft.status} disabled={busy || future} onChange={(event) => change({ status: event.target.value, ...(["absent", "leave", ""].includes(event.target.value) ? { checkIn: "", checkOut: "" } : {}) })}><option value="">Select attendance</option>{Object.entries(attendanceStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select> : <span className={`staff-badge staff-badge-${record?.status || "unmarked"}`}>{attendanceStatuses[record?.status] || "Unmarked"}</span>}{dirty && <small className="staff-draft-label">Unsaved changes</small>}</td>
    <td data-label="Check-in">{canEdit ? <input type="time" aria-label={`Check-in for ${person.name}`} value={draft.checkIn} disabled={busy || future || !timed} onChange={(event) => change({ checkIn: event.target.value })} /> : record?.checkIn || "—"}</td>
    <td data-label="Check-out">{canEdit ? <><input type="time" aria-label={`Check-out for ${person.name}`} aria-invalid={invalidTime} value={draft.checkOut} disabled={busy || future || !timed} onChange={(event) => change({ checkOut: event.target.value })} />{invalidTime && <small className="staff-field-error">Check-out must be after check-in on the same day.</small>}</> : record?.checkOut || "—"}</td>
    <td data-label="Hours">{canEdit ? hours : ((record?.workingMinutes || 0) / 60).toFixed(2)}</td>
    <td data-label="Action">{canEdit && <div className="staff-row-actions"><button type="button" className="staff-attendance-save" aria-label={`Save attendance for ${person.name}`} disabled={busy || future || !draft.status || !dirty || changedElsewhere || invalidTime} onClick={save}>{busy && dirty ? "Saving…" : "Save attendance"}</button>{dirty && <button type="button" disabled={busy} onClick={() => { setDraft(draftFrom(record)); setDirty(false); }}>Reset</button>}{changedElsewhere && <small className="staff-field-error">Updated in another session. Reset to load the latest record.</small>}</div>}</td>
  </tr>;
}
