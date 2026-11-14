import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { letterDate, letterTypes } from "../../../../shared/employmentLetters.js";
import { usePanelNavigationGuard } from "../panel/PanelNavigationContext";
import LetterEditor from "./LetterEditor";
import LetterDocument from "./LetterDocument";
import LetterPdfPreview from "./LetterPdfPreview";
import { downloadLetter, letterFile } from "./letterClient";
import "./letters.css";

export default function LetterWorkspace({ type, apiBase, admin, onUnauthorized }) {
  const [settings, setSettings] = useState(null), [data, setData] = useState(null), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const [settingsRefresh, setSettingsRefresh] = useState(0);
  const [search, setSearch] = useState(""), [query, setQuery] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState(""), [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null), [selected, setSelected] = useState(null), [pdf, setPdf] = useState(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [errors, setErrors] = useState({}), [notice, setNotice] = useState(""), [existingId, setExistingId] = useState("");
  const lock = useRef(false), alive = useRef(true), actionRequest = useRef(null);
  const permissions = settings?.permissions || admin.staffPermissions || [];
  const can = (permission) => permissions.includes(permission);
  usePanelNavigationGuard(false, busy);
  useEffect(() => { alive.current = true; return () => { alive.current = false; actionRequest.current?.abort(); }; }, []);
  const report = useCallback((failure) => {
    if (!alive.current) return;
    setError(failure.message); setErrors(failure.errors || {}); setExistingId(failure.details?.existingId || "");
    if (failure.status === 401) onUnauthorized();
  }, [onUnauthorized]);
  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    api(`${apiBase}/letters/settings`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setSettings(result); }).catch((failure) => { if (!controller.signal.aborted) report(failure); });
    return () => controller.abort();
  }, [apiBase, report, settingsRefresh]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    const params = new URLSearchParams({ type, search: query, page: String(page), ...(from ? { from } : {}), ...(to ? { to } : {}) });
    api(`${apiBase}/letters?${params}`, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setData(result); if (page > result.pages) setPage(result.pages);
    }).catch((failure) => { if (!controller.signal.aborted) { setData(null); report(failure); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiBase, type, query, from, to, page, refresh, report]);
  useEffect(() => {
    const sync = () => { if (!document.hidden) setRefresh((value) => value + 1); };
    const timer = window.setInterval(sync, 15000); window.addEventListener("focus", sync);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", sync); };
  }, []);
  const selectedId = selected?._id;
  useEffect(() => {
    if (!selectedId || editor) return;
    const controller = new AbortController();
    api(`${apiBase}/letters/${selectedId}`, { signal: controller.signal }).then(({ letter }) => { if (!controller.signal.aborted) setSelected(letter); }).catch((failure) => { if (!controller.signal.aborted) { report(failure); if (failure.status === 404) setSelected(null); } });
    return () => controller.abort();
  }, [apiBase, selectedId, editor, refresh, report]);
  async function perform(action) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setErrors({}); setExistingId(""); setNotice("");
    const controller = new AbortController(); actionRequest.current = controller;
    try { await action(controller.signal); } catch (failure) { if (!controller.signal.aborted) report(failure); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function open(id, edit = false) {
    void perform(async (signal) => {
      const { letter } = await api(`${apiBase}/letters/${id}`, { signal });
      if (signal.aborted) return;
      setSelected(edit ? null : letter); setEditor(edit ? { record: letter, key: `${letter._id}:${letter.version}` } : null);
    });
  }
  function save(payload) {
    void perform(async (signal) => {
      const record = editor.record;
      const { letter } = await api(`${apiBase}/letters${record ? `/${record._id}` : ""}`, { method: record ? "PATCH" : "POST", body: JSON.stringify(payload), signal });
      if (signal.aborted) return;
      setEditor(null); setSelected(letter); setRefresh((value) => value + 1); setNotice(`${letterTypes[type]} ${letter.letterNumber} ${record ? "updated" : "generated and saved"} successfully.`);
    });
  }
  function pdfAction(record, download = false) {
    void perform(async (signal) => {
      const blob = await letterFile(`${apiBase}/letters/${record._id}/pdf${download ? "?download=true" : ""}`, { signal });
      if (signal.aborted) return;
      if (download) downloadLetter(blob, record.letterNumber); else setPdf({ blob, number: record.letterNumber });
    });
  }
  function remove(record) {
    if (!window.confirm(`Permanently delete ${record.letterNumber} for ${record.employee.name} and its saved PDF? This cannot be undone.`)) return;
    void perform(async (signal) => {
      await api(`${apiBase}/letters/${record._id}`, { method: "DELETE", body: JSON.stringify({ version: record.version }), signal });
      if (signal.aborted) return;
      if (selected?._id === record._id) setSelected(null);
      setRefresh((value) => value + 1); setNotice("Letter and PDF permanently deleted.");
    });
  }
  const closePdf = useCallback(() => setPdf(null), []);
  return <section className="letter-workspace" aria-label={`${letterTypes[type]} management`}>
    <header className="letter-hero"><div><span className="letter-eyebrow">PEOPLE & DOCUMENTS</span><h1>{letterTypes[type]}s</h1><p>{type === "joining" ? "Welcome every new chapter with a professionally crafted appointment letter." : "Recognise your team's contribution with a clear record of their service."}</p></div><div className="letter-hero-actions">{can("create") && !editor && <button type="button" className="letter-primary" disabled={busy || !settings} onClick={() => { setEditor({ record: null, key: crypto.randomUUID() }); setSelected(null); setNotice(""); setError(""); setErrors({}); }}>+ Create {letterTypes[type].toLowerCase()}</button>}<button type="button" disabled={busy || loading} onClick={() => { setError(""); setRefresh((value) => value + 1); setSettingsRefresh((value) => value + 1); }}>Refresh</button></div></header>
    {error && <div className="letter-error" role="alert"><p>{error}</p>{existingId && <button type="button" disabled={busy} onClick={() => { if (!editor || window.confirm("Open the existing letter and discard this draft?")) open(existingId, can("edit")); }}>Open existing letter</button>}</div>}
    {notice && <p className="letter-success" role="status">{notice}</p>}
    {editor ? <LetterEditor key={editor.key} type={type} record={editor.record} company={settings.company} apiBase={apiBase} busy={busy} errors={errors} canExport={can("export")} canSaveCompany={can("edit")} onError={report} onSave={save} onCancel={() => setEditor(null)} onPreview={(payload) => { void perform(async (signal) => { const blob = await letterFile(`${apiBase}/letters/preview`, { method: "POST", body: JSON.stringify(payload), signal }); if (!signal.aborted) setPdf({ blob, number: "Draft preview", draft: true }); }); }} onSaveCompany={(company) => { void perform(async (signal) => { const result = await api(`${apiBase}/letters/settings`, { method: "PUT", body: JSON.stringify({ company, version: settings.version }), signal }); if (!signal.aborted) { setSettings((current) => ({ ...current, ...result })); setNotice("Company details saved for future letters in both panels."); } }); }} /> : selected ? <div className="letter-detail"><div className="letter-card letter-detail-toolbar"><div><strong>{selected.letterNumber}</strong><p>Version {selected.version} · Updated {new Date(selected.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p></div><div className="letter-actions"><button disabled={busy} onClick={() => setSelected(null)}>Back to history</button>{can("edit") && <button disabled={busy} onClick={() => open(selected._id, true)}>Edit letter</button>}{can("export") && <><button disabled={busy} onClick={() => pdfAction(selected)}>Preview PDF & print</button><button disabled={busy} className="letter-primary" onClick={() => pdfAction(selected, true)}>Download PDF</button></>}{can("delete") && <button disabled={busy} className="letter-danger" onClick={() => remove(selected)}>Delete</button>}</div></div><LetterDocument letter={selected} /></div> : <div className="letter-card letter-history"><div className="letter-history-heading"><div><h2>Letter history</h2><p>{data ? `${data.total} saved ${data.total === 1 ? "document" : "documents"}` : "Saved documents"} · Shared across both panels</p></div><span className="letter-history-badge">{type === "joining" ? "JOINING" : "EXPERIENCE"}</span></div>
      <div className="letter-filters"><label><span>Search letters</span><input type="search" name="letterSearch" maxLength={100} placeholder="Employee, ID, department or reference" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label><span>Issue date from</span><input type="date" name="letterFrom" value={from} max={to || "2100-12-31"} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label><label><span>Issue date to</span><input type="date" name="letterTo" value={to} min={from || "2000-01-01"} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>{(search || from || to) && <button type="button" onClick={() => { setSearch(""); setFrom(""); setTo(""); setPage(1); }}>Clear filters</button>}</div>
      {loading && <p role="status" className="letter-loading">Loading letter history…</p>}{!loading && data?.letters.length === 0 && <div className="letter-empty"><span aria-hidden="true">↗</span><h3>{query || from || to ? "No matching letters" : "Your letter archive starts here"}</h3><p>{query || from || to ? "Adjust your search or issue dates to find a letter." : `Create a ${letterTypes[type].toLowerCase()} from an existing employee record. Saved letters will appear here.`}</p></div>}
      {data?.letters.length > 0 && <div className="letter-table-wrap" aria-busy={loading}><table className="letter-table"><thead><tr><th>Employee</th><th>Reference & issue date</th><th>Employment</th><th>Actions</th></tr></thead><tbody>{data.letters.map((record) => <tr key={record._id}><td><strong>{record.employee.name}</strong><small>{record.employee.employeeId}</small><small>{record.employee.designation} · {record.employee.department}</small></td><td><strong>{record.letterNumber}</strong><small>{letterDate(record.issueDate)}</small></td><td><span>Joined {letterDate(record.joiningDate)}</span>{type === "experience" && <small>Until {letterDate(record.lastWorkingDate)}<br />{record.employmentDuration}</small>}</td><td><div className="letter-row-actions"><button disabled={busy} onClick={() => open(record._id)}>View</button>{can("edit") && <button disabled={busy} onClick={() => open(record._id, true)}>Edit</button>}{can("export") && <><button disabled={busy} onClick={() => pdfAction(record)}>Print / preview</button><button disabled={busy} onClick={() => pdfAction(record, true)}>PDF</button></>}{can("delete") && <button disabled={busy} className="letter-danger" onClick={() => remove(record)}>Delete</button>}</div></td></tr>)}</tbody></table></div>}
      {data && data.pages > 1 && <div className="letter-pagination"><button type="button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {data.pages}</span><button type="button" disabled={loading || page >= data.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
    </div>}
    <p className="letter-footnote">Employee records and saved documents are shared between Admin and Technical panels. History refreshes automatically.</p>
    {pdf && <LetterPdfPreview {...pdf} onClose={closePdf} />}
  </section>;
}
