import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadVoucherFile } from "./voucherClient";
// Preview, Chrome printing and download use the exact same server PDF.
export default function VoucherPdfPreview({ blob, invoiceNumber, onClose }) {
  const [url, setUrl] = useState(""), [ready, setReady] = useState(false), [error, setError] = useState("");
  const frame = useRef(null), close = useRef(null);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow, objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl); document.body.style.overflow = "hidden"; close.current?.focus();
    const key = (event) => { if (event.key === "Escape") onClose(); if (event.key === "Tab") { const buttons = [...close.current.closest('[role="dialog"]').querySelectorAll("button:not(:disabled), iframe")]; const first = buttons[0], last = buttons.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } };
    window.addEventListener("keydown", key);
    return () => { URL.revokeObjectURL(objectUrl); document.body.style.overflow = overflow; window.removeEventListener("keydown", key); previous?.focus(); };
  }, [blob, onClose]);
  function print() { try { frame.current.contentWindow.focus(); frame.current.contentWindow.print(); } catch { setError("Use the print icon in the PDF viewer, or download the PDF and print it in Chrome."); } }
  return createPortal(<div className="billing-pdf-overlay"><section role="dialog" aria-modal="true" aria-labelledby="billing-pdf-title" className="billing-pdf-dialog"><header><div><h2 id="billing-pdf-title">Print preview · #{invoiceNumber}</h2><p>A4 document · saved billing information</p></div><div className="billing-actions"><button type="button" disabled={!ready} onClick={print}>Print voucher</button><button type="button" onClick={() => downloadVoucherFile(blob, `journey-voucher-${invoiceNumber}.pdf`)}>Download PDF</button><button type="button" ref={close} onClick={onClose}>Close preview</button></div></header>{error && <p role="alert">{error}</p>}{!ready && <p role="status">Preparing PDF preview…</p>}{url && <iframe ref={frame} title={`Printable invoice ${invoiceNumber}`} src={url} onLoad={() => setReady(true)} />}</section></div>, document.body);
}
