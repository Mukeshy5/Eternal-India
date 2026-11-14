import PDFDocument from "pdfkit";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { letterDate, letterFacts, letterTypes } from "../../shared/employmentLetters.js";

let logoPromise;
export async function employmentLetterPdf(letter, { preview = false } = {}) {
  logoPromise ??= sharp(fileURLToPath(new URL("../../frontend/public/logo.webp", import.meta.url))).png().toBuffer().catch((error) => { logoPromise = undefined; throw error; });
  const logo = await logoPromise;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 150, bottom: 74, left: 52, right: 52 }, bufferPages: true, info: { Title: `${letterTypes[letter.type]} - ${letter.letterNumber}`, Author: letter.company.name, Subject: letter.employee.employeeId } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    try {
      doc.registerFont("Letter", fileURLToPath(new URL("../staff/fonts/NotoSansDevanagari.ttf", import.meta.url)));
      const width = doc.page.width - 104, ink = "#243d4b", muted = "#627480";
      doc.font("Letter").fontSize(13);
      const nameHeight = doc.heightOfString(letter.company.name, { width: width - 158 });
      doc.fontSize(8);
      const addressHeight = doc.heightOfString(letter.company.address, { width: width - 158 });
      const headerLine = Math.max(119, 29 + nameHeight + 3 + addressHeight + 18), bodyTop = headerLine + 35;
      const header = () => {
        doc.save();
        doc.rect(0, 0, doc.page.width, 7).fill("#526d68");
        doc.image(logo, 52, 27, { fit: [138, 45] });
        doc.font("Letter").fontSize(13).fillColor(ink).text(letter.company.name, 210, 29, { width: width - 158, align: "right" });
        doc.fontSize(8).fillColor(muted).text(letter.company.address, 210, doc.y + 3, { width: width - 158, align: "right" });
        doc.moveTo(52, headerLine).lineTo(doc.page.width - 52, headerLine).strokeColor("#d9e3e4").stroke();
        if (preview) doc.font("Helvetica-Bold").fontSize(8).fillColor("#9c5a29").text("DRAFT PREVIEW - NOT ISSUED", 52, headerLine + 11, { width, align: "right", lineBreak: false });
        doc.restore(); doc.page.margins.top = bodyTop; doc.x = 52; doc.y = bodyTop;
        doc.font("Letter").fontSize(10).fillColor(ink);
      };
      header(); doc.on("pageAdded", header);
      const paragraph = (value, size = 10) => { doc.font("Letter").fontSize(size).fillColor(ink).text(value, 52, doc.y, { width, lineGap: 2, paragraphGap: 5 }); doc.moveDown(0.35); };
      const keep = (height) => { if (doc.y + height > doc.page.height - 74) doc.addPage(); };
      paragraph(letterTypes[letter.type].toUpperCase(), 19);
      paragraph(`Reference: ${letter.letterNumber}\nIssue date: ${letterDate(letter.issueDate)}`, 9);
      doc.moveDown(0.4);
      const facts = letterFacts(letter), columnWidth = (width - 32) / 2;
      for (let index = 0; index < facts.length; index += 2) {
        doc.font("Letter").fontSize(9);
        const values = facts.slice(index, index + 2).map(([label, value]) => `${label}: ${value}`);
        const height = Math.max(...values.map((value) => doc.heightOfString(value, { width: columnWidth, lineGap: 2 }))) + 14;
        keep(height); const y = doc.y;
        values.forEach((value, column) => doc.font("Letter").fontSize(9).fillColor(ink).text(value, 52 + column * (columnWidth + 32), y, { width: columnWidth, lineGap: 2 }));
        doc.x = 52; doc.y = y + height;
      }
      doc.moveDown(0.6);
      paragraph(letter.content);
      for (const [label, value] of [["Terms and conditions", letter.terms], ["Job responsibilities", letter.responsibilities], ["Performance and conduct", letter.performance]]) {
        if (!value) continue;
        keep(60); paragraph(label.toUpperCase(), 10); paragraph(value);
      }
      keep(100); doc.moveDown(0.7);
      paragraph(`For ${letter.company.name}`, 10);
      doc.moveDown(0.9); paragraph(`${letter.company.signatory}${letter.company.signatoryTitle ? `\n${letter.company.signatoryTitle}` : ""}`, 10);
      if (letter.type === "joining") { keep(60); doc.moveDown(0.4); paragraph("Employee acceptance\nSignature: ________________________    Date: ______________", 9); }
      const pages = doc.bufferedPageRange();
      for (let page = 0; page < pages.count; page++) {
        doc.switchToPage(page);
        // Footer text is below the body margin. Temporarily release that margin
        // so PDFKit cannot create extra pages while drawing page numbers.
        const bottomMargin = doc.page.margins.bottom; doc.page.margins.bottom = 0;
        doc.moveTo(52, doc.page.height - 55).lineTo(doc.page.width - 52, doc.page.height - 55).strokeColor("#d9e3e4").stroke();
        const contact = [letter.company.phone, letter.company.website].filter(Boolean).join("  |  ");
        doc.font("Letter").fontSize(7);
        const contactSize = doc.heightOfString(contact, { width: width - 75 }) > 32 ? 6 : 7;
        doc.fontSize(contactSize).fillColor(muted).text(contact, 52, doc.page.height - 47, { width: width - 75, height: 32 });
        doc.font("Helvetica").text(`${page + 1} / ${pages.count}`, doc.page.width - 110, doc.page.height - 45, { width: 58, align: "right", lineBreak: false });
        doc.page.margins.bottom = bottomMargin;
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
