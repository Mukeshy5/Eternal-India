import { createReadStream, createWriteStream } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { GridFSBucket } from "mongodb";
import { fail } from "./catalog.js";

export const backupBucketName = "data_control_backup_files";

export function createMongoBackupStore(db) {
  const bucket = new GridFSBucket(db, { bucketName: backupBucketName });
  return {
    async initialize() {
      await Promise.all([
        db.collection(`${backupBucketName}.files`).createIndex({ filename: 1, uploadDate: 1 }),
        db.collection(`${backupBucketName}.chunks`).createIndex({ files_id: 1, n: 1 }, { unique: true }),
      ]);
    },
    async save(id, path, sha256) {
      const upload = bucket.openUploadStreamWithId(id, `${id}.ndjson.gz`, { metadata: { sha256 } });
      try { await pipeline(createReadStream(path), upload); }
      catch (error) { await upload.abort().catch(() => {}); throw error; }
    },
    async materialize(id, path) {
      const temporary = `${path}.${randomUUID()}.download`;
      try {
        await pipeline(bucket.openDownloadStream(id), createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
        await rename(temporary, path);
      } catch (error) {
        await unlink(temporary).catch(() => {});
        if (/FileNotFound|ChunkMissing|ChunkIsWrongSize|ExtraChunk|chunk.*(?:missing|wrong)/i.test(error.message)) throw fail(409, "The stored backup is missing or corrupt. Deletion and restore are blocked.");
        throw fail(503, "Backup storage is unavailable. Please retry after MongoDB reconnects.");
      }
    },
    async remove(id) {
      // Also remove chunks from an interrupted upload with no completed file row.
      await db.collection(`${backupBucketName}.files`).deleteOne({ _id: id });
      await db.collection(`${backupBucketName}.chunks`).deleteMany({ files_id: id });
    },
    async bytes() {
      const totals = await db.collection(`${backupBucketName}.files`).aggregate([{ $group: { _id: null, bytes: { $sum: "$length" } } }]).toArray();
      return totals[0]?.bytes || 0;
    },
  };
}
