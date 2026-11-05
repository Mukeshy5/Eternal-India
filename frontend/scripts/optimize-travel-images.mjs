import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Run from frontend with FFmpeg installed. Originals remain in src/assets.
const sources = {
  "golden-triangle": ["Tour Package/Golden Triangle", "Golden Triangle journey through Delhi, Agra and Jaipur"],
  "rajasthan-tour": ["Tour Package/Rajasthan Tour", "Historic architecture in Rajasthan"],
  "varanasi-tour": ["Tour Package/Varanasi Tour", "Varanasi and its riverfront ghats"],
  "manali-volvo-package": ["Tour Package/Manali volvo Package", "Mountain scenery around Manali"],
  rajasthan: ["NORTH INDIA/RAJASTHAN", "Rajasthan's historic architecture"],
  "himachal-pradesh": ["NORTH INDIA/HIMACHAL PRADESH", "Mountain landscapes in Himachal Pradesh"],
  "uttar-pradesh": ["NORTH INDIA/UTTAR PRADESH", "Heritage and sacred places in Uttar Pradesh"],
  uttarakhand: ["NORTH INDIA/UTTRAKHAND", "The Himalayan landscape of Uttarakhand"],
  kerala: ["SOUTH INDIA/KERALA", "Kerala's green landscapes"],
  karnataka: ["SOUTH INDIA/KARNATAKA", "Karnataka's architectural heritage"],
  "tamil-nadu": ["SOUTH INDIA/TAMIL NADU", "Temple architecture in Tamil Nadu"],
  "andhra-pradesh": ["SOUTH INDIA/ANDHRA PRADESH", "A view of Andhra Pradesh"],
  bihar: ["EAST INDIA/BIHAR", "Bihar's spiritual and architectural heritage"],
  sikkim: ["EAST INDIA/SIKKIM", "Himalayan scenery in Sikkim"],
  nagaland: ["EAST INDIA/NAGALAND", "Landscapes and culture of Nagaland"],
  jharkhand: ["EAST INDIA/JHARKHAND", "Natural scenery in Jharkhand"],
  "west-bengal": ["EAST INDIA/WEST BENGAL", "A view of West Bengal"],
  "madhya-pradesh": ["CENTRAL INDIA/MADHYA PRADESH", "Historic architecture in Madhya Pradesh"],
  "india-uttarakhand": ["India/Uttarakhanad", "Uttarakhand's mountain scenery"],
  jaipur: ["India/Jaipur", "Architecture of Jaipur, Rajasthan"],
  kashmir: ["India/Kashmir", "The mountain landscape of Kashmir"],
  andaman: ["India/Andaman", "The coastline of the Andaman Islands"],
  "kathmandu-tour": ["India/Nepal", "Heritage and scenery in Nepal"],
  "sri-lanka-5d-4n": ["India/Sri Lanka", "Sri Lanka's landscapes and heritage"],
};

const output = resolve("public/images/travel");
mkdirSync(output, { recursive: true });
let originalBytes = 0;
let optimizedBytes = 0;
const images = {};
for (const [slug, [directory, alt]] of Object.entries(sources)) {
  const folder = resolve("src/assets", directory);
  const files = readdirSync(folder).filter((file) => /\.(jpe?g|webp)$/i.test(file))
    .sort((a, b) => Number(a.includes("(")) - Number(b.includes("(")) || a.localeCompare(b));
  images[slug] = files.map((file, index) => {
    const source = resolve(folder, file);
    originalBytes += statSync(source).size;
    const variants = [640, 1280].map((width) => {
      const name = `${slug}-${index + 1}-${width}.webp`;
      const target = resolve(output, name);
      const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-vf", `scale=${width}:-2`, "-frames:v", "1", "-c:v", "libwebp", "-quality", "78", "-compression_level", "5", target], { encoding: "utf8", windowsHide: true });
      if (result.status !== 0) throw new Error(result.error?.message || result.stderr);
      optimizedBytes += statSync(target).size;
      return `/images/travel/${name}`;
    });
    return { src: variants[1], srcSet: `${variants[0]} 640w, ${variants[1]} 1280w`, alt };
  });
  console.log(`Optimized ${slug}: ${files.length} photos`);
}
writeFileSync(resolve("src/Common/travelImages.js"), `// Generated from supplied src/assets photos by scripts/optimize-travel-images.mjs.\nexport const travelImages = ${JSON.stringify(images, null, 2)};\n`);
console.log(`${Object.values(images).flat().length} photos: ${(originalBytes / 1048576).toFixed(1)} MiB originals → ${(optimizedBytes / 1048576).toFixed(1)} MiB including both responsive sizes.`);
