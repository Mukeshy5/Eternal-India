import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { voucherCompany as company, formatVoucherDate as date, formatVoucherMoney as money, voucherOffice, mealPlanLabel } from "../../shared/voucherBilling.js";

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
  const office = voucherOffice(voucher), contact = `${office.phone || company.phone}   |   ${company.website}`;
  return pdf((doc) => {
    const left = 36, width = doc.page.width - left * 2, right = left + width;
    const plum = "#71314f", gold = "#c8a56e", ink = "#25364b", muted = "#7c7080", rule = "#e7dfe4";
    const officeName = office.name === company.name ? "" : office.name;
    doc.font("Voucher").fontSize(8.5);
    const officeNameHeight = officeName ? doc.heightOfString(officeName, { width: width - 48, align: "center" }) + 4 : 0;
    const officeAddressY = 117 + officeNameHeight;
    doc.font("Voucher").fontSize(7.5);
    const officeHeaderHeight = doc.heightOfString(office.address, { width: width - 48, align: "center" });
    const headerContactHeight = doc.heightOfString(contact, { width, align: "center" });
    const phoneY = officeAddressY + officeHeaderHeight + 8, gstY = phoneY + headerContactHeight + 8, ruleY = gstY + 23, metaY = ruleY + 13, bodyTop = metaY + 62;
    doc.fontSize(7);
    const officeFooterHeight = doc.heightOfString(office.address, { width, align: "center" });
    doc.fontSize(7.5);
    const contactHeight = doc.heightOfString(contact, { width, align: "center" });
    const footerHeight = officeFooterHeight + contactHeight + 24, footer = doc.page.height - footerHeight - 28, bodyBottom = footer - 20;
    const line = (x1, y1, x2, y2, color = rule) => doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(.6).strokeColor(color).stroke();
    const text = (value, x, y, size, color, options = {}) => doc.font("Voucher").fontSize(size).fillColor(color).text(value || "—", x, y, options);
    const page = () => {
      // Header and footer are outside the flow margins; do not let their text
      // create additional pages while PDFKit draws the repeated letterhead.
      doc.page.margins.bottom = 0;
      // Paint the logo into every page so it also survives printing without backgrounds.
      doc.save().opacity(.055).rotate(-18, { origin: [doc.page.width / 2, 425] });
      doc.image(logo, (doc.page.width - 390) / 2, 355, { fit: [390, 140], align: "center", valign: "center" });
      doc.restore();
      doc.rect(left, 24, width, 3).fill(plum);
      doc.image(logo, (doc.page.width - 170) / 2, 39, { fit: [170, 53], align: "center", valign: "center" });
      text(company.subtitle, left, 99, 8.5, ink, { width, align: "center" });
      if (officeName) text(officeName, left + 24, 117, 8.5, ink, { width: width - 48, align: "center" });
      text(office.address, left + 24, officeAddressY, 7.5, muted, { width: width - 48, align: "center" });
      text(contact, left, phoneY, 7.5, muted, { width, align: "center" });
      text(`GST No.  ${voucher.gst.gstNumber}`, left, gstY, 9, plum, { width, align: "center" });
      line(left, ruleY, right, ruleY, gold);
      doc.roundedRect(left, metaY, width, 46, 5).fill("#faf6f8");
      const statusColor = { confirmed: "#33785b", cancelled: "#a6535d", draft: "#40648e" }[voucher.status] || ink;
      [["INVOICE NUMBER", `#${voucher.invoiceNumber}`, ink], ["VOUCHER DATE", date(voucher.voucherDate), ink], ["BOOKING STATUS", voucher.status.toUpperCase(), statusColor]].forEach(([label, value, color], index) => {
        const x = left + index * width / 3;
        text(label, x, metaY + 6, 7, muted, { width: width / 3, align: "center" });
        text(value, x, metaY + 20, 9, color, { width: width / 3, align: "center" });
        if (index) line(x, metaY + 9, x, metaY + 37);
      });
      line(left, footer, right, footer, gold);
      text(office.address, left, footer + 8, 7, muted, { width, align: "center" });
      text(contact, left, footer + officeFooterHeight + 13, 7.5, muted, { width, align: "center" });
      doc.page.margins.top = bodyTop; doc.page.margins.bottom = doc.page.height - bodyBottom;
      doc.font("Voucher").fontSize(10).fillColor(ink);
      doc.x = left; doc.y = bodyTop;
    };
    doc.on("pageAdded", page);
    page();
    let y = bodyTop;
    const ensureSpace = (height) => { if (y + height > bodyBottom) { doc.addPage(); y = bodyTop; } };
    doc.font("Voucher").fontSize(20);
    const hotelHeight = doc.heightOfString(voucher.hotel.name, { width: width - 32, align: "center" });
    doc.fontSize(9);
    const addressHeight = doc.heightOfString(voucher.hotel.address, { width: width - 40, align: "center" });
    text("HOTEL / ACCOMMODATION", left, y, 7.5, "#966d3d", { width, align: "center", characterSpacing: 1.2 });
    text(voucher.hotel.name, left + 16, y + 19, 20, plum, { width: width - 32, align: "center" });
    text(voucher.hotel.address, left + 20, y + 23 + hotelHeight, 9, muted, { width: width - 40, align: "center" });
    y += 40 + hotelHeight + addressHeight;
    line(left, y, right, y);
    const row = (cells, size = 10) => {
      const cellWidth = width / cells.length, valueWidth = cellWidth - 28;
      doc.font("Voucher").fontSize(size);
      const height = Math.max(50, ...cells.map(([, value]) => doc.heightOfString(value || "—", { width: valueWidth }) + 30));
      ensureSpace(height);
      cells.forEach(([label, value], index) => {
        const x = left + index * cellWidth;
        if (index) line(x, y, x, y + height);
        text(label, x + 14, y + 10, 7.5, muted, { width: valueWidth, characterSpacing: .5 });
        text(value, x + 14, y + 25, size, ink, { width: valueWidth });
      });
      y += height;
      line(left, y, right, y);
    };
    row([["GUEST NAME", voucher.guestName]], 12);
    row([["CHECK-IN DATE", date(voucher.checkInDate)], ["CHECK-OUT DATE", date(voucher.checkOutDate)], ["MEAL PLAN", mealPlanLabel(voucher.mealPlan)]], 9);
    row([["ARRIVAL", `${date(voucher.arrivalDate)}\n${voucher.arrivalPlace}`], ["DEPARTURE", `${date(voucher.departureDate)}\n${voucher.departurePlace}`]]);
    y += 18;
    ensureSpace(65);
    line(left, y, left, y + 36, gold);
    text("YOUR REQUIREMENT", left + 14, y, 7.5, muted, { width: width - 28, characterSpacing: .5 });
    // PDFKit continues long requirements within the reserved header/footer margins.
    text(voucher.requirement, left + 14, y + 17, 10, ink, { width: width - 28, lineGap: 2 });
    y = doc.y + 16;
    ensureSpace(108);
    line(right - 200, y + 48, right - 14, y + 48, gold);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(plum).text("Authorized Signatory", right - 200, y + 60, { width: 186, align: "center" });
    text(company.note, left, y + 87, 7.5, muted, { width });
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const bottomMargin = doc.page.margins.bottom; doc.page.margins.bottom = 0;
      text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - 29, 7, muted, { width, align: "center", height: 16 });
      doc.page.margins.bottom = bottomMargin;
    }
  }, { margin: { top: 260, bottom: 104, left: 36, right: 36 }, info: { Title: `Journey Voucher ${voucher.invoiceNumber}`, Author: company.name } });
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
  ["Office Name", (v) => voucherOffice(v).name, 24], ["Office Address", (v) => voucherOffice(v).address, 55], ["Meal Plan", (v) => mealPlanLabel(v.mealPlan), 36],
];
export async function historyExcel(vouchers) {
  const book = new ExcelJS.Workbook(); book.creator = company.name;
  const sheet = book.addWorksheet("Journey vouchers", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map(([header, , width]) => ({ header, width }));
  for (const v of vouchers) sheet.addRow(columns.map(([, value]) => value(v)));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF153963" } };
  for (const index of [10, 12, 13]) sheet.getColumn(index).numFmt = '#,##0.00';
  sheet.autoFilter = { from: "A1", to: "T1" };
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
    const wrappedLines = (value, width) => String(value).split("\n").flatMap((paragraph) => {
      const lines = []; let line = "";
      for (const character of paragraph) {
        if (line && doc.widthOfString(line + character) > width) {
          const space = line.lastIndexOf(" ");
          if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1); }
          else { lines.push(line); line = ""; }
        }
        line += character;
      }
      lines.push(line); return lines;
    });
    header(); let y = 112;
    for (const v of vouchers) {
      const cells = [v.invoiceNumber, v.voucherDate, `${v.guestName}\nOffice: ${voucherOffice(v).name}\n${voucherOffice(v).address}\nMeal: ${mealPlanLabel(v.mealPlan)}`, v.hotel.name, v.gst.gstNumber, v.checkInDate, v.checkOutDate, v.arrivalPlace, v.departurePlace, money(v.pricing.totalPaise), v.status];
      doc.font("Voucher").fontSize(7);
      const lines = cells.map((cell, i) => wrappedLines(cell, widths[i]));
      const lineHeight = doc.currentLineHeight(true) + 1, count = Math.max(...lines.map((cell) => cell.length));
      if (y + Math.min(32, count * lineHeight + 14) > 554) { doc.addPage(); header(); y = 112; }
      for (let offset = 0; offset < count;) {
        const available = Math.floor((554 - y - 14) / lineHeight);
        if (available < 1) { doc.addPage(); header(); y = 112; continue; }
        const take = Math.min(available, count - offset);
        lines.forEach((cell, i) => cell.slice(offset, offset + take).forEach((line, index) => doc.font("Voucher").fillColor("#172c44").fontSize(7).text(line, xs[i], y + index * lineHeight, { lineBreak: false })));
        y += Math.max(32, take * lineHeight + 14); offset += take;
        doc.moveTo(30, y - 7).lineTo(812, y - 7).strokeColor("#e1e9f2").stroke();
      }
    }
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) { doc.switchToPage(i); doc.font("Helvetica").fontSize(8).text(`Page ${i + 1} of ${range.count}`, 30, 570, { lineBreak: false }); }
  }, { layout: "landscape", margin: 30, info: { Title: "Journey Voucher History" } });
}
