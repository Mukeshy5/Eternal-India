import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { promotionTargets, journeyContent } from "../../../shared/travelCatalog.js";
import { destinations, regions, tourPackages, indiaJourneys } from "./travelCatalog";
import { api } from "./api";
import { PromotionDisplay } from "./Promotions";
import { formatAmount } from "./promotionFormatting";
import "./AdminTools.css";
import "./PromotionManager.css";

const images = Object.fromEntries([...destinations, ...regions, ...tourPackages, ...indiaJourneys].map((item) => [item.promotionId, item.image]));
for (const journey of journeyContent) images[`journey:${journey.slug}`] = journey.image;
const blank = { amount: "", offerAmount: "", offerTitle: "", offerImage: "", offerType: "image", offerText: "", offerEnabled: false };
const categories = [...new Set(promotionTargets.map((item) => item.category))];
const editable = (saved) => ({ ...blank, ...saved, amount: saved?.amount ?? "", offerAmount: saved?.offerAmount ?? "" });
const payload = (form) => ({ amount: form.amount === "" ? null : Number(form.amount), offerAmount: form.offerAmount === "" ? null : Number(form.offerAmount), offerEnabled: form.offerEnabled, offerTitle: form.offerTitle.trim(), offerImage: form.offerImage, offerType: form.offerType, offerText: form.offerText.trim() });

