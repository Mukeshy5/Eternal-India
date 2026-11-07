import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import sharp from "sharp";
import bwipjs from "bwip-js";
import PDFDocument from "pdfkit";

export const cardSize = { widthMm: 53.98, heightMm: 85.60, dpi: 600 };
const width = 539.8, height = 856;
const xml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
const bufferOf = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value.buffer);
let assets;
function loadAssets() {
  assets ??= Promise.all([
    readFile(new URL("./fonts/NotoSansDevanagari.ttf", import.meta.url)),
    sharp(fileURLToPath(new URL("../../frontend/public/logo.webp", import.meta.url))).png().toBuffer(),
  ]).then(([font, logo]) => {
    const family = fontkit.create(font);
    return { normal: family.getVariation({ wght: 400 }), bold: family.getVariation({ wght: 700 }), logo: logo.toString("base64") };
  }).catch((error) => { assets = null; throw error; });
  return assets;
}

export async function validateStaffPhoto(photo) {
  const input = bufferOf(photo);
  const metadata = await sharp(input, { limitInputPixels: 16000000 }).metadata();
  if (!["png", "jpeg"].includes(metadata.format) || metadata.width > 4096 || metadata.height > 4096) throw new Error("Use a JPEG or PNG photo no larger than 4096 pixels on either side.");
  await sharp(input, { limitInputPixels: 16000000 }).resize(32, 32, { fit: "inside" }).png().toBuffer();
}

