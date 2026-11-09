export default function AttendancePeriodDelete({ from, to, period, scope, disabled, onDelete }) {
  const label = { daily: "day", weekly: "week", monthly: "month", custom: "date range" }[period] || "period";
  return <div className="attendance-period-delete"><div><strong>Delete attendance by period</strong><p>{from} to {to} · {scope}. Applies to every matching record across all pages.</p></div><button type="button" className="dashboard-button dashboard-button-danger" disabled={disabled || !from || !to} onClick={() => { if (window.confirm(`Permanently delete attendance from ${from} to ${to} for ${scope}? This includes every matching record across all pages.`)) onDelete(); }}>Delete this {label}</button></div>;
}
