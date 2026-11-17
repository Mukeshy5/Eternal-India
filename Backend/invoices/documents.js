import PDFDocument from "pdfkit";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { invoiceCompany, bankLabels, invoiceDateLabel, invoiceMoney } from "../../shared/invoices.js";

const font = fileURLToPath(new URL("../staff/fonts/NotoSansDevanagari.ttf", import.meta.url));
const qr = fileURLToPath(new URL("../../frontend/src/assets/paymentpng/payment-QR.png", import.meta.url));
const logoPath = fileURLToPath(new URL("../../frontend/src/assets/logo.webp", import.meta.url));
const stampPath = fileURLToPath(new URL("../../frontend/src/assets/Stamp and Signature/Stamp and Signature.png", import.meta.url));
let assets;
async function invoiceAssets() {
  assets ??= Promise.all([sharp(logoPath).png().toBuffer(), sharp(qr).png().toBuffer(), sharp(stampPath).png().toBuffer()]).catch((error) => { assets = undefined; throw error; });
  return assets;
}

// All layout dimensions are in points. PDFKit flows long client details and notes
// between the reserved, repeated letterhead and footer on subsequent A4 pages.
export async function invoicePdf(invoice) {
  const [logo, paymentQr, stamp] = await invoiceAssets();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 125, left: 38, right: 38, bottom: 70 }, bufferPages: true, info: { Title: `Invoice ${invoice.invoiceNumber}`, Author: invoiceCompany } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    const left = 38, width = doc.page.width - 76, right = left + width, ink = "#23334a", muted = "#68758a", plum = "#71314f", gold = "#b89358", lineColor = "#e0e5ec";
    let flowStyle = { size: 9, color: ink };
    const text = (value, x, y, size = 9, color = ink, options = {}) => {
      flowStyle = { size, color };
      return doc.font("Invoice").fontSize(size).fillColor(color).text(String(value), x, y, options);
    };
    const rule = (y, x1 = left, x2 = right, color = lineColor) => doc.moveTo(x1, y).lineTo(x2, y).lineWidth(.6).strokeColor(color).stroke();
    const page = () => {
      const previousStyle = flowStyle;
      doc.page.margins.bottom = 0;
      doc.rect(left, 26, width, 3).fill(plum);
      doc.image(logo, left, 40, { fit: [145, 43] });
      text(invoice.invoiceType === "tax_invoice" ? "TAX INVOICE" : "INVOICE", right - 210, 40, 20, plum, { width: 210, align: "right" });
      text(invoiceCompany, left, 89, 9, plum, { width: 260 });
      text(`${invoice.invoiceNumber}  |  ${invoiceDateLabel(invoice.invoiceDate)}`, right - 260, 89, 8.5, muted, { width: 260, align: "right" });
      rule(111, left, right, gold);
      rule(787, left, right, gold);
      text(invoiceCompany, left, 796, 7.5, plum, { width: width - 60 });
      text("Thank you for choosing Eternal India!", left, 810, 7.5, muted, { width: width - 60 });
      doc.page.margins.bottom = 70;
      flowStyle = previousStyle; doc.font("Invoice").fontSize(flowStyle.size).fillColor(flowStyle.color);
      doc.x = left; doc.y = 125;
    };
    const ensure = (height) => { if (doc.y + height > doc.page.height - 70) doc.addPage(); };
    try {
      doc.registerFont("Invoice", font); doc.on("pageAdded", page); page();
      text("TO:", left, doc.y, 8, muted, { width });
      text(invoice.clientName, left, doc.y + 5, 13, ink, { width, lineGap: 2 });
      if (invoice.recipientDetails) text(invoice.recipientDetails, left, doc.y + 3, 9, muted, { width, lineGap: 2 });
      doc.y += 18;
      doc.font("Invoice").fontSize(9);
      const descriptionHeight = doc.heightOfString(invoice.description, { width: 235, lineGap: 2 });
      const rowHeight = Math.max(38, descriptionHeight + 18), tableHeight = 25 + rowHeight + 43;
      ensure(tableHeight + 14);
      const tableY = doc.y, xs = [left + 12, left + 265, left + 321, left + 415], ws = [235, 44, 82, 92];
      doc.roundedRect(left, tableY, width, 25, 3).fill("#f2f4f8");
      ["Description", "Quantity", "Rate", "Amount"].forEach((label, i) => text(label, xs[i], tableY + 7, 8, muted, { width: ws[i], align: i ? "right" : "left" }));
      [invoice.description, invoice.totalPerson, invoiceMoney(invoice.perPersonAmount), invoiceMoney(invoice.totalAmount)].forEach((value, i) => text(value, xs[i], tableY + 35, 9, ink, { width: ws[i], align: i ? "right" : "left", lineGap: 2 }));
      const totalY = tableY + 25 + rowHeight;
      rule(totalY); text("TOTAL AMOUNT", left + 245, totalY + 11, 9, muted, { width: 120 });
      text(invoiceMoney(invoice.totalAmount), left + 365, totalY + 8, 15, plum, { width: width - 377, align: "right" });
      doc.y = totalY + 49;
      ensure(180);
      const payY = doc.y;
      doc.roundedRect(left, payY, width, 171, 6).lineWidth(.7).strokeColor(lineColor).stroke();
      doc.image(paymentQr, left + 17, payY + 12, { fit: [135, 125], align: "center", valign: "center" });
      text("SCAN & PAY", left + 12, payY + 145, 8.5, plum, { width: 145, align: "center" });
      doc.moveTo(left + 170, payY + 14).lineTo(left + 170, payY + 156).strokeColor(lineColor).stroke();
      const bankX = left + 187, bankWidth = width - 202;
      text("BANK ACCOUNT DETAILS", bankX, payY + 14, 9, plum, { width: bankWidth });
      let bankY = payY + 39;
      for (const [key, label] of Object.entries(bankLabels)) {
        doc.font("Invoice").fontSize(8);
        const valueHeight = Math.max(14, doc.heightOfString(invoice.companyBankDetails[key], { width: bankWidth - 77 }));
        text(`${label}:`, bankX, bankY, 8, muted, { width: 73 });
        text(invoice.companyBankDetails[key], bankX + 77, bankY, 8, ink, { width: bankWidth - 77 });
        bankY += valueHeight + 3;
      }
      doc.y = payY + 187;
      if (invoice.notes) {
        ensure(38); text("NOTES", left, doc.y, 8, plum, { width }); doc.y += 4;
        for (const [index, note] of invoice.notes.split("\n").filter(Boolean).entries()) {
          ensure(24); text(`${index + 1}. ${note}`, left, doc.y, 7.5, muted, { width, lineGap: 1.5 }); doc.y += 3;
        }
      }
      ensure(100);
      const signatureY = doc.y + 4;
      doc.image(stamp, right - 215, signatureY, { fit: [205, 72], align: "center", valign: "center" });
      rule(signatureY + 74, right - 215, right - 10, gold);
      text("Authorized Signature / Company Stamp", right - 225, signatureY + 80, 7.5, muted, { width: 225, align: "center" });
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i); doc.page.margins.bottom = 0;
        text(`${i + 1} / ${range.count}`, right - 45, 802, 7.5, muted, { width: 45, align: "right", lineBreak: false });
      }
      doc.end();
    } catch (error) { reject(error); doc.end(); }
  });
}
