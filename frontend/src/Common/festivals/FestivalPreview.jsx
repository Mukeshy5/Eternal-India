import { lazy, Suspense, useState } from "react";
import { animationDefaults, effectsCompatibility } from "../../../../shared/decorationCatalog.js";
import { api } from "../api";
import { AnimationFields, EffectPicker, FestivalField } from "./FestivalFields";

const DecorationRenderer = lazy(() => import("./DecorationRenderer"));
export default function FestivalPreview({ data, initial, can, busy, perform, onCancel }) {
  const [form, setForm] = useState(() => ({ ...animationDefaults, selectedEffects: ["bubbles"], name: "Festival preview", category: "General Animations", description: "", priority: 0, enabled: true, bannerImage: "", ...initial }));
  const [device, setDevice] = useState("desktop");
  const [running, setRunning] = useState(true);
  const [savedId, setSavedId] = useState(initial?._id || "");
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const compatible = effectsCompatibility(form.selectedEffects);
  const canSave = can(savedId ? "editFestival" : "createFestival");
  async function publish(event) {
    event.preventDefault();
    if (compatible || !event.currentTarget.reportValidity()) return;
    await perform(async (signal) => {
      const result = await api(`/technical/festivals${savedId ? `/${savedId}` : ""}`, { method: savedId ? "PUT" : "POST", body: JSON.stringify(form), signal });
      const id = result.festival._id; if (!signal.aborted) setSavedId(id);
      await api(`/technical/festival-decorations/${id}/publish`, { method: "PATCH", body: JSON.stringify({ published: true }), signal });
      await api(`/technical/festival-decorations/${id}/activate`, { method: "POST", body: "{}", signal });
      return result;
    }, {}, "Decoration saved, published and manually activated on the public website.");
  }
  return <div className="festival-preview-layout">
    <form className="admin-tool-card festival-form festival-preview-controls" onSubmit={publish}><h2>Private live preview</h2><p className="festival-help">Preview changes stay in this workspace. Publish & activate explicitly saves the design and applies it to the public website.</p><fieldset disabled={busy}>
      <FestivalField label="Load a saved festival"><select name="previewFestival" value={savedId} onChange={(event) => { const festival = data.festivals.find((item) => item._id === event.target.value); setSavedId(festival?._id || ""); if (festival) setForm(festival); }}><option value="">Unsaved preview</option>{data.festivals.map((festival) => <option key={festival._id} value={festival._id}>{festival.name}</option>)}</select></FestivalField>
      <FestivalField label="Festival / preview name"><input name="previewName" maxLength={120} required value={form.name} onChange={(event) => change("name", event.target.value)} /></FestivalField>
      <EffectPicker effects={data.effects} selected={form.selectedEffects} onChange={(value) => change("selectedEffects", value)} />
      <AnimationFields form={form} change={change} includeMusic={false} />
      <div className="admin-tool-actions"><button type="button" className="dashboard-button" onClick={() => setRunning(!running)}>{running ? "Stop preview" : "Start preview"}</button><button type="submit" className="dashboard-button dashboard-button-primary" disabled={busy || !!compatible || !canSave || !can("publish") || !can("activate")}>Publish & activate</button><button type="button" className="dashboard-button" onClick={() => { setRunning(false); onCancel(); }}>Cancel</button></div>
      {(!canSave || !can("publish") || !can("activate")) && <p className="festival-help">Publishing from preview requires create/edit, publish and activation permissions.</p>}
    </fieldset></form>
    <section className="festival-live-preview"><div className="festival-preview-toolbar"><span className="festival-kicker">{running ? "LIVE · PRIVATE PREVIEW" : "PREVIEW STOPPED"}</span><div aria-label="Preview device">{["desktop", "tablet", "mobile"].map((value) => <button key={value} type="button" aria-pressed={device === value} onClick={() => setDevice(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div><div className={`festival-device-frame festival-device-${device}`} style={{ backgroundColor: form.backgroundColor }}>
      <div className="festival-preview-browser"><span /><span /><span /><small>Eternal India · preview</small></div><div className="festival-preview-website"><img src="/logo.webp" alt="Eternal India" width="150" /><span className="festival-kicker">THOUGHTFULLY PLANNED. PERSONALLY YOURS.</span><h3>Your next<br /><em>beautiful journey.</em></h3><p>Discover how your celebration looks around the website. Preview settings do not change any public page.</p><span className="festival-preview-faux-button">Explore your journey</span></div>
      {running && !compatible && <Suspense fallback={<span className="festival-preview-loading" role="status">Loading effect…</span>}><DecorationRenderer preview previewDevice={device} decoration={form} mobileOptimization /></Suspense>}
    </div></section>
  </div>;
}
