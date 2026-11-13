import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { voucherCompany as company, formatVoucherDate as date, formatVoucherMoney as money } from "../../shared/voucherBilling.js";

const fontPath = fileURLToPath(new URL("../staff/fonts/NotoSansDevanagari.ttf", import.meta.url));
let logoPromise;
function pdf(draw, options = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true, ...options });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try { doc.registerFont("Voucher", fontPath); draw(doc); doc.end(); } catch (error) { reject(error); doc.end(); }
  });
}
export async function voucherPdf(voucher) {
  logoPromise ??= sharp(fileURLToPath(new URL("../../frontend/public/logo.webp", import.meta.url))).png().toBuffer().catch((error) => { logoPromise = undefined; throw error; });
  const logo = await logoPromise;
  return pdf((doc) => {
    const width = 523, left = 36;
    doc.image(logo, left, 36, { fit: [110, 46] });
    doc.font("Helvetica-Bold").fontSize(21).fillColor("#153963").text(company.name, 164, 36);
    doc.font("Helvetica").fontSize(9).text(company.subtitle, 164, 63);
    doc.fontSize(8).fillColor("#435469").text(company.address, 164, 80, { width: 395 });
    doc.text(company.phone, 164, 106);
    doc.moveTo(left, 129).lineTo(559, 129).strokeColor("#cbd9e8").stroke();
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#153963").text("JOURNEY VOUCHER", left, 146);
    doc.font("Voucher").fontSize(10).text(`Invoice #${voucher.invoiceNumber}   |   ${date(voucher.voucherDate)}   |   ${voucher.status.toUpperCase()}`, left, 172);
    let y = 202;
    const row = (labelA, valueA, labelB, valueB) => {
      doc.font("Voucher").fontSize(8);
      const h = Math.max(42, doc.heightOfString(valueA || "—", { width: 235 }) + 22, doc.heightOfString(valueB || "—", { width: 235 }) + 22);
      if (y + h > 745) { doc.addPage(); y = 40; }
      for (const [x, label, value] of [[left, labelA, valueA], [305, labelB, valueB]]) {
        doc.fillColor("#64758a").fontSize(8).text(label, x, y, { width: 235 });
        doc.fillColor("#172c44").fontSize(10).text(value || "—", x, y + 14, { width: 235 });
      }
      y += h;
    };
    row("GUEST NAME", voucher.guestName, "HOTEL NAME", voucher.hotel.name);
    row("COMPANY GST NUMBER", `${voucher.gst.gstNumber} · ${voucher.gst.rate}%`, "HOTEL ADDRESS", voucher.hotel.address);
    row("CHECK-IN DATE", date(voucher.checkInDate), "CHECK-OUT DATE", date(voucher.checkOutDate));
    row("ARRIVAL", `${date(voucher.arrivalDate)}\n${voucher.arrivalPlace}`, "DEPARTURE", `${date(voucher.departureDate)}\n${voucher.departurePlace}`);
    if (y > 700) { doc.addPage(); y = 40; }
    doc.fillColor("#64758a").fontSize(8).text("YOUR REQUIREMENT", left, y);
    doc.font("Voucher").fillColor("#172c44").fontSize(10).text(voucher.requirement, left, y + 17, { width, lineGap: 3 });
    y = doc.y + 22;
    if (y + 210 > 768) { doc.addPage(); y = 40; }
    for (const [label, value] of [["Base price", money(voucher.pricing.basePaise)], [`GST (${voucher.pricing.gstRate}%)`, money(voucher.pricing.gstPaise)], ["TOTAL AMOUNT", money(voucher.pricing.totalPaise)]]) {
      doc.rect(305, y - 5, 254, 28).fill("#eef4fb");
      doc.font("Voucher").fontSize(10).fillColor("#153963").text(label, 315, y, { width: 120 }).text(value, 435, y, { width: 114, align: "right" }); y += 30;
    }
    y += 65;
    doc.font("Helvetica-Bold").fontSize(10).text("Authorized Signatory", 305, y, { width: 254, align: "center" });
    doc.font("Voucher").fontSize(8).fillColor("#435469").text(company.note, left, y + 28, { width });
    y = doc.y + 16;
    if (y + 55 > 800) { doc.addPage(); y = 40; }
    doc.moveTo(left, y).lineTo(559, y).strokeColor("#cbd9e8").stroke();
    doc.fontSize(8).text(`Address: ${company.address}\nPhone: ${company.phone}\nWebsite: ${company.website}`, left, y + 10, { width, align: "center" });
  }, { info: { Title: `Journey Voucher ${voucher.invoiceNumber}`, Author: company.name } });
}