// One self-contained vector template is used by preview, PNG, PDF and printing.
// Glyph outlines preserve Hindi shaping without relying on device-installed fonts.
export async function cardSvg(staff) {
  const { normal, bold, logo } = await loadAssets();
  const layouts = new Map();
  const layout = (text, font) => {
    const key = `${font === bold ? "bold" : "normal"}:${text}`;
    if (!layouts.has(key)) layouts.set(key, font.layout(text));
    return layouts.get(key);
  };
  const measure = (text, size, font) => layout(text, font).positions.reduce((sum, position) => sum + position.xAdvance, 0) / font.unitsPerEm * size;
  const graphemes = (text) => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
  function linesFor(text, maxWidth, size, font) {
    const lines = []; let line = "";
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size, font) <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const character of graphemes(word)) {
        if (line && measure(line + character, size, font) > maxWidth) { lines.push(line); line = ""; }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
  function text(value, x, y, maxWidth, size = 18, { weight = 400, align = "left", maxLines = 1, minSize = 10 } = {}) {
    const font = weight === 700 ? bold : normal;
    const clean = String(value ?? "").trim().replace(/[\x00-\x1f\x7f]/g, " ");
    let lines;
    for (; size >= minSize; size -= 0.5) { lines = linesFor(clean, maxWidth, size, font); if (lines.length <= maxLines) break; }
    size = Math.max(size, minSize);
    return lines.slice(0, maxLines).map((line, index) => {
      const run = layout(line, font), scale = size / font.unitsPerEm;
      const left = align === "center" ? x + (maxWidth - measure(line, size, font)) / 2 : x;
      let advance = 0;
      const paths = run.glyphs.map((glyph, glyphIndex) => {
        const position = run.positions[glyphIndex];
        const result = `<path transform="translate(${advance + position.xOffset},${position.yOffset})" d="${glyph.path.toSVG()}"/>`;
        advance += position.xAdvance; return result;
      }).join("");
      return `<g transform="translate(${left},${y + font.ascent * scale + index * size * 1.3}) scale(${scale},${-scale})">${paths}</g>`;
    }).join("");
  }
  const barcode = bwipjs.toSVG({ bcid: "code128", text: staff.employeeId, scale: 2, height: 10, includetext: false, paddingwidth: 12, paddingheight: 2, barcolor: "111827", backgroundcolor: "FFFFFF" });
  const barcodeViewBox = barcode.match(/viewBox="([^"]+)"/)[1];
  const barcodeBody = barcode.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const photo = (await sharp(bufferOf(staff.photo), { limitInputPixels: 16000000 }).rotate().resize(600, 600, { fit: "cover", position: "centre" }).png().toBuffer()).toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="card-title">
    <title id="card-title">${xml(staff.name)} - ${xml(staff.employeeId)} - Eternal India employee ID card</title>
    <desc>${xml(`${staff.name}; ${staff.designation}; ${staff.department}; ${staff.employeeId}; ${staff.phone}; ${staff.email}`)}</desc>
    <defs><clipPath id="employee-photo"><circle cx="269.9" cy="246" r="84"/></clipPath></defs>
    <rect width="539.8" height="856" fill="#ffffff"/>
    <path d="M0 164L539.8 118V277L0 323Z" fill="#111a2b"/>
    <path d="M0 149L539.8 103V121L0 167Z" fill="#d42a45"/>
    <path d="M431 128L539.8 119V222Z" fill="#223047"/>
    <path d="M0 276L124 265L0 323Z" fill="#26354c"/>
    <image x="119.9" y="21" width="300" height="89" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,${logo}"/>
    <g fill="#526070">${text("EMPLOYEE IDENTITY", 120, 107, 300, 11, { align: "center" })}</g>
    <circle cx="269.9" cy="249" r="99" fill="#111a2b" opacity=".08"/>
    <circle cx="269.9" cy="246" r="97" fill="#ffffff"/>
    <circle cx="269.9" cy="246" r="90" fill="#d42a45"/>
    <image x="185.9" y="162" width="168" height="168" preserveAspectRatio="xMidYMid slice" clip-path="url(#employee-photo)" xlink:href="data:image/png;base64,${photo}"/>
    <g fill="#111a2b">${text(staff.name, 39.9, 365, 460, 30, { weight: 700, align: "center", maxLines: 2, minSize: 17 })}</g>
    <g fill="#d42a45">${text(staff.designation, 44.9, 438, 450, 21, { weight: 700, align: "center", maxLines: 2, minSize: 14 })}</g>
    <g fill="#647084">${text(staff.department, 44.9, 490, 450, 17, { align: "center", maxLines: 2, minSize: 13 })}</g>
    <rect x="240.9" y="532" width="58" height="3" rx="1.5" fill="#d42a45"/>
    <g fill="#7b8493">${text("EMPLOYEE ID", 48, 555, 235, 12)}${text("PHONE NUMBER", 290, 555, 202, 12)}${text("EMAIL ADDRESS", 48, 620, 443.8, 12)}</g>
    <g fill="#182337">${text(staff.employeeId, 48, 578, 235, 19, { weight: 700 })}${text(staff.phone, 290, 578, 202, 17, { minSize: 11 })}${text(staff.email, 48, 644, 443.8, 17, { maxLines: 3, minSize: 10 })}</g>
    <path d="M48 715H491.8" stroke="#e7e9ee" stroke-width="1"/>
    <svg x="57.9" y="744" width="424" height="54" viewBox="${barcodeViewBox}" preserveAspectRatio="none">${barcodeBody}</svg>
    <g fill="#566174">${text(staff.employeeId, 60, 806, 419.8, 12, { align: "center" })}</g>
    <path d="M0 739L20 719V798L0 818Z" fill="#d42a45"/>
    <path d="M0 837H539.8V856H0Z" fill="#111a2b"/>
    <path d="M448 856L539.8 764V856Z" fill="#d42a45"/>
    <path d="M485 856L539.8 801V819L503 856Z" fill="#f26376"/>
  </svg>`;
}

export async function cardPng(staff) {
  const svg = await cardSvg(staff);
  return sharp(Buffer.from(svg), { density: 240 }).resize(Math.round(cardSize.widthMm / 25.4 * cardSize.dpi), Math.round(cardSize.heightMm / 25.4 * cardSize.dpi), { fit: "fill" }).png().withMetadata({ density: cardSize.dpi }).toBuffer();
}

export async function cardPdf(staff) {
  const png = await cardPng(staff);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [cardSize.widthMm * 72 / 25.4, cardSize.heightMm * 72 / 25.4], margin: 0, info: { Title: `${staff.employeeId} - Eternal India Employee ID Card` } });
    const chunks = []; doc.on("data", (chunk) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    try { doc.image(png, 0, 0, { width: doc.page.width, height: doc.page.height }); doc.end(); } catch (error) { reject(error); doc.end(); }
  });
}
