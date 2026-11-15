import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { catalog, publicRecord, fail } from "./catalog.js";

export const safeCell = value => { const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? ""); return /^[\s]*[=+@\-\t\r]/.test(text) ? `'${text}` : text; };
const csv = value => `"${safeCell(value).replaceAll('"', '""')}"`;
export async function exportRecords(control, key, input, format, res, actor) {
  if (!["csv", "xlsx", "json", "pdf"].includes(format)) throw fail(400, "Choose CSV, XLSX, JSON or PDF.");
  const section = catalog[key]; if (!section) throw fail(400, "Choose a history section.");
  const { total } = await control.list(key, { ...input, page: 1, pageSize: 25 });
  if ((format === "pdf" || format === "xlsx") && total > 10000) throw fail(400, "Limit PDF and Excel exports to 10,000 records. Use CSV or JSON for larger exports.");
  await control.audit(actor, "export.started", { section: key, format, count: total, from: input.from, to: input.to });
  const mime = { csv: "text/csv; charset=utf-8", json: "application/json", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf" };
  res.set({ "Content-Type": mime[format], "Content-Disposition": `attachment; filename="${key}-${new Date().toISOString().slice(0, 10)}.${format}"`, "X-Content-Type-Options": "nosniff" });
  let count = 0;
  try {
    if (format === "csv" || format === "json") {
      async function* chunks() {
        yield format === "csv" ? `\uFEFF${[...section.fields, "record_json"].map(csv).join(",")}\r\n` : "[\n";
        for await (const doc of control.documents(key, input)) {
          if (res.destroyed) break; const record = publicRecord(doc);
          yield format === "csv" ? `${[...section.fields.map(field => record[field]), JSON.stringify(record)].map(csv).join(",")}\r\n` : `${count ? ",\n" : ""}${JSON.stringify(record)}`; count++;
        }
        if (format === "json") yield "\n]";
      }
      await pipeline(Readable.from(chunks()), res);
    } else if (format === "xlsx") {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
      const sheet = workbook.addWorksheet(section.label.slice(0, 31)), raw = workbook.addWorksheet("Complete record JSON");
      sheet.addRow(["Record ID", ...section.fields]).commit(); raw.addRow(["Record ID", "Part", "JSON (join parts in order)"]).commit();
      for await (const doc of control.documents(key, input)) {
        if (res.destroyed) throw fail(499, "Export download disconnected."); const record = publicRecord(doc);
        sheet.addRow([record._id, ...section.fields.map(field => safeCell(record[field]).slice(0, 32000))]).commit();
        // ExcelJS writes string cells as literals. Keep JSON chunks exact for lossless reassembly.
        const json = JSON.stringify(record); for (let index = 0; index < json.length; index += 32000) raw.addRow([record._id, index / 32000 + 1, json.slice(index, index + 32000)]).commit(); count++;
      }
      sheet.commit(); raw.commit(); await workbook.commit();
    } else {
      const pdf = new PDFDocument({ size: "A4", margin: 40, bufferPages: false }); pdf.registerFont("Records", fileURLToPath(new URL("../staff/fonts/NotoSansDevanagari.ttf", import.meta.url))); pdf.font("Records"); pdf.pipe(res);
      pdf.fontSize(20).fillColor("#215991").text(section.label); pdf.fontSize(10).fillColor("#475569").text(`Summary report | ${total} records | ${input.from || "Earliest"} to ${input.to || "Latest"}\nGenerated ${new Date().toISOString()}\nFull records are available in JSON, CSV and Excel.\n\n`);
      for await (const doc of control.documents(key, input)) {
        if (res.destroyed) { pdf.destroy(); throw fail(499, "Export download disconnected."); }
        const record = publicRecord(doc); pdf.fontSize(9).fillColor("#1e293b").text(`Record: ${record._id}`);
        for (const field of section.fields) pdf.text(`${field}: ${String(record[field] ?? "—").slice(0, 2000)}`); pdf.moveDown(); count++;
      }
      pdf.end(); await new Promise((resolve, reject) => { res.once("finish", resolve); res.once("error", reject); res.once("close", () => res.writableFinished ? resolve() : reject(fail(499, "Export download disconnected."))); });
    }
    await control.audit(actor, "export.completed", { section: key, format, count });
  } catch (error) { await control.audit(actor, "export.failed", { section: key, format, count }); throw error; }
}
