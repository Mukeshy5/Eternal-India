import { useRef, useState } from "react";
import { calculateInvoice, invoiceNotes, invoiceToday, invoiceMoney } from "../../../../shared/invoices.js";
import { usePanelNavigationGuard } from "../panel/PanelNavigationContext";
import InvoiceTemplate from "./InvoiceTemplate";

export default function InvoiceForm({ invoice, busy, errors, onSave, onCancel }) {
  const [initial] = useState(() => ({ invoiceType: invoice?.invoiceType || "invoice", invoiceDate: invoice?.invoiceDate || invoiceToday(), clientName: invoice?.clientName || "", totalPerson: String(invoice?.totalPerson || ""), perPersonAmount: String(invoice?.perPersonAmount || ""), recipientDetails: invoice?.recipientDetails || "", description: invoice?.description || "Travel / Tour Services", notes: invoice?.notes ?? invoiceNotes }));
  const [form, setForm] = useState(initial), [attempted, setAttempted] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID()), heading = useRef(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  usePanelNavigationGuard(dirty, busy);
  const price = calculateInvoice(form.totalPerson, form.perPersonAmount);
  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  function cancel() { if (!busy && (!dirty || window.confirm("Discard unsaved invoice changes?"))) onCancel(); }
  function submit(event) {
    event.preventDefault(); setAttempted(true);
    if (price) onSave({ ...form, ...(invoice ? { version: invoice.version } : { requestId }) });
    else heading.current?.focus();
  }
  const field = (name, label, props = {}, multiline = false) => <label className={`invoice-field ${multiline ? "invoice-field-wide" : ""}`} key={name}><span>{label}</span>{multiline ? <textarea name={name} value={form[name]} onChange={change} rows={name === "notes" ? 7 : 3} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `invoice-error-${name}` : undefined} {...props} /> : <input name={name} value={form[name]} onChange={change} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `invoice-error-${name}` : undefined} {...props} />}{errors[name] && <small id={`invoice-error-${name}`} role="alert">{errors[name]}</small>}</label>;
  return <div className="invoice-edit-layout"><form className="invoice-form invoice-card" onSubmit={submit}>
    <header><div><span className="invoice-eyebrow">{invoice ? invoice.invoiceNumber : "NEW INVOICE"}</span><h2 ref={heading} tabIndex={-1}>{invoice ? "Edit invoice" : "Invoice details"}</h2><p>{invoice ? "The saved invoice number stays with this invoice." : "A unique invoice number is assigned when you save."}</p></div></header>
    <fieldset disabled={busy}><div className="invoice-form-grid">
      <label className="invoice-field"><span>Invoice number</span><input value={invoice?.invoiceNumber || "Auto-generated on save"} readOnly /></label>
      {field("invoiceDate", "Invoice date *", { type: "date", required: true, min: "1900-01-01", max: "2199-12-31" })}
      <label className="invoice-field"><span>Invoice type</span><select name="invoiceType" value={form.invoiceType} onChange={change}><option value="invoice">Invoice</option><option value="tax_invoice">Tax Invoice</option></select>{errors.invoiceType && <small role="alert">{errors.invoiceType}</small>}</label>
      {field("clientName", "Client name *", { required: true, maxLength: 160, autoComplete: "name", placeholder: "Full client name" })}
      {field("totalPerson", "Total person *", { type: "number", required: true, min: 1, max: 999999, step: 1, inputMode: "numeric", placeholder: "4" })}
      {field("perPersonAmount", "Per person amount (INR) *", { type: "number", required: true, min: .01, max: 99999999.99, step: .01, inputMode: "decimal", placeholder: "15000.00" })}
      {field("recipientDetails", "To: billing address / recipient details", { maxLength: 4000, placeholder: "Address, contact details or billing instructions" }, true)}
      {field("description", "Description / particulars *", { required: true, maxLength: 300 }, true)}
    </div><div className="invoice-calculation"><span>Total amount <small>{price ? `${price.totalPerson} person(s) × ${invoiceMoney(price.perPersonAmount)}` : "Persons × per person amount"}</small></span><output aria-live="polite" aria-label="Calculated total amount">{invoiceMoney(price?.totalAmount)}</output></div>
    {attempted && !price && <p className="invoice-error" role="alert">Enter a positive whole number of persons and a positive rate with up to two decimal places. Total cannot exceed INR 9,999,999,999.99.</p>}
    {field("notes", "Invoice notes (one per line)", { maxLength: 6000 }, true)}
    <div className="invoice-actions"><button className="invoice-primary" type="submit">{busy ? "Saving…" : invoice ? "Save invoice changes" : "Save invoice"}</button><button type="button" onClick={cancel}>Cancel</button></div></fieldset>
  </form><aside className="invoice-draft"><div className="invoice-preview-caption"><strong>Live preview</strong><span>PDF and print use the saved invoice</span></div><InvoiceTemplate invoice={{ ...form, ...price, invoiceNumber: invoice?.invoiceNumber, perPersonAmount: price?.perPersonAmount || 0 }} /></aside></div>;
}
