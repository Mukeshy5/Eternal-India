import logo from "../../assets/logo.webp";
import paymentQr from "../../assets/paymentpng/payment-QR.png";
import { bankLabels, invoiceBank, invoiceCompany, invoiceMoney, invoiceDateLabel } from "../../../../shared/invoices.js";

export default function InvoiceTemplate({ invoice }) {
  const bank = invoice.companyBankDetails || invoiceBank;
  return <article className="invoice-document" aria-label="Invoice document">
    <header className="invoice-letterhead"><img src={logo} alt="Eternal India" /><div><h2>{invoice.invoiceType === "tax_invoice" ? "TAX INVOICE" : "INVOICE"}</h2><strong>{invoice.invoiceNumber || "Assigned on save"}</strong><span>{invoiceDateLabel(invoice.invoiceDate)}</span></div></header>
    <p className="invoice-company">{invoiceCompany}</p>
    <section className="invoice-recipient"><h3>To:</h3><strong>{invoice.clientName || "Client name"}</strong>{invoice.recipientDetails && <p>{invoice.recipientDetails}</p>}</section>
    <div className="invoice-document-table"><table><thead><tr><th>Description</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead><tbody><tr><td>{invoice.description || "Travel / Tour Services"}</td><td>{invoice.totalPerson || "—"}</td><td>{invoiceMoney(invoice.perPersonAmount)}</td><td>{invoiceMoney(invoice.totalAmount)}</td></tr></tbody></table></div>
    <div className="invoice-total"><span>Total amount</span><strong>{invoiceMoney(invoice.totalAmount)}</strong></div>
    <section className="invoice-payment"><div className="invoice-qr"><img src={paymentQr} alt="Original Eternal India payment QR code" /><strong>SCAN &amp; PAY</strong></div><div className="invoice-bank"><h3>BANK ACCOUNT DETAILS</h3><dl>{Object.entries(bankLabels).map(([key, label]) => <div key={key}><dt>{label}:</dt><dd>{bank[key]}</dd></div>)}</dl></div></section>
    {invoice.notes && <section className="invoice-notes"><h3>Notes</h3><ol>{invoice.notes.split("\n").filter(Boolean).map((note, index) => <li key={index}>{note}</li>)}</ol></section>}
    <div className="invoice-signature"><div aria-label="Company stamp and signature space" /><small>Authorized Signature / Company Stamp</small></div>
    <footer><strong>{invoiceCompany}</strong><span>Thank you for choosing Eternal India!</span></footer>
  </article>;
}
