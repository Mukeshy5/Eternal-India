import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { usePanelNavigationGuard } from "./panel/PanelNavigationContext";
import { calculateVoucherPrice, mealPlans, voucherOffice, voucherStatuses } from "../../../shared/voucherBilling.js";
import { money, todayInIndia, vouchersChanged } from "./voucherClient";
const blankForm = () => ({ guestName: "", hotelId: "", gstId: "", officeAddressId: "", mealPlan: "", voucherDate: todayInIndia(), requirement: "", checkInDate: "", checkOutDate: "", arrivalDate: "", arrivalPlace: "", departureDate: "", departurePlace: "", basePrice: "", status: "confirmed" });
const formFrom = (v) => Object.fromEntries(Object.keys(blankForm()).map((key) => [key, key === "basePrice" ? (v.pricing.basePaise / 100).toFixed(2) : v[key] ?? ""]));
export default function VoucherEditor({ apiBase, voucher, onSaved, onCancel, onUnauthorized }) {
  const [form, setForm] = useState(() => voucher ? formFrom(voucher) : blankForm()), [options, setOptions] = useState(null), [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [errors, setErrors] = useState({}), [quoteError, setQuoteError] = useState(""), [checking, setChecking] = useState(false), [quote, setQuote] = useState(null), [retry, setRetry] = useState(0);
  const initial = useRef(JSON.stringify(form)), manualPrice = useRef(Boolean(voucher)), saveLock = useRef(false), requestId = useRef(crypto.randomUUID()), saveController = useRef(null);
  const reloadOptions = useRef(null);
  const dirty = JSON.stringify(form) !== initial.current;
  usePanelNavigationGuard(dirty, busy, "Discard unsaved voucher changes?");
  useEffect(() => () => saveController.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController(); let inFlight = false, pending = false, reservationRequest;
    setLoading(true); setError("");
    const load = async () => {
      if (inFlight) { pending = true; return; } inFlight = true;
      try {
        do {
          pending = false;
          reservationRequest ??= voucher ? Promise.resolve(null) : api(`${apiBase}/vouchers/invoice`, { method: "POST", body: JSON.stringify({ requestId: requestId.current }), signal: controller.signal }).catch((failure) => { reservationRequest = undefined; throw failure; });
          const [result, reservation] = await Promise.all([api(`${apiBase}/vouchers/options`, { signal: controller.signal }), reservationRequest]);
          if (controller.signal.aborted) return;
          setOptions(result); if (reservation) setInvoice(reservation.invoice);
          setForm((current) => current.gstId && voucher?.gstId !== current.gstId && !result.gstRates.some((item) => item._id === current.gstId && item.gstNumber) ? { ...current, gstId: "" } : current);
          setForm((current) => current.officeAddressId && voucher?.officeAddressId !== current.officeAddressId && !(result.officeAddresses || []).some((item) => item._id === current.officeAddressId) ? { ...current, officeAddressId: "" } : current);
        } while (pending && !controller.signal.aborted);
      } catch (failure) { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized?.(); } }
      finally { inFlight = false; if (!controller.signal.aborted) setLoading(false); }
    };
    reloadOptions.current = load;
    void load(); const timer = window.setInterval(load, 30000); window.addEventListener("focus", load); window.addEventListener("online", load); window.addEventListener("journey-voucher-options-changed", load);
    return () => { controller.abort(); reloadOptions.current = null; window.clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener("online", load); window.removeEventListener("journey-voucher-options-changed", load); };
  }, [apiBase, voucher, retry, onUnauthorized]);
  const hotel = options?.hotels.find((item) => item._id === form.hotelId) || (voucher?.hotelId === form.hotelId ? { _id: voucher.hotelId, ...voucher.hotel } : null);
  const gst = options?.gstRates.find((item) => item._id === form.gstId) || (voucher?.gstId === form.gstId ? { _id: voucher.gstId, ...voucher.gst } : null);
  const office = options?.officeAddresses?.find((item) => item._id === form.officeAddressId) || (voucher && (voucher.officeAddressId || "") === form.officeAddressId ? { _id: form.officeAddressId, ...voucherOffice(voucher) } : null);
  const taxRate = voucher?.pricing.gstRate ?? 0;
  useEffect(() => { if (hotel && !manualPrice.current) setForm((current) => ({ ...current, basePrice: String(hotel.amount) })); }, [hotel?.amount, hotel?._id]);
  const pricing = useMemo(() => gst ? calculateVoucherPrice(form.basePrice, taxRate) : null, [form.basePrice, gst, taxRate]);
  const quoteKey = JSON.stringify([form.hotelId, form.gstId, form.officeAddressId, form.basePrice, taxRate, gst?.version, gst?.gstNumber, office?.version]);
  useEffect(() => {
    setQuote(null); setQuoteError("");
    if (!pricing || !form.hotelId || !form.gstId || !office) { setChecking(false); return; }
    const controller = new AbortController(); setChecking(true);
    const timer = window.setTimeout(() => {
      api(`${apiBase}/vouchers/quote`, { method: "POST", body: JSON.stringify({ hotelId: form.hotelId, gstId: form.gstId, officeAddressId: form.officeAddressId, basePrice: form.basePrice, expectedGstRate: taxRate, expectedGstVersion: gst.version ?? null, expectedOfficeVersion: office.version ?? null, ...(voucher ? { voucherId: voucher._id } : {}) }), signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setQuote({ key: quoteKey, pricing: data.pricing }); }).catch((failure) => { if (!controller.signal.aborted) { setQuoteError(failure.message); if (failure.status === 401) onUnauthorized?.(); } }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [apiBase, quoteKey, retry, voucher, onUnauthorized]);
  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: "" })); }
  async function save(event) {
    event.preventDefault();
    if (saveLock.current || !event.currentTarget.reportValidity() || !quote || quote.key !== quoteKey || (!voucher && !invoice)) return;
    saveLock.current = true; setBusy(true); setError(""); setErrors({});
    const controller = new AbortController(); saveController.current = controller;
    try {
      const data = await api(`${apiBase}/vouchers${voucher ? `/${voucher._id}` : ""}`, { method: voucher ? "PATCH" : "POST", body: JSON.stringify({ ...form, expectedGstRate: taxRate, expectedGstVersion: gst.version ?? null, expectedOfficeVersion: office.version ?? null, ...(voucher ? { revision: voucher.revision } : { reservationId: invoice.reservationId }) }), signal: controller.signal });
      if (!controller.signal.aborted) { initial.current = JSON.stringify(form); vouchersChanged(); onSaved(data.voucher); }
    } catch (failure) { if (!controller.signal.aborted) { setError(failure.message); setErrors(failure.errors || {}); if (failure.status === 401) onUnauthorized?.(); } }
    finally { saveLock.current = false; if (!controller.signal.aborted) setBusy(false); }
  }
  function field(label, key, type = "text", extra = {}) {
    return <label className="billing-field"><span>{label} <i>*</i></span><input name={key} type={type} required value={form[key]} aria-invalid={Boolean(errors[key])} onChange={(event) => update(key, event.target.value)} {...extra} />{errors[key] && <small role="alert">{errors[key]}</small>}</label>;
  }
  const hotels = options?.hotels || [], gstRates = options?.gstRates || [], officeAddresses = options?.officeAddresses || [], missingGstNumbers = gstRates.some((item) => !item.gstNumber);
  return <form className="billing-editor" onSubmit={save} aria-label={voucher ? "Edit journey voucher" : "Create journey voucher"}>
    <header className="billing-editor-heading"><div><span className="billing-eyebrow">{voucher ? "EDIT SAVED VOUCHER" : "NEW JOURNEY VOUCHER"}</span><h2>{voucher ? `Invoice #${voucher.invoiceNumber}` : invoice ? `Invoice #${invoice.invoiceNumber}` : "Reserving invoice…"}</h2><p>{voucher ? "Save changes to update this original record." : "Invoice number reserved securely by the server."}</p></div>{onCancel && <button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard unsaved voucher changes?")) onCancel(); }}>Close editor</button>}</header>
    {error && <div className="billing-error" role="alert">{error} <button type="button" disabled={busy || loading} onClick={() => setRetry((value) => value + 1)}>Retry / refresh pricing</button></div>}
    {loading && <p role="status">Loading hotels, GST numbers and office addresses…</p>}
    {!loading && options && (!hotels.length || !gstRates.length || missingGstNumbers || !officeAddresses.length) && <p className="billing-info">{!hotels.length ? "Add a hotel in Hotel inventory. " : ""}{!gstRates.length ? "Add a GST number in Add GST. " : missingGstNumbers ? "Some older GST records need a valid number. Update them in Add GST. " : ""}{!officeAddresses.length ? "Add an office address in Address Add before creating a voucher." : ""}</p>}
    <fieldset disabled={busy || loading || !options}>
      <div className="billing-form-columns"><div><section className="billing-form-section"><h3><span>01</span> Guest & billing</h3><div className="billing-form-grid">
        {field("Guest name", "guestName", "text", { maxLength: 160 })}{field("Voucher date", "voucherDate", "date", { min: "1900-01-01", max: "2199-12-31" })}
        <label className="billing-field"><span>Select hotel <i>*</i></span><select name="hotelId" required value={form.hotelId} aria-invalid={Boolean(errors.hotelId)} onChange={(event) => { manualPrice.current = false; const selected = hotels.find((item) => item._id === event.target.value); setForm((current) => ({ ...current, hotelId: event.target.value, basePrice: selected ? String(selected.amount) : "" })); }}><option value="">Select saved hotel</option>{hotels.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}{voucher && !hotels.some((item) => item._id === voucher.hotelId) && <option value={voucher.hotelId}>{voucher.hotel.name} (saved snapshot)</option>}</select>{errors.hotelId && <small>{errors.hotelId}</small>}</label>
        <label className="billing-field"><span>Select GST number <i>*</i></span><select name="gstId" required value={form.gstId} aria-invalid={Boolean(errors.gstId)} onFocus={() => { void reloadOptions.current?.(); }} onChange={(event) => update("gstId", event.target.value)}><option value="">Select company GST number</option>{gstRates.map((item) => <option key={item._id} value={item._id} disabled={!item.gstNumber}>{item.gstNumber || "GST number not configured — update in Add GST"}</option>)}{voucher && !gstRates.some((item) => item._id === voucher.gstId) && <option value={voucher.gstId}>{voucher.gst.gstNumber} (saved snapshot)</option>}</select>{errors.gstId && <small>{errors.gstId}</small>}</label>
        <label className="billing-field billing-wide"><span>Select Office Address <i>*</i></span><select name="officeAddressId" required={!voucher || !!voucher.officeAddressId} value={form.officeAddressId} aria-invalid={!!errors.officeAddressId} onFocus={() => { void reloadOptions.current?.(); }} onChange={(event) => update("officeAddressId", event.target.value)}><option value="">{voucher && !voucher.officeAddressId ? "Original company address (existing voucher)" : "Select saved office address"}</option>{officeAddresses.map((item) => <option key={item._id} value={item._id}>{item.address}</option>)}{voucher?.officeAddressId && !officeAddresses.some((item) => item._id === voucher.officeAddressId) && <option value={voucher.officeAddressId}>{voucherOffice(voucher).address} (saved snapshot)</option>}</select>{errors.officeAddressId && <small>{errors.officeAddressId}</small>}</label>
        {office && <p className="billing-info billing-wide" aria-label="Selected office address">{office.address}</p>}
        <label className="billing-field billing-wide"><span>Your requirement <i>*</i></span><textarea name="requirement" required rows={6} maxLength={6000} placeholder="Describe the guest’s complete accommodation, travel and service requirements…" value={form.requirement} aria-invalid={Boolean(errors.requirement)} onChange={(event) => update("requirement", event.target.value)} />{errors.requirement && <small>{errors.requirement}</small>}</label>
      </div>{hotel && <p className="billing-info"><b>{hotel.name}</b> · {hotel.address}<br />Inventory base amount: {money(Math.round(hotel.amount * 100))}</p>}</section>
      <section className="billing-form-section"><h3><span>02</span> Stay & travel</h3><div className="billing-form-grid">
        {field("Check-in date", "checkInDate", "date", { min: "1900-01-01", max: form.checkOutDate || "2199-12-31" })}{field("Check-out date", "checkOutDate", "date", { min: form.checkInDate || "1900-01-01", max: "2199-12-31" })}
        <label className="billing-field billing-wide"><span>Meal Plan <i>*</i></span><select name="mealPlan" required={!voucher || !!voucher.mealPlan} value={form.mealPlan} aria-invalid={!!errors.mealPlan} onChange={(event) => update("mealPlan", event.target.value)}><option value="">{voucher && !voucher.mealPlan ? "Not recorded (existing voucher)" : "Select meal plan"}</option>{Object.entries(mealPlans).map(([code, label]) => <option key={code} value={code}>{code} – {label}</option>)}</select>{errors.mealPlan && <small>{errors.mealPlan}</small>}</label>
        {field("Arrival date", "arrivalDate", "date", { min: "1900-01-01", max: form.departureDate || "2199-12-31" })}{field("Arrival place", "arrivalPlace", "text", { maxLength: 300 })}
        {field("Departure date", "departureDate", "date", { min: form.arrivalDate || "1900-01-01", max: "2199-12-31" })}{field("Departure place", "departurePlace", "text", { maxLength: 300 })}
      </div></section></div>
      <aside className="billing-price-card"><span className="billing-eyebrow">LIVE PRICE</span><h3>Billing summary</h3><p>{taxRate ? "This existing voucher retains its saved GST calculation." : "Starts with the saved hotel amount. Enter the agreed final voucher amount below."}</p>
        <label className="billing-field"><span>{taxRate ? "Base price (INR)" : "Amount (INR)"} <i>*</i></span><input name="basePrice" type="number" required min="0" max="99999999.99" step="0.01" value={form.basePrice} aria-invalid={Boolean(errors.basePrice)} onChange={(event) => { manualPrice.current = true; update("basePrice", event.target.value); }} />{errors.basePrice && <small>{errors.basePrice}</small>}</label>
        <button type="button" className="billing-text-button" disabled={!hotel} onClick={() => { manualPrice.current = false; update("basePrice", String(hotel.amount)); }}>Use current hotel amount</button>
        <dl aria-live="polite"><div><dt>{taxRate ? "Base price" : "Amount"}</dt><dd>{pricing ? money(pricing.basePaise) : "—"}</dd></div>{!!taxRate && <div><dt>Saved GST ({taxRate}%)</dt><dd>{pricing ? money(pricing.gstPaise) : "—"}</dd></div>}<div className="billing-price-total"><dt>Total amount</dt><dd>{pricing ? money(pricing.totalPaise) : "—"}</dd></div></dl>
        <p className="billing-quote-state" role="status">{checking ? "Verifying live price…" : quote?.key === quoteKey ? "✓ Price verified with the server" : "Select hotel, GST number, office address and a valid amount."}</p>{quoteError && <p className="billing-error" role="alert">{quoteError}<button type="button" onClick={() => setRetry((value) => value + 1)}>Refresh pricing</button></p>}
        <label className="billing-field"><span>Voucher status</span><select name="status" value={form.status} onChange={(event) => update("status", event.target.value)}>{voucherStatuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
        <button type="submit" className="billing-primary" disabled={busy || checking || !quote || quote.key !== quoteKey || !pricing || (!voucher && !invoice)}>{busy ? "Saving voucher…" : voucher ? "Save voucher changes" : "Create voucher"}</button><p className="billing-footnote">{taxRate ? "All amounts in INR. The saved tax calculation is retained for this voucher." : "All amounts in INR. GST numbers identify the company registration; the amount entered is the final total."}</p>
      </aside></div>
    </fieldset>
  </form>;
}
