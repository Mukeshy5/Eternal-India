import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import "./ActivityHistory.css";

const resourceOptions = [
  ["", "All activity"],
  ["enquiries", "Enquiries"],
  ["journeys", "Journeys"],
  ["invoices", "Invoices"],
  ["staff records", "Staff records"],
  ["staff accounts", "Staff accounts"],
  ["staff attendance", "Attendance"],
  ["festival settings", "Festival settings"],
  ["data control", "Data Control"],
  ["workspace", "Workspace settings"],
];
const dateTime = (value) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));

export default function ActivityHistory({ apiBase = "/admin", staff = null, onUnauthorized }) {
  const [search, setSearch] = useState(""), [query, setQuery] = useState(""), [resource, setResource] = useState(""), [page, setPage] = useState(1);
  const [data, setData] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(true), [deleting, setDeleting] = useState(false), [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  const canDelete = (item) => !staff || item.actor?.type === "staff" && item.actor.id === staff.id;
  const reportFailure = (failure) => {
    setError(failure.message || "The activity could not be deleted. Please retry.");
    if (failure.status === 401) onUnauthorized?.(failure.message);
  };
  const remove = async (item) => {
    if (deleting || !canDelete(item) || !window.confirm(`Permanently delete “${item.action} ${item.label || item.resource}”? This cannot be undone.`)) return;
    setDeleting(true); setError(""); setNotice("");
    try {
      await api(`${apiBase}/activity/${encodeURIComponent(item._id)}`, { method: "DELETE" });
      setNotice("Activity record permanently deleted.");
      if (page > 1 && data?.activities.length === 1) setPage((value) => Math.max(1, value - 1));
      else reload();
    } catch (failure) { reportFailure(failure); }
    finally { setDeleting(false); }
  };
  const removeMatching = async () => {
    if (deleting) return;
    const scope = query || resource ? "all activity records matching the current search and category filters" : "all activity records";
    const ownerNote = staff ? " Only your own records will be removed; other Staff and shared records will remain." : "";
    if (!window.confirm(`Permanently delete ${scope}? This cannot be undone.${ownerNote}`)) return;
    setDeleting(true); setError(""); setNotice("");
    try {
      const params = new URLSearchParams({ search: query, resource });
      const result = await api(`${apiBase}/activity?${params}`, { method: "DELETE" });
      setNotice(result.deletedCount ? `${result.deletedCount} activity record${result.deletedCount === 1 ? "" : "s"} permanently deleted.` : "No matching activity records were deleted.");
      setPage(1); reload();
    } catch (failure) { reportFailure(failure); }
    finally { setDeleting(false); }
  };
  useEffect(() => {
    const update = () => reload(), visible = () => { if (!document.hidden) reload(); };
    window.addEventListener("panel:data-changed", update);
    window.addEventListener("focus", visible);
    return () => { window.removeEventListener("panel:data-changed", update); window.removeEventListener("focus", visible); };
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ search: query, resource, page: String(page) });
    setLoading(true);
    api(`${apiBase}/activity?${params}`, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) { setData(result); setError(""); }
    }).catch((failure) => {
      if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized?.(failure.message); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiBase, onUnauthorized, page, query, resource, refresh]);
  return <section className="activity-history" aria-busy={loading}>
    <header className="activity-history-heading"><div><span>WORKSPACE AUDIT</span><h1>Activity History</h1><p>{staff ? "Shared enquiry, journey and invoice changes across all panels, plus your account activity." : "Recorded changes and actions across authorized panels."}</p></div><div className="activity-history-heading-actions">{data?.total > 0 && <button type="button" className="activity-history-danger" onClick={removeMatching} disabled={loading || deleting}>{staff ? "Delete my matching activity" : "Delete all matching"}</button>}<button type="button" onClick={reload} disabled={loading || deleting}>Refresh</button></div></header>
    <section className="activity-history-card">
      <form className="activity-history-filters" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(1); }}>
        <label>Search activity<input type="search" maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, ID, action or reference" /></label>
        <label>Activity category<select value={resource} onChange={(event) => { setResource(event.target.value); setPage(1); }}>{resourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="submit">Search</button><button type="button" onClick={() => { setSearch(""); setQuery(""); setResource(""); setPage(1); }}>Clear</button>
      </form>
      {error && <p className="activity-history-error" role="alert">{error}</p>}
      {notice && <p className="activity-history-success" role="status">{notice}</p>}
      {loading && !data && <p role="status">Loading activity history…</p>}
      {data?.activities.map((item) => <article className="activity-history-item" key={item._id}>
        <header><div><strong>{item.actor?.name || item.actor?.employeeId || "Workspace user"}</strong><span>{item.action} {item.label || item.resource}</span></div><div className="activity-history-item-actions"><time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time>{canDelete(item) && <button type="button" className="activity-history-danger" onClick={() => void remove(item)} disabled={deleting} aria-label={`Delete activity: ${item.action} ${item.label || item.resource}`}>Delete</button>}</div></header>
        <p>{item.panel} panel{item.actor?.employeeId ? ` · ${item.actor.employeeId}` : ""}{item.resourceId ? ` · Reference ${item.resourceId}` : ""}</p>
        {(item.previous || item.updated) && <details><summary>View recorded changes</summary><div className="activity-history-data">
          {item.previous && <section><strong>Previous data</strong><pre>{JSON.stringify(item.previous, null, 2)}</pre></section>}
          {item.updated && <section><strong>Updated data</strong><pre>{JSON.stringify(item.updated, null, 2)}</pre></section>}
        </div></details>}
      </article>)}
      {!loading && !data?.total && !error && <p className="activity-history-empty">No activity matches your filters.</p>}
      <footer className="activity-history-pagination"><span>{data?.total ?? "—"} activities · Page {data?.page || page} of {data?.pages || 1}</span><div><button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" disabled={loading || page >= (data?.pages || 1)} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer>
    </section>
  </section>;
}
