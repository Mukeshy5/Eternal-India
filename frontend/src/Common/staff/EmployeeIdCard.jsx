export default function EmployeeIdCard({ person, apiBase }) {
  return <figure className="staff-identity-card" aria-label={`Employee ID card for ${person.name}`}><img src={`/api${apiBase}/staff/${person._id}/card-preview?v=${person.version}&design=2`} alt={`Eternal India ID card: ${person.name}, ${person.designation}, ${person.department}, ${person.employeeId}, ${person.phone}, ${person.email}`} width="540" height="856" loading="lazy" /></figure>;
}

export function idCardPrintHtml(imageUrl) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Eternal India - Print ID Card</title><style>@page{size:53.98mm 85.60mm;margin:0}html,body{margin:0;padding:0;width:53.98mm;height:85.60mm;background:white}img{display:block;width:53.98mm;height:85.60mm;object-fit:fill}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><img src="${imageUrl}" alt="Employee ID card"></body></html>`;
}

export function printIdCard(blob, signal) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), frame = document.createElement("iframe");
    frame.title = "Print employee ID card"; frame.className = "staff-print-frame";
    let timeout;
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener("abort", cancel); frame.remove(); URL.revokeObjectURL(url); };
    const cancel = () => { cleanup(); reject(new Error("Printing was cancelled.")); };
    signal?.addEventListener("abort", cancel, { once: true });
    frame.onload = async () => {
      try {
        const image = frame.contentDocument.querySelector("img");
        if (!image) return;
        if (!image.complete) await new Promise((loaded, failed) => { image.onload = loaded; image.onerror = () => failed(new Error("The ID card image could not be loaded for printing.")); });
        if (signal?.aborted) return cancel();
        frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
        clearTimeout(timeout); frame.contentWindow.focus(); frame.contentWindow.print(); resolve();
      } catch (error) { cleanup(); reject(error); }
    };
    frame.srcdoc = idCardPrintHtml(url);
    timeout = setTimeout(() => { cleanup(); reject(new Error("The print view did not load. Download the PDF and print at actual size.")); }, 15000);
    document.body.append(frame);
  });
}
