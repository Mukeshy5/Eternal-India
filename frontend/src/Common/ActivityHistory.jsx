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
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
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
    <header className="activity-history-heading"><div><span>WORKSPACE AUDIT</span><h1>Activity History</h1><p>{staff?.canViewActivity ? "Staff activity across the workspace, including recorded changes." : staff ? "Activity associated with your Staff account." : "Recorded changes and actions across authorized panels."}</p></div><button type="button" onClick={reload} disabled={loading}>Refresh</button></header>
    <section className="activity-history-card">
      <form className="activity-history-filters" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(1); }}>
        <label>Search activity<input type="search" maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, ID, action or reference" /></label>
        <label>Activity category<select value={resource} onChange={(event) => { setResource(event.target.value); setPage(1); }}>{resourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="submit">Search</button><button type="button" onClick={() => { setSearch(""); setQuery(""); setResource(""); setPage(1); }}>Clear</button>
      </form>
      {error && <p className="activity-history-error" role="alert">{error}</p>}
      {loading && !data && <p role="status">Loading activity history…</p>}
      {data?.activities.map((item) => <article className="activity-history-item" key={item._id}>
        <header><div><strong>{item.actor?.name || item.actor?.employeeId || "Workspace user"}</strong><span>{item.action} {item.label || item.resource}</span></div><time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time></header>
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
