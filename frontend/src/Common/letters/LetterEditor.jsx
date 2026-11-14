import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { indiaDate } from "../../../../shared/staff.js";
import { defaultLetterContent, employmentDuration, letterTypes } from "../../../../shared/employmentLetters.js";
import { usePanelNavigationGuard } from "../panel/PanelNavigationContext";
import LetterDocument from "./LetterDocument";

function Field({ label, error, children, wide }) {
  return <label className={`letter-field${wide ? " letter-field-wide" : ""}`}><span>{label}</span>{children}{error && <small role="alert">{error}</small>}</label>;
}

function EmployeePicker({ apiBase, onSelect, onError, disabled }) {
  const [search, setSearch] = useState(""), [page, setPage] = useState(1), [data, setData] = useState(null), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    const timer = window.setTimeout(() => {
      api(`${apiBase}/letters/employees?${new URLSearchParams({ search, page: String(page) })}`, { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setData(result); })
        .catch((failure) => { if (!controller.signal.aborted) { setData(null); onError(failure); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [apiBase, search, page, onError]);
  return <div className="letter-employee-picker"><Field label="Search employee records"><input type="search" name="employeeSearch" maxLength={100} placeholder="Name, ID, designation or department" value={search} disabled={disabled} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></Field>
    {loading ? <p role="status">Loading employees…</p> : data && <><div className="letter-employee-results" aria-label="Select employee">{data.employees.map((person) => <button type="button" key={person._id} disabled={disabled} onClick={() => onSelect(person._id)}><span className="letter-avatar">{person.name.slice(0, 1)}</span><span><strong>{person.name}</strong><small>{person.employeeId} · {person.designation} · {person.department}</small></span><span className="letter-employee-status">{person.status}</span></button>)}{!data.total && <p>No matching employees. Add an employee in Staff Management first.</p>}</div>{data.pages > 1 && <div className="letter-pagination"><button type="button" disabled={disabled || page <= 1} onClick={() => setPage(page - 1)}>Previous employees</button><span>{page} / {data.pages}</span><button type="button" disabled={disabled || page >= data.pages} onClick={() => setPage(page + 1)}>Next employees</button></div>}</>}
  </div>;
}

export default function LetterEditor({ type, record, company, apiBase, busy, errors, canExport, canSaveCompany, onError, onSave, onPreview, onCancel, onSaveCompany }) {
  const [initial] = useState(() => record ? { ...record, salary: String(record.salaryPaise / 100), requestKey: undefined } : {
    type, staffId: "", employee: null, company: { ...company }, issueDate: indiaDate(), joiningDate: "", lastWorkingDate: "", salary: "", salaryPeriod: "month", content: "", terms: "", responsibilities: "", performance: "", requestKey: crypto.randomUUID(),
  });
  const [values, setValues] = useState(initial), [selecting, setSelecting] = useState(false), [customContent, setCustomContent] = useState(!!record && record.content !== defaultLetterContent(record));
  const employeeRequest = useRef(null), alive = useRef(true);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  usePanelNavigationGuard(dirty, busy || selecting, "Discard the unsaved letter content?");
  useEffect(() => { alive.current = true; return () => { alive.current = false; employeeRequest.current?.abort(); }; }, []);
  const composed = { ...values, salaryPaise: Math.round(Number(values.salary || 0) * 100) };
  const content = customContent ? values.content : defaultLetterContent(composed);
  const payload = { ...values, content, ...(record ? { id: record._id, version: record.version } : {}) };
  function change(key, value) { setValues((current) => ({ ...current, [key]: value })); }
  function cancel() { if (!dirty || window.confirm("Discard the unsaved letter content?")) onCancel(); }
  async function selectEmployee(id) {
    employeeRequest.current?.abort(); const controller = new AbortController(); employeeRequest.current = controller; setSelecting(true);
    try {
      const result = await api(`${apiBase}/letters/employees/${id}`, { signal: controller.signal });
      if (!controller.signal.aborted) setValues((current) => ({ ...current, staffId: id, employee: result.employee, joiningDate: result.defaults.joiningDate, salary: String(result.defaults.salary), salaryPeriod: result.defaults.salaryPeriod }));
    } catch (failure) { if (!controller.signal.aborted) onError(failure); }
    finally { if (alive.current && !controller.signal.aborted) setSelecting(false); }
  }
  return <div className="letter-compose"><form className="letter-editor letter-card" aria-label={`${record ? "Edit" : "Generate"} ${letterTypes[type]}`} onSubmit={(event) => { event.preventDefault(); onSave(payload); }}>
    <div className="letter-card-heading"><div><span className="letter-eyebrow">{record ? record.letterNumber : "NEW DOCUMENT"}</span><h2>{record ? "Edit letter" : "Create a letter"}</h2></div><button type="button" onClick={cancel} disabled={busy || selecting}>Back to history</button></div>
    <fieldset disabled={busy || selecting}>
      <h3><span>01</span> Employee details</h3>
      {!record && !values.employee && <EmployeePicker apiBase={apiBase} onSelect={selectEmployee} onError={onError} disabled={busy || selecting} />}
      {selecting && <p role="status">Fetching employee details…</p>}
      {errors.staffId && <p className="letter-error" role="alert">{errors.staffId}</p>}
      {values.employee && <><div className="letter-selected-employee"><span className="letter-avatar">{values.employee.name.slice(0, 1)}</span><div><strong>{values.employee.name}</strong><p>{values.employee.employeeId}</p></div>{!record && <button type="button" onClick={() => change("employee", null)}>Change employee</button>}</div><div className="letter-form-grid"><Field label="Designation"><input value={values.employee.designation} readOnly /></Field><Field label="Department"><input value={values.employee.department} readOnly /></Field></div><p className="letter-hint">{record ? "Employee details are preserved from the issued letter." : "Details are fetched from Staff Management."}</p></>}
      <h3><span>02</span> Employment information</h3><div className="letter-form-grid">
        <Field label="Issue date" error={errors.issueDate}><input required name="issueDate" type="date" min="2000-01-01" max="2100-12-31" value={values.issueDate} onChange={(event) => change("issueDate", event.target.value)} /></Field>
        <Field label="Date of joining" error={errors.joiningDate}><input required name="joiningDate" type="date" min="2000-01-01" max="2100-12-31" value={values.joiningDate} onChange={(event) => change("joiningDate", event.target.value)} /></Field>
        {type === "joining" ? <><Field label="Gross salary · INR" error={errors.salary}><input required name="salary" type="number" min="0" max="99999999.99" step="0.01" value={values.salary} onChange={(event) => change("salary", event.target.value)} /></Field><Field label="Salary period" error={errors.salaryPeriod}><select name="salaryPeriod" value={values.salaryPeriod} onChange={(event) => change("salaryPeriod", event.target.value)}><option value="month">Per month</option><option value="year">Per year</option></select></Field></> : <><Field label="Last working date" error={errors.lastWorkingDate}><input required name="lastWorkingDate" type="date" min={values.joiningDate || "2000-01-01"} max={values.issueDate || "2100-12-31"} value={values.lastWorkingDate} onChange={(event) => change("lastWorkingDate", event.target.value)} /></Field><Field label="Employment duration (inclusive)"><input readOnly value={employmentDuration(values.joiningDate, values.lastWorkingDate)} placeholder="Calculated from employment dates" /></Field></>}
      </div>
      <h3><span>03</span> Company & signatory</h3><div className="letter-form-grid">{[["name", "Company name", true, 200], ["address", "Company address", true, 600], ["phone", "Company phone", false, 200], ["website", "Website", false, 200], ["signatory", "Signatory name", true, 200], ["signatoryTitle", "Signatory designation", false, 200]].map(([key, label, required, maxLength]) => <Field key={key} label={label} error={errors[`company.${key}`]} wide={key === "address"}>{key === "address" ? <textarea name={`company.${key}`} rows={3} required maxLength={maxLength} value={values.company[key]} onChange={(event) => change("company", { ...values.company, [key]: event.target.value })} /> : <input name={`company.${key}`} required={required} maxLength={maxLength} value={values.company[key]} onChange={(event) => change("company", { ...values.company, [key]: event.target.value })} />}</Field>)}</div>
      {canSaveCompany && <button type="button" className="letter-text-button" onClick={() => onSaveCompany(values.company)}>Save company details for future letters</button>}
      <h3><span>04</span> Letter content</h3><p className="letter-hint">Review and edit the wording before generation. Employment details also appear in the letter summary.</p>
      <Field label="Letter body" error={errors.content}><textarea name="content" rows={10} maxLength={16000} value={content} onChange={(event) => { setCustomContent(true); change("content", event.target.value); }} /></Field>
      {customContent && <p className="letter-hint">Custom wording is preserved when employment details change. Review dates, role and salary in the body before saving.</p>}
      {customContent && <button type="button" className="letter-text-button" onClick={() => { if (window.confirm("Replace the letter body with the standard wording using the current details?")) { setCustomContent(false); change("content", ""); } }}>Restore standard wording</button>}
      {type === "joining" ? <Field label="Custom terms and conditions" error={errors.terms}><textarea name="terms" rows={5} maxLength={6000} value={values.terms} onChange={(event) => change("terms", event.target.value)} placeholder="Working hours, probation, notice period and other agreed terms" /></Field> : <><Field label="Job responsibilities" error={errors.responsibilities}><textarea required name="responsibilities" rows={5} maxLength={6000} value={values.responsibilities} onChange={(event) => change("responsibilities", event.target.value)} /></Field><Field label="Performance and conduct" error={errors.performance}><textarea required name="performance" rows={4} maxLength={4000} value={values.performance} onChange={(event) => change("performance", event.target.value)} /></Field></>}
      <div className="letter-editor-actions"><button type="submit" className="letter-primary" disabled={!values.employee}>{busy ? "Preparing document…" : record ? "Save changes & regenerate PDF" : "Generate & save letter"}</button>{canExport && <button type="button" disabled={!values.employee} onClick={() => onPreview(payload)}>Preview PDF</button>}</div>
      <p className="letter-hint">{record ? "Saving updates the document and PDF under the same reference number." : "The final reference number is assigned when the letter is saved."}</p>
    </fieldset>
  </form><aside className="letter-live-preview"><div className="letter-preview-label"><span>LIVE PREVIEW</span><small>A4 · Company letterhead</small></div><LetterDocument letter={{ ...composed, content }} draft /></aside></div>;
}