const columns = [
  ["Invoice Number", (v) => v.invoiceNumber, 16], ["Voucher Date", (v) => v.voucherDate, 15],
  ["Guest Name", (v) => v.guestName, 26], ["Hotel Name", (v) => v.hotel.name, 26],
  ["GST Number", (v) => v.gst.gstNumber, 22], ["Check-in Date", (v) => v.checkInDate, 15],
  ["Check-out Date", (v) => v.checkOutDate, 15], ["Arrival Place", (v) => v.arrivalPlace, 25],
  ["Departure Place", (v) => v.departurePlace, 25], ["Base Price (INR)", (v) => v.pricing.basePaise / 100, 20],
  ["GST Rate (%)", (v) => v.pricing.gstRate, 14], ["GST Amount (INR)", (v) => v.pricing.gstPaise / 100, 20],
  ["Total Amount (INR)", (v) => v.pricing.totalPaise / 100, 22], ["Status", (v) => v.status, 14],
  ["Arrival Date", (v) => v.arrivalDate, 15], ["Departure Date", (v) => v.departureDate, 15], ["Your Requirement", (v) => v.requirement, 50],
];
export async function historyExcel(vouchers) {
  const book = new ExcelJS.Workbook(); book.creator = company.name;
  const sheet = book.addWorksheet("Journey vouchers", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map(([header, , width]) => ({ header, width }));
  for (const v of vouchers) sheet.addRow(columns.map(([, value]) => value(v)));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153963" } };
  for (const index of [10, 12, 13]) sheet.getColumn(index).numFmt = '#,##0.00';
  sheet.autoFilter = { from: "A1", to: "Q1" };
  sheet.addRow([]);
  sheet.addRow(["Total vouchers", vouchers.length, "Total billing (INR)", vouchers.reduce((sum, v) => sum + v.pricing.totalPaise, 0) / 100]);
  return book.xlsx.writeBuffer();
}
export function historyPdf(vouchers) {
  return pdf((doc) => {
    const xs = [30, 79, 140, 226, 318, 400, 456, 512, 600, 688, 760];
    const widths = [45, 57, 82, 88, 78, 52, 52, 84, 84, 68, 48];
    const header = () => {
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#153963").text("ETERNAL INDIA | Journey Voucher History", 30, 25);
      doc.font("Voucher").fontSize(9).text(`${vouchers.length} vouchers · Total billing: ${money(vouchers.reduce((sum, v) => sum + v.pricing.totalPaise, 0))}`, 30, 51);
      ["Invoice", "Date", "Guest", "Hotel", "GST number", "Check-in", "Check-out", "Arrival place", "Departure place", "Total (INR)", "Status"].forEach((value, i) => doc.fontSize(7).text(value, xs[i], 80, { width: widths[i] }));
      doc.moveTo(30, 102).lineTo(812, 102).strokeColor("#cbd9e8").stroke();
    };
    header(); let y = 112;
    for (const v of vouchers) {
      const cells = [v.invoiceNumber, v.voucherDate, v.guestName, v.hotel.name, v.gst.gstNumber, v.checkInDate, v.checkOutDate, v.arrivalPlace, v.departurePlace, money(v.pricing.totalPaise), v.status];
      doc.font("Voucher").fontSize(7);
      const height = Math.max(32, ...cells.map((cell, i) => doc.heightOfString(cell, { width: widths[i] }) + 14));
      if (y + height > 554) { doc.addPage(); header(); y = 112; }
      cells.forEach((cell, i) => doc.fillColor("#172c44").fontSize(7).text(cell, xs[i], y, { width: widths[i] }));
      y += height;
      doc.moveTo(30, y - 7).lineTo(812, y - 7).strokeColor("#e1e9f2").stroke();
    }
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) { doc.switchToPage(i); doc.font("Helvetica").fontSize(8).text(`Page ${i + 1} of ${range.count}`, 30, 570, { lineBreak: false }); }
  }, { layout: "landscape", margin: 30, info: { Title: "Journey Voucher History" } });
}
