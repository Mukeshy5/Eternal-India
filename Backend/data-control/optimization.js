import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { unlink, lstat } from "node:fs/promises";
import sharp from "sharp";
import { bytesOf, ejson, fail, DAY } from "./catalog.js";
import { walkFiles, safePath } from "./service.js";

const assets = [
  { collection: "offer_images", owners: "tour_promotions", field: "offerImage", prefix: "/api/offer-images/" },
  { collection: "decoration_assets", owners: "festival_decorations", field: "bannerImage", prefix: "/api/public/festival-assets/" },
];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const binary = value => Buffer.isBuffer(value) ? value : Buffer.from(value.buffer);
const ownerReference = (spec, id) => ({ [spec.field]: { $regex: `^${spec.prefix}${id}$`, $options: "i" } });
async function fileHash(path) { const hash = createHash("sha256"); for await (const part of createReadStream(path)) hash.update(part); return hash.digest("hex"); }
export async function inspectOptimization(control) {
  const groups = new Map(), unused = []; let unusedBytes = 0, duplicateBytes = 0;
  for (const spec of assets) for await (const record of control.db.collection(spec.collection).find({}, { promoteValues: false }).batchSize(25)) {
    if (!record.data) continue;
    const bytes = binary(record.data), hash = sha(bytes), item = { collection: spec.collection, id: String(record._id), bytes: bytes.length, sha256: hash };
    if (groups.has(hash)) { groups.get(hash).push(item); duplicateBytes += bytes.length; } else groups.set(hash, [item]);
    const referenced = await control.db.collection(spec.owners).findOne(ownerReference(spec, record._id), { projection: { _id: 1 } });
    if (!referenced && record.createdAt instanceof Date && Date.now() - record.createdAt.getTime() > DAY) { unused.push(item); unusedBytes += bytesOf(record); }
  }
  const files = [];
  for (const [kind, root] of [["upload", control.uploadRoot], ["temporary", control.tempRoot]]) for (const file of await walkFiles(root)) {
    const item = { kind, name: file.name, bytes: file.bytes, sha256: await fileHash(file.path), expired: kind === "temporary" && Date.now() - file.modifiedAt.getTime() > DAY };
    files.push(item);
    const key = `file:${item.sha256}`; if (groups.has(key)) { groups.get(key).push(item); duplicateBytes += file.bytes; } else groups.set(key, [item]);
  }
  return { unused: unused.slice(0, 1000), unusedCount: unused.length, unusedBytes, duplicateBytes, duplicates: [...groups.values()].filter(items => items.length > 1).slice(0, 1000), expiredTemporary: files.filter(file => file.expired).slice(0, 1000), scannedAt: new Date(), note: "Duplicates and external uploaded files are reported for review. Saved references are always retained. Only expired temporary files and unreferenced temporary images qualify for optimization." };
}
export async function optimizeStorage(control, actor, confirmation, check) {
  if (confirmation !== "OPTIMIZE STORAGE") throw fail(400, "Confirm storage optimization before continuing.");
  const scan = await inspectOptimization(control), backup = await control.createBackup({ actor, reason: "before-optimization", check });
  const backed = new Map(), backedFiles = new Map();
  await control.readBackup(backup._id, async (name, record) => {
    if (assets.some(spec => spec.collection === name)) backed.set(`${name}:${record._id}`, sha(ejson(record)));
  }, async (event, item) => { if (event === "end") backedFiles.set(`${item.kind}:${item.name}`, item.sha256); });
  const report = { removedImages: 0, optimizedImages: 0, removedTemporaryFiles: 0, releasedDocumentBytes: 0, backupId: backup._id };
  await control.audit(actor, "optimization.started", report);
  try {
    for (const candidate of scan.unused) {
      await check(); const spec = assets.find(item => item.collection === candidate.collection);
      const { ObjectId } = await import("mongodb");
      const record = await control.db.collection(spec.collection).findOne({ _id: new ObjectId(candidate.id) }, { promoteValues: false });
      if (!record || backed.get(`${spec.collection}:${record._id}`) !== sha(ejson(record))) continue;
      if (await control.db.collection(spec.owners).findOne(ownerReference(spec, record._id), { projection: { _id: 1 } })) continue;
      // Deletion is atomic only while the document is unchanged. Owner writes use a shared maintenance lock.
      const result = await control.db.collection(spec.collection).deleteOne({ _id: record._id, $expr: { $eq: ["$$ROOT", { $literal: record }] } });
      if (result.deletedCount) { report.removedImages++; report.releasedDocumentBytes += bytesOf(record); }
    }
    for (const candidate of scan.expiredTemporary) {
      await check(); const path = safePath(control.tempRoot, candidate.name), info = await lstat(path).catch(() => null);
      if (!info?.isFile() || info.isSymbolicLink() || Date.now() - info.mtimeMs < DAY || backedFiles.get(`temporary:${candidate.name}`) !== await fileHash(path)) continue;
      // All business records are searched, including nested references, before a temporary file is removed.
      let referenced = false;
      const references = [...new Set([candidate.name, candidate.name.split("/").at(-1)].flatMap(value => [value, encodeURI(value), encodeURIComponent(value)]))];
      const { businessCollections } = await import("./catalog.js");
      for (const name of businessCollections) {
        for await (const doc of control.db.collection(name).find({}).batchSize(50)) if (references.some(value => ejson(doc).toLowerCase().includes(value.toLowerCase()))) { referenced = true; break; }
        if (referenced) break;
      }
      if (!referenced) { await unlink(path); report.removedTemporaryFiles++; report.releasedDocumentBytes += info.size; }
    }
    // Existing staff photos and signed/legal documents remain intact. Future temp images can be optimized safely.
    await control.audit(actor, "optimization.completed", report); return report;
  } catch (error) { await control.audit(actor, "optimization.failed", report); throw error; }
}

// Used by image upload routes: content-addressed, bounded JPEG/PNG/WebP input, smaller bytes only.
export async function optimizedImage(bytes, contentType) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return { bytes, contentType };
  // Keep existing small uploads byte-for-byte; recompression has negligible storage benefit.
  if (bytes.length < 32768) return { bytes, contentType };
  const metadata = await sharp(bytes, { limitInputPixels: 25000000 }).metadata();
  if (metadata.pages > 1) return { bytes, contentType };
  const optimized = await sharp(bytes, { limitInputPixels: 25000000 }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  return optimized.length < bytes.length ? { bytes: optimized, contentType: "image/webp" } : { bytes, contentType };
}
