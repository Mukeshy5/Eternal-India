import { decorationEffects, displayPositions, effectsCompatibility } from "../../../../shared/decorationCatalog.js";

export function FestivalField({ label, children, wide = false, hint }) {
  return <label className={`admin-tool-field${wide ? " admin-tool-field-wide" : ""}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function EffectPicker({ selected, onChange, effects, disabled = false }) {
  const error = effectsCompatibility(selected);
  return <fieldset className="festival-effect-picker" disabled={disabled}><legend>Decoration effects · choose up to six</legend><p>Combine one festival scene with general effects. Intensive combinations are limited for smooth scrolling.</p><div>{(effects || decorationEffects).map((entry) => { const id = entry._id || entry.id; return <label key={id} className={selected.includes(id) ? "selected" : ""}><input type="checkbox" name="selectedEffects" value={id} checked={selected.includes(id)} onChange={(event) => onChange(event.target.checked ? [...selected, id] : selected.filter((item) => item !== id))} /><span aria-hidden="true">{entry.symbol}</span>{entry.name}{entry.enabled === false && <small>Library disabled</small>}</label>; })}</div>{error && <p className="festival-inline-warning" role="status">{error}</p>}</fieldset>;
}
export function AnimationFields({ form, change, includeMusic = true }) {
  return <>
    <div className="admin-tool-grid">
      <FestivalField label="Animation intensity"><select name="intensity" value={form.intensity} onChange={(event) => change("intensity", event.target.value)}>{["low", "medium", "high"].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></FestivalField>
      <FestivalField label="Animation speed" hint="0.25 = slower · 3 = faster"><input name="animationSpeed" type="number" min="0.25" max="3" step="0.25" required value={form.animationSpeed} onChange={(event) => change("animationSpeed", Number(event.target.value))} /></FestivalField>
      <FestivalField label="Particle density" hint="Total density is shared across selected effects."><input name="particleDensity" type="number" min="1" max="120" step="1" required value={form.particleDensity} onChange={(event) => change("particleDensity", Number(event.target.value))} /></FestivalField>
      <FestivalField label="Opacity"><input name="opacity" type="number" min="0.1" max="1" step="0.1" required value={form.opacity} onChange={(event) => change("opacity", Number(event.target.value))} /></FestivalField>
      <FestivalField label="Display position"><select name="displayPosition" value={form.displayPosition} onChange={(event) => change("displayPosition", event.target.value)}>{Object.entries(displayPositions).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></FestivalField>
      <FestivalField label="Preview background color"><input name="backgroundColor" type="color" value={form.backgroundColor} onChange={(event) => change("backgroundColor", event.target.value)} /></FestivalField>
    </div>
    <label className="festival-check"><input name="greetingEnabled" type="checkbox" checked={form.greetingEnabled} onChange={(event) => change("greetingEnabled", event.target.checked)} />Show festival greeting</label>
    <div className="admin-tool-grid"><FestivalField label="Greeting message"><input name="greetingMessage" maxLength={200} value={form.greetingMessage} onChange={(event) => change("greetingMessage", event.target.value)} placeholder="Wishing you a joyful celebration" /></FestivalField><FestivalField label="Greeting text color"><input name="greetingColor" type="color" value={form.greetingColor} onChange={(event) => change("greetingColor", event.target.value)} /></FestivalField></div>
    {includeMusic && <><label className="festival-check"><input name="musicEnabled" type="checkbox" checked={form.musicEnabled} onChange={(event) => change("musicEnabled", event.target.checked)} />Offer optional festival music</label><FestivalField label="Music URL (HTTPS)" hint="Visitors must click Play. Music never starts automatically; the global music setting must also be enabled."><input name="musicUrl" type="url" maxLength={1000} required={form.musicEnabled} value={form.musicUrl} onChange={(event) => change("musicUrl", event.target.value)} placeholder="https://…" /></FestivalField></>}
  </>;
}
