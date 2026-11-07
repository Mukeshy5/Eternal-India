import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { fileURLToPath } from "node:url";
import { attendancePolicy, attendanceStatuses, legacyAttendanceStatuses } from "../../shared/staff.js";
export { cardPdf } from "./card.js";

const pdfBuffer = (doc, draw) => new Promise((resolve, reject) => {
  const chunks = []; doc.on("data", (chunk) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
  try { doc.registerFont("Staff", fileURLToPath(new URL("./fonts/NotoSansDevanagari.ttf", import.meta.url))); draw(doc); doc.end(); } catch (error) { reject(error); doc.end(); }
});
const safeText = (value) => String(value ?? "").replace(/[\x00-\x1f\x7f]/g, " ");
const statusLabel = (status) => attendanceStatuses[status] || legacyAttendanceStatuses[status] || status;
export async function attendanceExcel(rows, report) {
  const book = new ExcelJS.Workbook(); book.creator = "Eternal India";
  const sheet = book.addWorksheet("Attendance", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Employee ID", key: "employeeId", width: 22 }, { header: "Staff name", key: "name", width: 30 },
    { header: "Department", key: "department", width: 24 }, { header: "Date (Asia/Kolkata)", key: "date", width: 24 },
    { header: "Status", key: "status", width: 15 }, { header: "Check-in", key: "checkIn", width: 14 },
    { header: "Check-out", key: "checkOut", width: 14 }, { header: "Working hours", key: "workingHours", width: 18 },
  ];
  rows.forEach((row) => sheet.addRow({ ...row, status: statusLabel(row.status), workingHours: Math.round(row.workingMinutes / 60 * 100) / 100 }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF273B32" } };
  sheet.autoFilter = "A1:H1"; sheet.getColumn(8).numFmt = "0.00";
  const totals = book.addWorksheet("Summary");
  totals.columns = [{ width: 32 }, { width: 100 }];
  totals.addRows([["Eternal India attendance", `${report.from} to ${report.to}`], ["Scope", report.scope || "All staff"], ...Object.entries(report.summary), ["Calculation policy", attendancePolicy]]);
  totals.getRow(totals.rowCount).alignment = { wrapText: true }; totals.getRow(totals.rowCount).height = 52;
  return Buffer.from(await book.xlsx.writeBuffer());
}

export function attendancePdf(rows, report) {
  return pdfBuffer(new PDFDocument({ size: "A4", layout: "landscape", margin: 30, bufferPages: true, info: { Title: "Eternal India attendance report" } }), (doc) => {
    const widths = [112, 145, 74, 72, 67, 67, 67, 100];
    const header = () => {
      doc.fillColor("#273b32").font("Helvetica-Bold").fontSize(18).text("Eternal India | Attendance", 30, 28);
      doc.font("Staff").fontSize(9).text(`${report.from} to ${report.to} | Asia/Kolkata | ${safeText(report.scope || "All staff")}`, 30, 53, { width: 780, height: 22, ellipsis: true });
      const s = report.summary;
      doc.fontSize(8).text(`Present ${s.present}   Absent ${s.absent}   Half Day ${s.half_day}   Leave ${s.leave}   Working hours ${s.totalWorkingHours}   Attendance ${s.attendancePercentage}%`, 30, 79);
      doc.fontSize(7).text(safeText(attendancePolicy), 30, 95, { width: 780, height: 28 });
      cellRow(["Employee ID", "Staff name", "Date", "Status", "Check-in", "Check-out", "Hours", "Department"], 132, true);
    };
    const cellRow = (values, y, bold = false) => {
      let x = 30;
      doc.font(bold ? "Helvetica-Bold" : "Staff").fontSize(8).fillColor("#273b32");
      values.forEach((value, index) => { doc.text(safeText(value), x + 3, y + 5, { width: widths[index] - 6, height: 23, ellipsis: true }); x += widths[index]; });
      doc.moveTo(30, y + 31).lineTo(810, y + 31).strokeColor("#dfe5d9").stroke();
    };
    header(); let y = 165;
    if (!rows.length) doc.text("No marked attendance in this period.", 33, y);
    for (const row of rows) {
      if (y > 510) { doc.addPage(); header(); y = 165; }
      cellRow([row.employeeId, row.name, row.date, statusLabel(row.status), row.checkIn || "-", row.checkOut || "-", (row.workingMinutes / 60).toFixed(2), row.department], y); y += 32;
    }
    const pages = doc.bufferedPageRange();
    for (let page = 0; page < pages.count; page++) { doc.switchToPage(page); doc.font("Helvetica").fontSize(7).fillColor("#667468").text(`Page ${page + 1} of ${pages.count}`, 30, 560, { width: 780, align: "right", lineBreak: false }); }
  });
}
