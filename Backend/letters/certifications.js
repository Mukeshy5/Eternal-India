import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { companyCertifications, defaultCertificationImageId } from "../../shared/companyCertifications.js";

export const certificationCollection = "employment_letter_images";
let existingArtwork;
const imageError = (message, status = 400) => Object.assign(new Error(message), { status, publicMessage: true, details: { errors: { "company.certificationImageId": message } } });

export async function normalizeCertification(file) {
  if (!file?.buffer?.length) throw imageError("Upload a company certification image.");
  try {
    const image = sharp(file.buffer, { limitInputPixels: 16000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error("Unsupported image");
    const { data, info } = await image.rotate().resize({ width: 1800, height: 420, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).png().toBuffer({ resolveWithObject: true });
    return { _id: createHash("sha256").update(data).digest("hex"), bytes: data, width: info.width, height: info.height };
  } catch { throw imageError("Use a valid PNG, JPEG or WebP certification image, up to 5 MB and 16 megapixels."); }
}

export async function certificationImage(db, id = defaultCertificationImageId) {
  if (id === defaultCertificationImageId) {
    // Use the real artwork already uploaded to the project, never a substitute.
    existingArtwork ??= (async () => {
      const cells = await Promise.all(companyCertifications.map(async ({ file }, index) => ({
        input: await sharp(fileURLToPath(new URL(`../../frontend/src/assets/CompanyCertification/${file}`, import.meta.url))).resize(300, 180, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer(),
        left: index * 328 + 14, top: 15,
      })));
      const bytes = await sharp({ create: { width: 1640, height: 210, channels: 3, background: "#ffffff" } }).composite(cells).png().toBuffer();
      return { _id: id, bytes, width: 1640, height: 210 };
    })().catch((error) => { existingArtwork = undefined; throw error; });
    return existingArtwork;
  }
  if (!/^[a-f0-9]{64}$/.test(id || "")) throw imageError("Choose a saved company certification image.");
  const record = await db.collection(certificationCollection).findOne({ _id: id });
  if (!record) throw imageError("The company certification image is unavailable. Upload it again in company settings.", 404);
  return { ...record, bytes: Buffer.from(record.bytes.buffer ?? record.bytes) };
}

export const certificationResponse = (image) => ({ imageId: image._id, width: image.width, height: image.height, dataUrl: `data:image/png;base64,${image.bytes.toString("base64")}` });
