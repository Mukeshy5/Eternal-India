import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadLetter } from "./letterClient";

export default function LetterPdfPreview({ blob, number, draft, onClose }) {
  const [url, setUrl] = useState(""), [ready, setReady] = useState(false), [error, setError] = useState("");
  const frame = useRef(null), close = useRef(null);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow, objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl); document.body.style.overflow = "hidden"; close.current?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const controls = [...close.current.closest('[role="dialog"]').querySelectorAll("button:not(:disabled), iframe, a")], first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => { URL.revokeObjectURL(objectUrl); document.body.style.overflow = overflow; window.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [blob, onClose]);
  function print() { try { frame.current.contentWindow.focus(); frame.current.contentWindow.print(); } catch { setError("Open the PDF in a new tab to print, or download it and use your PDF viewer."); } }
  return createPortal(<div className="letter-pdf-overlay"><section className="letter-pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="letter-pdf-title"><header><div><h2 id="letter-pdf-title">{draft ? "Draft preview" : number}</h2><p>{draft ? "Review before generating the final letter" : "Saved A4 document"}</p></div><div className="letter-actions"><button type="button" disabled={!ready} onClick={print}>Print</button><button type="button" onClick={() => downloadLetter(blob, draft ? "draft-letter-preview" : number)}>Download PDF</button>{url && <a href={url} target="_blank" rel="noreferrer">Open PDF</a>}<button type="button" ref={close} onClick={onClose}>Close preview</button></div></header>{error && <p role="alert">{error}</p>}{!ready && <p role="status">Preparing PDF preview…</p>}{url && <iframe ref={frame} title={`PDF ${number || "draft preview"}`} src={url} onLoad={() => setReady(true)} />}</section></div>, document.body);
}
