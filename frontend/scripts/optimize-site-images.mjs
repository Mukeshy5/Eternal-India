import { mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { companyCertifications } from "../../shared/companyCertifications.js";

// Rebuild display-sized derivatives without changing the supplied originals.
const sharp = createRequire(new URL("../../Backend/package.json", import.meta.url))("sharp");
const sources = [
  ["SliderImg/slider (2).jpg", "site/home-hero-640.webp", 640],
  ["SliderImg/slider (2).jpg", "site/home-hero-1280.webp", 1280],
  ["SliderImg/slider (2).jpg", "site/home-hero-1920.webp", 1920],
  ["SliderImg/Phone view.jpg", "site/home-mobile.webp", 900],
  ["Plan your trip/Plan your trip.png", "site/plan-trip.webp", 900],
  ["buddhist/buddhist.jpg", "site/buddhist.webp", 1600],
  ["paymentpng/banktrasfer.png", "site/bank-transfer.webp", 400],
  ...companyCertifications.map(({ file }) => [`CompanyCertification/${file}`, `certifications/${file.replace(/\.png$/i, ".webp")}`, 900]),
];
for (const [input, output, width] of sources) {
  const from = new URL(`../src/assets/${input}`, import.meta.url);
  const to = new URL(`../public/images/${output}`, import.meta.url);
  await mkdir(new URL(".", to), { recursive: true });
  await sharp(fileURLToPath(from)).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82, effort: 6 }).toFile(fileURLToPath(to));
  console.log(`${output}: ${Math.round((await stat(to)).size / 1024)} KiB (original ${Math.round((await stat(from)).size / 1024)} KiB)`);
}