export default function PromotionManager({ apiBase = "/technical", onBack, onUnauthorized }) {
  const [promotions, setPromotions] = useState({});
  const [selectedId, setSelectedId] = useState(promotionTargets[0].id);
  const [form, setForm] = useState(blank);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const uploadInput = useRef(null);
  const target = promotionTargets.find((item) => item.id === selectedId);
  const dirty = JSON.stringify(payload(form)) !== JSON.stringify(payload(editable(promotions[selectedId])));
  const locked = !loaded || loading || busy || uploading;
  const visible = promotionTargets.filter((item) => (!category || item.category === category) && item.title.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    const controller = new AbortController();
    api(`${apiBase}/promotions`, { signal: controller.signal }).then(({ promotions: result }) => {
      if (controller.signal.aborted) return;
      const saved = Object.fromEntries(result.map((item) => [item.targetId, item]));
      setPromotions(saved); setForm(editable(saved[promotionTargets[0].id])); setSelectedId(promotionTargets[0].id); setLoaded(true);
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setError(failure.message);
      if (failure.status === 401) onUnauthorized();
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiBase, reload, onUnauthorized]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value })); setError(""); setNotice("");
  }
  function leave(action) {
    if (!busy && !uploading && (!dirty || window.confirm("Discard the unsaved amount and offer changes?"))) action();
  }
  function failure(error) {
    setError(Object.values(error.errors || {}).join(" ") || error.message);
    if (error.status === 401) onUnauthorized();
  }
  async function save(event) {
    event.preventDefault();
    if (locked || !event.currentTarget.reportValidity()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { promotion } = await api(`${apiBase}/promotions/${encodeURIComponent(selectedId)}`, { method: "PATCH", body: JSON.stringify(payload(form)) });
      setPromotions((current) => ({ ...current, [selectedId]: promotion }));
      setForm(editable(promotion));
      setNotice(`${target.title}: amount and offer saved. The website will show these details.`);
    } catch (error) { failure(error); }
    finally { setBusy(false); }
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file || locked) return;
    setError(""); setNotice("");
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError("Choose a JPG, PNG, WebP or GIF image up to 2 MB."); event.target.value = ""; return;
    }
    setUploading(true);
    try {
      const body = new FormData(); body.append("image", file);
      const result = await api(`${apiBase}/offer-images`, { method: "POST", body });
      change("offerImage", result.image);
      setNotice("Image uploaded. Save changes to show it on the website.");
    } catch (error) { failure(error); }
    finally { setUploading(false); if (uploadInput.current) uploadInput.current.value = ""; }
  }
  async function reset() {
    if (locked || !window.confirm(`Remove the saved amount and offer from ${target.title}?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`${apiBase}/promotions/${encodeURIComponent(selectedId)}`, { method: "DELETE" });
      setPromotions((current) => { const next = { ...current }; delete next[selectedId]; return next; });
      setForm(blank); setNotice(`Amount and offer removed from ${target.title}.`);
    } catch (error) { failure(error); }
    finally { setBusy(false); }
  }

  return <div className="admin-tools promotion-manager">
    <header className="admin-tools-heading"><div><span className="dashboard-section-label">TECHNICAL WORKSPACE / WEBSITE</span><h1>Tour amounts & offers</h1><p>Manage package prices and offers on every tour card and place image.</p></div><button type="button" className="dashboard-button" disabled={busy || uploading} onClick={() => leave(onBack)}>← Back to enquiries</button></header>
    {error && <p className="admin-error admin-tool-error" role="alert">{error}</p>}
    {notice && <p className="admin-success promotion-notice" role="status">{notice}</p>}
    {loading ? <p role="status" className="admin-tool-card">Loading saved tour amounts and offers…</p> : <div className="promotion-workspace">
      <section className="admin-tool-card promotion-catalog" aria-label="Tours and places">
        <h2>All tours & places <span>{promotionTargets.length}</span></h2>
        <label className="admin-tool-field"><span>Search tours and places</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a tour or place…" /></label>
        <label className="admin-tool-field"><span>Collection</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All collections</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
        <p className="promotion-result-count">{visible.length} entries · {Object.keys(promotions).length} configured · Manage amounts and offers for every tour, place and homepage card</p>
        <div className="promotion-targets">{visible.map((item) => <button key={item.id} type="button" className="promotion-target" aria-pressed={selectedId === item.id} disabled={locked} onClick={() => leave(() => { setSelectedId(item.id); setForm(editable(promotions[item.id])); setError(""); setNotice(""); })}>
          <img src={images[item.id]} alt="" width="62" height="54" loading="lazy" /><span><small>{item.category}</small><strong>{item.title}</strong><small>{promotions[item.id]?.amount != null ? formatAmount(promotions[item.id].amount) : "No amount set"}{promotions[item.id]?.offerEnabled ? " · Offer active" : ""}</small></span>
        </button>)}</div>
        {!visible.length && <p className="admin-tool-empty">No matching tours or places.</p>}
        {error && <button type="button" className="dashboard-button" disabled={busy || uploading} onClick={() => leave(() => { setLoading(true); setLoaded(false); setError(""); setReload((value) => value + 1); })}>Reload saved details</button>}
      </section>
      <section className="admin-tool-card promotion-editor" aria-labelledby="promotion-editor-heading">
        <div className="promotion-editor-heading"><div><span className="dashboard-section-label">{target.category}</span><h2 id="promotion-editor-heading">{target.title}</h2></div><Link to={target.path} target="_blank" rel="noopener noreferrer">View on website ↗</Link></div>
        <div className="promotion-preview" aria-label="Card preview"><img className="promotion-preview-photo" src={images[selectedId]} alt={target.title} /><PromotionDisplay promotion={payload(form)} overlay placement="bottom" /><span className="promotion-preview-caption">{target.title} · Preview</span></div>
        <form className="promotion-form" onSubmit={save}>
          <fieldset disabled={locked}>
            <label className="admin-tool-field"><span>Package amount (INR)</span><input name="amount" type="number" min="0" max="100000000" step="0.01" inputMode="decimal" placeholder="e.g. 25000" value={form.amount} onChange={(event) => change("amount", event.target.value)} /><small>Leave blank to hide the amount.</small></label>
            <label className="promotion-toggle"><input name="offerEnabled" type="checkbox" checked={form.offerEnabled} onChange={(event) => change("offerEnabled", event.target.checked)} /><span><strong>Show offer on the website</strong><small>Disable to hide the offer and keep the package amount.</small></span></label>
            <div className="admin-tool-grid">
              <label className="admin-tool-field"><span>Offer title</span><input name="offerTitle" maxLength={80} required={form.offerEnabled} value={form.offerTitle} onChange={(event) => change("offerTitle", event.target.value)} placeholder="e.g. Winter special — save 20%" /></label>
              <label className="admin-tool-field"><span>Offer amount (INR, optional)</span><input name="offerAmount" type="number" min="0" max={form.amount === "" ? "100000000" : Math.max(0, Number(form.amount) - 0.01)} step="0.01" inputMode="decimal" value={form.offerAmount} onChange={(event) => change("offerAmount", event.target.value)} placeholder="e.g. 20000" /></label>
            </div>
            <label className="admin-tool-field"><span>Offer mini format</span><select value={form.offerType} onChange={(event) => change("offerType", event.target.value)}><option value="image">Mini image</option><option value="text">Text badge</option></select></label>
            {form.offerType === "text" ? <label className="admin-tool-field"><span>Offer mini text</span><input name="offerText" maxLength={120} required={form.offerEnabled} value={form.offerText} onChange={(event) => change("offerText", event.target.value)} placeholder="e.g. SAVE 20%" /><small>This text appears in the small offer badge.</small></label> : <><label className="admin-tool-field"><span>Offer mini image</span><input ref={uploadInput} name="offerImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} /><small>JPG, PNG, WebP or GIF · up to 2 MB. Save after uploading.</small></label>{form.offerImage && <div className="promotion-image-selection"><img src={form.offerImage} alt="Selected offer mini image" width="58" height="58" /><button type="button" className="dashboard-button" onClick={() => change("offerImage", "")}>Remove mini image</button></div>}</>}
            <div className="admin-tool-actions"><button type="submit" className="dashboard-button dashboard-button-primary" disabled={locked}>{busy ? "Saving…" : uploading ? "Uploading image…" : "Save changes"}</button><button type="button" className="dashboard-button" disabled={locked || !promotions[selectedId]} onClick={reset}>Remove amount & offer</button></div>
          </fieldset>
          <p className="promotion-save-hint">{dirty ? "Unsaved changes" : "All changes saved"} · Public pages refresh offers within 30 seconds or when reopened.</p>
        </form>
      </section>
    </div>}
  </div>;
}
