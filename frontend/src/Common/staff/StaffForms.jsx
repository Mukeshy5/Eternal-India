import { useEffect, useRef, useState } from "react";
import { attendanceStatuses, indiaDate } from "../../../../shared/staff.js";
import { usePanelNavigationGuard } from "../panel/PanelNavigationContext";

export function StaffPhoto({ staff, apiBase }) {
  return <img className="staff-avatar" src={`/api${apiBase}/staff/${staff._id}/photo?v=${staff.version}`} alt={`${staff.name}'s photo`} width="52" height="64" loading="lazy" />;
}
export function Field({ label, error, children }) {
  return <label className="admin-tool-field"><span>{label}</span>{children}{error && <small className="staff-field-error" role="alert">{error}</small>}</label>;
}
export function StaffEditor({ staff, busy, errors, onSave, onCancel, apiBase }) {
  const [values, setValues] = useState(staff || { name: "", email: "", phone: "", department: "", designation: "", status: "active" });
  const [photo, setPhoto] = useState(null);
  usePanelNavigationGuard(!!photo || ["name", "phone", "email", "department", "designation", "status", "joiningDate", "salary"].some((key) => (values[key] ?? "") !== (staff?.[key] ?? (key === "status" ? "active" : ""))), busy, "Discard unsaved staff details?");
  const [preview, setPreview] = useState("");
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const video = useRef(null), stream = useRef(null), mounted = useRef(true), opening = useRef(false);
  function stopCamera() { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; setCamera(false); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stream.current?.getTracks().forEach((track) => track.stop()); }; }, []);
  useEffect(() => { if (!photo) { setPreview(""); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  useEffect(() => { if (camera && video.current) { video.current.srcObject = stream.current; video.current.play().catch(() => setCameraError("Camera preview could not start. Try another camera or upload a photo.")); } }, [camera]);
  async function startCamera() {
    if (opening.current) return; opening.current = true; setCameraError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera requires HTTPS or localhost. You can upload a photo instead.");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } }, audio: false });
      if (!mounted.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current?.getTracks().forEach((track) => track.stop()); stream.current = media; setCamera(true);
    } catch (failure) { if (mounted.current) setCameraError(failure.name === "NotAllowedError" ? "Allow camera access, or upload a photo." : failure.message); }
    finally { opening.current = false; }
  }
  function capture() {
    if (!video.current?.videoWidth) { setCameraError("Wait for the camera preview before capturing."); return; }
    const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 600;
    const source = video.current, ratio = Math.max(480 / source.videoWidth, 600 / source.videoHeight);
    canvas.getContext("2d").drawImage(source, (480 - source.videoWidth * ratio) / 2, (600 - source.videoHeight * ratio) / 2, source.videoWidth * ratio, source.videoHeight * ratio);
    canvas.toBlob((blob) => { if (mounted.current && blob) { setPhoto(blob); stopCamera(); } }, "image/jpeg", 0.9);
  }
  function choosePhoto(event) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 2 * 1024 * 1024) { setCameraError("Choose a JPEG or PNG photo up to 2 MB."); return; }
    setCameraError(""); setPhoto(file); stopCamera();
  }
  function submit(event) {
    event.preventDefault();
    const form = new FormData();
    for (const key of ["name", "email", "phone", "department", "designation", "status", "joiningDate", "salary"]) form.append(key, values[key] ?? "");
    if (staff) form.append("version", String(staff.version));
    if (photo) form.append("photo", photo, "staff-photo.jpg");
    onSave(form);
  }
  return <form className="admin-tool-card staff-editor" onSubmit={submit} aria-label={staff ? "Edit staff" : "Add staff"}>
    <h2>{staff ? `Edit ${staff.employeeId}` : "Add staff"}</h2><p className="staff-note">Employee IDs and identity cards are created automatically when the record is saved.</p>
    <fieldset disabled={busy}><div className="staff-photo-editor">
      {camera ? <video ref={video} muted playsInline aria-label="Live staff camera" /> : preview ? <img src={preview} alt="New staff photo preview" /> : staff ? <StaffPhoto staff={staff} apiBase={apiBase} /> : <div className="staff-photo-placeholder">Staff photo</div>}
      <div className="staff-photo-controls"><button type="button" className="dashboard-button" onClick={camera ? capture : startCamera}>{camera ? "Capture photo" : "Open live camera"}</button>{camera && <button type="button" className="dashboard-button" onClick={stopCamera}>Close camera</button>}<Field label="Or upload photo (JPEG / PNG, up to 2 MB)" error={errors.photo}><input type="file" accept="image/jpeg,image/png" capture="user" onChange={choosePhoto} required={!staff && !photo} /></Field>{cameraError && <p className="staff-field-error" role="alert">{cameraError}</p>}</div>
    </div><div className="admin-tool-grid">{[["name", "Staff name", "text", 100], ["phone", "Phone number", "tel", 25], ["email", "Email address", "email", 200], ["department", "Department", "text", 80], ["designation", "Designation", "text", 80]].map(([key, label, type, maxLength]) => <Field key={key} label={label} error={errors[key]}><input name={key} type={type} required maxLength={maxLength} value={values[key]} aria-invalid={!!errors[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></Field>)}<Field label="Status" error={errors.status}><select name="status" value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field></div>
    <div className="admin-tool-grid"><Field label="Joining date (optional)" error={errors.joiningDate}><input name="joiningDate" type="date" value={values.joiningDate ?? ""} onChange={(event) => setValues({ ...values, joiningDate: event.target.value })} /></Field><Field label="Monthly gross salary · INR (optional)" error={errors.salary}><input name="salary" type="number" min="0" max="99999999.99" step="0.01" value={values.salary ?? ""} onChange={(event) => setValues({ ...values, salary: event.target.value })} /></Field></div>
    <div className="admin-tool-actions"><button type="submit" className="dashboard-button dashboard-button-primary">{busy ? "Saving…" : staff ? "Update staff" : "Save staff & create card"}</button><button type="button" className="dashboard-button" onClick={onCancel}>Cancel</button></div></fieldset>
  </form>;
}

export function AttendanceEditor({ staff, record, date, busy, errors, onSave, onCancel }) {
  const [status, setStatus] = useState(record?.status || "present");
  const [checkIn, setCheckIn] = useState(record?.checkIn || ""), [checkOut, setCheckOut] = useState(record?.checkOut || "");
  const [leaveType, setLeaveType] = useState(record?.leaveType || ""), [remarks, setRemarks] = useState(record?.remarks || "");
  usePanelNavigationGuard(status !== (record?.status || "present") || checkIn !== (record?.checkIn || "") || checkOut !== (record?.checkOut || "") || leaveType !== (record?.leaveType || "") || remarks !== (record?.remarks || ""), busy, "Discard unsaved attendance changes?");
  return <form className="admin-tool-card staff-attendance-editor" aria-label="Mark attendance" onSubmit={(event) => { event.preventDefault(); onSave({ status, staffId: staff._id, date, checkIn, checkOut, leaveType, remarks, ...(record ? { version: record.version } : {}) }); }}>
    <h2>{record ? "Update attendance" : "Mark attendance"}</h2><p>{staff.name} · {staff.employeeId} · {date}</p><fieldset disabled={busy}><div className="admin-tool-grid">
      <Field label="Attendance" error={errors.status}><select name="attendanceStatus" value={status} onChange={(event) => { const value = event.target.value; setStatus(value); if (["absent", "leave", "weekly_off"].includes(value)) { setCheckIn(""); setCheckOut(""); } if (value !== "leave") setLeaveType(""); }}>{Object.entries(attendanceStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label="Date (Asia/Kolkata)" error={errors.date}><input type="date" value={date} max={indiaDate()} readOnly /></Field>
      <Field label="Check-in" error={errors.checkIn}><input type="time" value={checkIn} disabled={["absent", "leave", "weekly_off"].includes(status)} onChange={(event) => setCheckIn(event.target.value)} /></Field>
      <Field label="Check-out" error={errors.checkOut}><input type="time" value={checkOut} disabled={["absent", "leave", "weekly_off"].includes(status)} onChange={(event) => setCheckOut(event.target.value)} /></Field>
      {status === "leave" && <Field label="Leave type" error={errors.leaveType}><input maxLength={80} value={leaveType} onChange={(event) => setLeaveType(event.target.value)} placeholder="Casual, Sick…" /></Field>}
      <Field label="Remarks" error={errors.remarks}><input maxLength={300} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Optional note" /></Field>
    </div><div className="admin-tool-actions"><button type="submit" className="dashboard-button dashboard-button-primary">{busy ? "Saving…" : "Save attendance"}</button><button type="button" className="dashboard-button" onClick={onCancel}>Cancel</button></div></fieldset>
  </form>;
}
