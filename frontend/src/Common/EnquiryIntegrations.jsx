import { useState } from "react";
import { api } from "./api";

export default function EnquiryIntegrations({ apiBase, onUnauthorized, onRefresh }) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function load() { try { setData(await api(`${apiBase}/enquiry-integrations`)); } catch (failure) { setError(failure.message); if (failure.status === 401) onUnauthorized(); } }
  async function action(connect) {
    if (busy) return; setBusy(true); setError("");
    try { const result = await api(connect ? "/admin/enquiry-integrations/gmail/connect" : `${apiBase}/enquiry-integrations/gmail/sync`, { method: "POST", body: "{}" }); if (connect) { const url = new URL(result.url); if (url.origin !== "https://accounts.google.com") throw new Error("The Gmail connection URL is invalid."); window.location.assign(url.href); } else { await load(); onRefresh(); } }
    catch (failure) { setError(failure.message); if (failure.status === 401) onUnauthorized(); }
    finally { setBusy(false); }
  }
  return <details className="enquiry-integrations" onToggle={(event) => { if (event.currentTarget.open && !data) void load(); }}><summary>Inbox connections</summary>{error && <p className="admin-error" role="alert">{error}</p>}{!data ? <p>Loading inbox connections…</p> : <div><article><strong>WhatsApp Business</strong><p>{data.whatsapp.configured ? "Signed incoming webhook configured" : "Business Cloud API webhook configuration required"}</p>{data.whatsapp.retrying > 0 && <p>{data.whatsapp.retrying} messages queued for retry</p>}</article><article><strong>Gmail</strong><p>{data.gmail.connected ? data.gmail.email : data.gmail.configured ? "Connect the configured business Gmail inbox" : "Gmail OAuth configuration required"}</p>{data.gmail.lastSuccessAt && <small>Last sync: {new Date(data.gmail.lastSuccessAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</small>}{data.gmail.lastError && <p role="status">{data.gmail.lastError}</p>}<div>{data.canConnectGmail && <button className="dashboard-button" disabled={busy || !data.gmail.configured} onClick={() => void action(true)}>{data.gmail.connected ? "Reconnect Gmail" : "Connect Gmail"}</button>}<button className="dashboard-button" disabled={busy || !data.gmail.connected} onClick={() => void action(false)}>{busy ? "Working…" : "Sync inbox now"}</button></div></article></div>}</details>;
}
