import PDFDocument from "pdfkit";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { letterDate, letterFacts, letterTypes } from "../../shared/employmentLetters.js";
import { certificationImage } from "./certifications.js";

let logoPromise;
export async function employmentLetterPdf(letter, { preview = false, certification } = {}) {
  logoPromise ??= sharp(fileURLToPath(new URL("../../frontend/public/logo.webp", import.meta.url))).png().toBuffer().catch((error) => { logoPromise = undefined; throw error; });
  const logo = await logoPromise;
  // Resolve bytes before creating pages. A failed image must never issue a PDF
  // with a silently missing certification footer.
  certification ??= await certificationImage(null, letter.company.certificationImageId);
  const bottom = 152;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 150, bottom, left: 52, right: 52 }, bufferPages: true, info: { Title: `${letterTypes[letter.type]} - ${letter.letterNumber}`, Author: letter.company.name, Subject: letter.employee.employeeId } });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    try {
      doc.registerFont("Letter", fileURLToPath(new URL("../staff/fonts/NotoSansDevanagari.ttf", import.meta.url)));
      const width = doc.page.width - 104, ink = "#243d4b", muted = "#627480";
      // Reuse image objects on every page to keep long PDFs compact.
      const logoImage = doc.openImage(logo), footerImage = doc.openImage(certification.bytes);
      doc.font("Letter").fontSize(13);
      const nameHeight = doc.heightOfString(letter.company.name, { width: width - 158 });
      doc.fontSize(8);
      const addressHeight = doc.heightOfString(letter.company.address, { width: width - 158 });
      const headerLine = Math.max(101, 29 + nameHeight + 3 + addressHeight + 18), bodyTop = headerLine + 27;
      const header = () => {
        doc.save();
        doc.rect(0, 0, doc.page.width, 7).fill("#526d68");
        doc.image(logoImage, 52, 27, { fit: [138, 45] });
        doc.font("Letter").fontSize(13).fillColor(ink).text(letter.company.name, 210, 29, { width: width - 158, align: "right" });
        doc.fontSize(8).fillColor(muted).text(letter.company.address, 210, doc.y + 3, { width: width - 158, align: "right" });
        doc.moveTo(52, headerLine).lineTo(doc.page.width - 52, headerLine).strokeColor("#d9e3e4").stroke();
        if (preview) doc.font("Helvetica-Bold").fontSize(8).fillColor("#9c5a29").text("DRAFT PREVIEW - NOT ISSUED", 52, headerLine + 11, { width, align: "right", lineBreak: false });
        doc.restore(); doc.page.margins.top = bodyTop; doc.x = 52; doc.y = bodyTop;
        doc.font("Letter").fontSize(10).fillColor(ink);
      };
      header(); doc.on("pageAdded", header);
      const paragraph = (value, size = 10) => { doc.font("Letter").fontSize(size).fillColor(ink).text(value, 52, doc.y, { width, lineGap: 1.6, paragraphGap: 4 }); doc.moveDown(0.25); };
      const keep = (height) => { if (doc.y + height > doc.page.height - bottom) doc.addPage(); };
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
      doc.font("Letter").fontSize(10);
      const signatory = `${letter.company.signatory}${letter.company.signatoryTitle ? `\n${letter.company.signatoryTitle}` : ""}`;
      const signatureHeight = doc.heightOfString(`For ${letter.company.name}`, { width }) + doc.heightOfString(signatory, { width }) + 30;
      keep(signatureHeight); doc.moveDown(0.5);
      paragraph(`For ${letter.company.name}`, 10);
      doc.moveDown(0.7); paragraph(signatory, 10);
      if (letter.type === "joining") { keep(49); doc.moveDown(0.3); paragraph("Employee acceptance\nSignature: ________________________    Date: ______________", 9); }
      const pages = doc.bufferedPageRange();
      for (let page = 0; page < pages.count; page++) {
        doc.switchToPage(page);
        // Footer text is below the body margin. Temporarily release that margin
        // so PDFKit cannot create extra pages while drawing page numbers.
        const bottomMargin = doc.page.margins.bottom; doc.page.margins.bottom = 0;
        const footerTop = doc.page.height - 137;
        doc.moveTo(52, footerTop).lineTo(doc.page.width - 52, footerTop).strokeColor("#a4b7af").stroke();
        doc.font("Helvetica").fontSize(6.5).fillColor(muted).text("COMPANY CERTIFICATION", 52, footerTop + 9, { width, align: "center", lineBreak: false });
        doc.image(footerImage, 52, footerTop + 23, { fit: [width, 56], align: "center", valign: "center" });
        doc.moveTo(52, doc.page.height - 55).lineTo(doc.page.width - 52, doc.page.height - 55).strokeColor("#e4eae7").stroke();
        const contact = [letter.company.phone, letter.company.website].filter(Boolean).join("  |  ");
        doc.font("Letter");
        let contactSize = 7;
        while (doc.fontSize(contactSize).heightOfString(contact, { width: width - 75 }) > 20 && contactSize > 4) contactSize -= 0.5;
        doc.fontSize(contactSize).fillColor(muted).text(contact, 52, doc.page.height - 46, { width: width - 75, height: 20 });
        doc.font("Helvetica").fontSize(7).text(`${page + 1} / ${pages.count}`, doc.page.width - 110, doc.page.height - 44, { width: 58, align: "right", lineBreak: false });
        doc.page.margins.bottom = bottomMargin;
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
