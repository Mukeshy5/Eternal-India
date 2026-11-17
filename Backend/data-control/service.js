import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, lstat, stat, rename, unlink, open, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { BSON } from "mongodb";
import { catalog, businessCollections, assetCollections, CAPACITY, DAY, fail, ejson, parse, bytesOf, sectionFor, buildFilter, storageStatus, publicRecord } from "./catalog.js";
import { createMongoBackupStore } from "./backup-store.js";

const hash = value => createHash("sha256").update(value).digest("hex");
const digest = doc => hash(ejson(doc));
const defaults = { frequency: "daily", backupRetentionDays: 30, cleanupEnabled: false, retentionDays: 90, cleanupSections: ["enquiries", "notifications"] };
const frequencies = { daily: 1, weekly: 7, monthly: 30 };
const idOf = doc => ejson(doc._id);
const exact = doc => ({ _id: doc._id, $expr: { $eq: ["$$ROOT", { $literal: doc }] } });
const nextRun = (frequency, now) => { const next = new Date(now); if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1); else next.setUTCDate(next.getUTCDate() + frequencies[frequency]); return next; };

export async function walkFiles(root) {
  const files = [];
  async function visit(dir) {
    let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT" && dir === root) return; throw error; }
    for (const entry of entries) {
      const path = resolve(dir, entry.name);
      if (entry.isSymbolicLink()) throw fail(503, "Storage directories must not contain symbolic links.");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) { const info = await stat(path); files.push({ path, name: relative(root, path).split(sep).join("/"), bytes: info.size, modifiedAt: info.mtime }); }
    }
  }
  await visit(root); return files;
}
export function safePath(root, name) {
  if (typeof name !== "string" || !name || name.includes("\\") || isAbsolute(name) || name.split("/").some(part => ["", ".", ".."].includes(part)) || name.includes(":")) throw fail(400, "Unsafe backup file path.");
  const target = resolve(root, name), rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) throw fail(400, "Unsafe backup file path.");
  return target;
}
async function fileHash(path) { const sha = createHash("sha256"); for await (const chunk of createReadStream(path)) sha.update(chunk); return sha.digest("hex"); }

export function createDataControl({ db, config = {}, clock = () => new Date() }) {
  const base = fileURLToPath(new URL("../var/", import.meta.url));
  const backupStorage = config.dataControl?.backupStorage || (config.render ? "mongodb" : "filesystem");
  const mongoBackups = backupStorage === "mongodb";
  const backupRoot = mongoBackups ? resolve(base, "backup-cache", db.databaseName) : resolve(config.dataControl?.backupDirectory || resolve(base, "backups", db.databaseName));
  const backupStore = createMongoBackupStore(db);
  const uploadRoot = resolve(config.dataControl?.uploadDirectory || resolve(base, "uploads"));
  const tempRoot = resolve(config.dataControl?.tempDirectory || resolve(base, "temporary"));
  for (const a of [backupRoot, uploadRoot, tempRoot]) for (const b of [backupRoot, uploadRoot, tempRoot]) if (a !== b && (!relative(a, b).startsWith("..") || a === b)) throw new Error("Backup, upload and temporary directories must be separate.");
  if (new Set([backupRoot, uploadRoot, tempRoot]).size !== 3) throw new Error("Backup, upload and temporary directories must be separate.");
  const backups = db.collection("data_control_backups"), runtime = db.collection("data_control_runtime");
  let timer, ticking = false, stopped = false, tickPromise;
  let writeAdmission = Promise.resolve();
  let maintenanceQueue = Promise.resolve();
  const audit = (actor, action, details = {}) => db.collection("data_control_audit").insertOne({ actor: String(actor?._id || actor || "scheduler"), action, ...details, at: clock() });
  const renderDiskRequired = !mongoBackups && config.render && process.platform === "linux" && Boolean(process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_HOSTNAME);
  async function verifyBackupMount() {
    if (renderDiskRequired) {
      const mountPath = "/var/data", mountParent = "/var";
      let mount, parent;
      try { [mount, parent] = await Promise.all([stat(mountPath), stat(mountParent)]); }
      catch (error) { throw new Error(`Render persistent disk is not mounted at /var/data. Attach the persistent disk before starting the service. ${error.message}`); }
      const mountRelative = relative(mountPath, backupRoot);
      if (mount.dev === parent.dev || mountRelative === ".." || mountRelative.startsWith(`..${sep}`) || isAbsolute(mountRelative)) {
        throw new Error("Render backups must be stored under the persistent disk mounted at /var/data.");
      }
    }
  }
  async function verifyBackupStorage() {
    let file;
    const probe = resolve(backupRoot, `.data-control-write-test-${randomUUID()}`);
    const marker = Buffer.from(randomUUID());
    try {
      file = await open(probe, "wx+", 0o600);
      await file.writeFile(marker);
      await file.sync();
      const saved = Buffer.alloc(marker.length), { bytesRead } = await file.read(saved, 0, saved.length, 0);
      if (bytesRead !== marker.length || !saved.equals(marker)) throw new Error("Backup storage write verification returned unexpected data.");
      await readdir(backupRoot);
    } catch (error) {
      throw new Error(`Data Control backup directory is not readable and writable at ${backupRoot}: ${error.message}`);
    } finally {
      await file?.close();
      await unlink(probe).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  }
  async function initialize() {
    if (!mongoBackups && config.production && (!config.dataControl?.backupDirectory || !isAbsolute(config.dataControl.backupDirectory))) {
      throw new Error("Set DATA_CONTROL_BACKUP_DIR to an absolute, persistent storage path before starting production.");
    }
    await verifyBackupMount();
    await Promise.all([mkdir(backupRoot, { recursive: true }), mkdir(uploadRoot, { recursive: true }), mkdir(tempRoot, { recursive: true })]);
    const roots = await Promise.all([backupRoot, uploadRoot, tempRoot].map(path => realpath(path)));
    if (new Set(roots).size !== 3) throw new Error("Storage directories resolve to the same location.");
    if (renderDiskRequired) {
      const mountRoot = await realpath("/var/data"), backupRelative = relative(mountRoot, roots[0]);
      if (backupRelative === ".." || backupRelative.startsWith(`..${sep}`) || isAbsolute(backupRelative)) {
        throw new Error("Render backups must resolve inside the persistent disk mounted at /var/data.");
      }
    }
    await verifyBackupStorage();
    if (mongoBackups) await backupStore.initialize();
    await Promise.all([
      backups.createIndex({ createdAt: -1 }), db.collection("data_control_audit").createIndex({ at: -1 }),
      db.collection("data_control_previews").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("data_control_snapshots").createIndex({ at: 1 }, { expireAfterSeconds: 400 * DAY / 1000 }),
      db.collection("data_control_reports").createIndex({ at: -1 }),
      db.collection("offer_images").createIndex({ sha256: 1, uploadedBy: 1 }, { unique: true, partialFilterExpression: { sha256: { $type: "string" } } }),
      db.collection("decoration_assets").createIndex({ sha256: 1, "createdBy.id": 1 }, { unique: true, partialFilterExpression: { sha256: { $type: "string" } } }),
    ]);
    await db.collection("data_control_settings").updateOne({ _id: "policy" }, { $setOnInsert: { ...defaults, createdAt: clock(), nextBackupAt: nextRun("daily", clock()) } }, { upsert: true });
    // Legacy TTL jobs could delete uploads/history without checking live references or backup coverage.
    for (const name of ["offer_images", "decoration_assets", "decoration_activity"]) {
      let indexes; try { indexes = await db.collection(name).indexes(); } catch (error) { if (error.code === 26) continue; throw error; }
      for (const index of indexes) if (index.expireAfterSeconds !== undefined) await db.collection(name).dropIndex(index.name);
    }
    await runtime.createIndex({ until: 1 }, { expireAfterSeconds: 0 });
  }
  async function withLock(action, { admitWrite = false, waitMs = 0, signal } = {}) {
    const owner = randomUUID(), deadline = Date.now() + waitMs;
    const release = () => runtime.updateOne({ _id: "operation", owner }, { $set: { until: new Date(0) } });
    // Retry admission only. A backup or business validation failure must never
    // rerun the action or create another backup.
    for (;;) {
      signal?.throwIfAborted();
      let acquired = false, busy;
      try {
        const now = clock();
        await runtime.updateOne({ _id: "operation", until: { $lte: now } }, { $set: { owner, until: new Date(now.getTime() + 60000) } }, { upsert: true });
        acquired = true;
        if (!admitWrite && await runtime.findOne({ _id: /^write:/, until: { $gt: clock() } })) busy = fail(409, "A data update is still running. Retry maintenance shortly.");
      } catch (error) {
        if (acquired) await release();
        if (error.code !== 11000) throw error;
        busy = fail(409, "Another storage operation is running. Try again when it finishes.");
      }
      if (!busy) break;
      if (acquired) await release();
      if (Date.now() >= deadline) {
        busy.details = { code: "STORAGE_BUSY", retryAfter: 1 };
        throw busy;
      }
      await delay(Math.min(100, deadline - Date.now()), undefined, { signal });
    }
    let lost = false, checkedAt = 0;
    const pulse = setInterval(() => { void runtime.updateOne({ _id: "operation", owner }, { $set: { until: new Date(clock().getTime() + 60000) } }).then(result => { if (!result.matchedCount) lost = true; }).catch(() => { lost = true; }); }, 10000); pulse.unref();
    const check = async () => {
      signal?.throwIfAborted();
      if (lost) throw fail(409, "The storage operation lock expired. No further changes were made.");
      if (Date.now() - checkedAt < 5000) return;
      if (!await runtime.findOne({ _id: "operation", owner, until: { $gt: clock() } })) throw fail(409, "The storage operation lock expired. No further changes were made.");
      checkedAt = Date.now();
    };
    try {
      signal?.throwIfAborted();
      return await action(check);
    }
    finally { clearInterval(pulse); await release(); }
  }
  function withQueuedLock(action, options = {}) {
    // Separate from write admission: an existing writer may itself need to
    // admit another write before it can finish and release its lease.
    const operation = maintenanceQueue.then(() => withLock(action, { waitMs: 240000, ...options }));
    maintenanceQueue = operation.catch(() => {});
    return operation;
  }
  async function overview({ snapshot = false } = {}) {
    const [stats, uploadFiles, tempFiles, backupFiles, embedded, embeddedBackupBytes] = await Promise.all([
      db.command({ dbStats: 1, scale: 1, freeStorage: 1 }), walkFiles(uploadRoot), walkFiles(tempRoot), walkFiles(backupRoot),
      Promise.all(assetCollections.map(async name => {
        const field = { staff: "photo", employment_letter_images: "bytes", employment_letters: "pdf" }[name] || "data";
        return (await db.collection(name).aggregate([{ $group: { _id: null, bytes: { $sum: { $cond: [{ $eq: [{ $type: `$${field}` }, "binData"] }, { $binarySize: `$${field}` }, 0] } } } }]).toArray())[0]?.bytes || 0;
      })),
      backupStore.bytes(),
    ]);
    if (![stats.storageSize, stats.indexSize, stats.dataSize].every(value => Number.isFinite(value) && value >= 0)) throw fail(503, "MongoDB storage statistics are unavailable. Storage is not estimated.");
    const databaseBytes = stats.storageSize + stats.indexSize, uploadedFilesBytes = uploadFiles.reduce((sum, f) => sum + f.bytes, 0), localBackupBytes = backupFiles.reduce((sum, f) => sum + f.bytes, 0);
    const externalBackupBytes = mongoBackups ? 0 : localBackupBytes, temporaryBytes = tempFiles.reduce((sum, f) => sum + f.bytes, 0) + (mongoBackups ? localBackupBytes : 0), backupBytes = externalBackupBytes + embeddedBackupBytes;
    const usedBytes = databaseBytes + uploadedFilesBytes + temporaryBytes + externalBackupBytes, percent = usedBytes / CAPACITY * 100;
    const result = { capacityBytes: CAPACITY, usedBytes, availableBytes: Math.max(0, CAPACITY - usedBytes), databaseBytes, databaseDocumentBytes: stats.dataSize, databaseIndexBytes: stats.indexSize, databaseReusableBytes: stats.totalFreeStorageSize ?? stats.freeStorageSize ?? 0, uploadedFilesBytes, embeddedUploadBytes: embedded.reduce((a, b) => a + b, 0), temporaryBytes, backupBytes, embeddedBackupBytes, externalBackupBytes, backupStorage, percent, status: storageStatus(percent), warnings: [70, 80, 90, 95].filter(value => percent >= value), measuredAt: clock(), persistentBackupDirectoryConfigured: mongoBackups || Boolean(config.dataControl?.backupDirectory), note: "Embedded uploads and MongoDB backups are already included in database storage. Local backup caches count as temporary files. Deleted document bytes may remain allocated for reuse by MongoDB." };
    if (snapshot) { const hour = new Date(clock()); hour.setUTCMinutes(0, 0, 0); await db.collection("data_control_snapshots").updateOne({ _id: hour.toISOString() }, { $set: { ...result, at: clock() } }, { upsert: true }); }
    return result;
  }
  async function assertSpace(additional = 0) { const usage = await overview(); if (usage.usedBytes + additional > CAPACITY) throw fail(507, "The 500 MB storage budget cannot fit this operation. Download and remove old verified backups, or export and safely delete eligible history."); return usage; }
  async function history(unit = "day") {
    if (!["day", "week", "month", "year"].includes(unit)) throw fail(400, "Choose a valid chart period.");
    return db.collection("data_control_snapshots").aggregate([{ $group: { _id: { $dateTrunc: { date: "$at", unit, timezone: "Asia/Kolkata", ...(unit === "week" ? { startOfWeek: "monday" } : {}) } }, usedBytes: { $max: "$usedBytes" }, databaseBytes: { $max: "$databaseBytes" }, backupBytes: { $max: "$backupBytes" }, samples: { $sum: 1 } } }, { $sort: { _id: -1 } }, { $limit: 60 }, { $sort: { _id: 1 } }]).toArray();
  }
  async function list(key, input = {}) {
    const section = sectionFor(key), filter = buildFilter(key, input);
    const page = Number(input.page || 1), pageSize = Number(input.pageSize || 25);
    if (!Number.isInteger(page) || page < 1 || page > 100000 || ![25, 50, 100].includes(pageSize)) throw fail(400, "Choose a valid page.");
    const [records, summary] = await Promise.all([
      db.collection(section.collection).find(filter).sort({ [section.date]: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
      db.collection(section.collection).aggregate([{ $match: filter }, { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: { $bsonSize: "$$ROOT" } }, first: { $min: `$${section.date}` }, last: { $max: `$${section.date}` } } }]).toArray(),
    ]);
    return { records: records.map(record => ({ ...publicRecord(record), storageBytes: bytesOf(record) })), total: summary[0]?.count || 0, bytes: summary[0]?.bytes || 0, first: summary[0]?.first, last: summary[0]?.last, page, pages: Math.max(1, Math.ceil((summary[0]?.count || 0) / pageSize)), fields: section.fields, protected: Boolean(section.protected) };
  }
  async function* documents(key, input = {}) {
    const section = sectionFor(key);
    for await (const doc of db.collection(section.collection).find(buildFilter(key, input)).sort({ _id: 1 }).batchSize(100)) yield doc;
  }
  function backupPath(id) { if (!/^[a-f0-9-]{36}$/.test(id)) throw fail(400, "Invalid backup ID."); return resolve(backupRoot, `${id}.ndjson.gz`); }
  async function createBackup({ actor, key, input = {}, reason = "manual", check = async () => {} } = {}) {
    if (!mongoBackups && config.production && (!config.dataControl?.backupDirectory || !isAbsolute(config.dataControl.backupDirectory))) throw fail(503, "Configure DATA_CONTROL_BACKUP_DIR as an absolute persistent-disk path before creating production backups.");
    await assertSpace(65536);
    const id = randomUUID(), path = backupPath(id), temporary = `${path}.partial`, createdAt = clock();
    const dependencies = { enquiries: ["enquiry_history"], notifications: [], payments: ["payment_webhook_events"], vouchers: ["hotels", "gst_rates", "office_addresses", "billing_counters", "journey_invoice_reservations"], attendance: ["staff", "staff_settings"], invoices: ["billing_counters", "invoice_requests"] };
    const collections = key ? [...new Set([sectionFor(key).collection, ...dependencies[key]])] : businessCollections;
    const entry = { _id: id, status: "running", storage: backupStorage, reason, section: key || "all", createdAt, actor: String(actor?._id || actor || "scheduler"), records: 0, files: 0 };
    await backups.insertOne(entry); await audit(actor, "backup.started", { backupId: id, reason });
    let records = 0, files = 0, logicalBytes = 0, compressed = 0;
    const current = await overview(), remaining = Math.floor((CAPACITY - current.usedBytes - 65536) / (mongoBackups ? 2 : 1));
    async function* lines() {
      yield `${ejson({ type: "header", format: "eternal-india-backup", version: 1, id, createdAt, collections, scope: key || "all", database: db.databaseName })}\n`;
      for (const name of collections) {
        let filter = key && name === sectionFor(key).collection ? buildFilter(key, input) : {};
        if (key === "enquiries" && name === "enquiry_history") { const ids = await db.collection("enquiries").find(buildFilter(key, input), { projection: { _id: 1 } }).toArray(); filter = { enquiryId: { $in: ids.map(doc => doc._id) } }; }
        for await (const doc of db.collection(name).find(filter, { promoteValues: false }).batchSize(100)) {
          await check(); records++; logicalBytes += bytesOf(doc);
          yield `${ejson({ type: "record", collection: name, document: doc })}\n`;
        }
      }
      for (const [kind, root] of [["upload", uploadRoot], ["temporary", tempRoot]]) for (const file of await walkFiles(root)) {
        await check(); const sha = createHash("sha256"); let bytes = 0;
        yield `${ejson({ type: "file-start", kind, name: file.name })}\n`;
        for await (const chunk of createReadStream(file.path, { highWaterMark: 256 * 1024 })) { sha.update(chunk); bytes += chunk.length; yield `${ejson({ type: "file-chunk", data: chunk.toString("base64") })}\n`; }
        yield `${ejson({ type: "file-end", bytes, sha256: sha.digest("hex") })}\n`; files++;
      }
      yield `${ejson({ type: "footer", records, files, logicalBytes })}\n`;
    }
    const quota = new Transform({ transform(chunk, _encoding, callback) { compressed += chunk.length; callback(compressed > remaining ? fail(507, "Backup exceeds available storage. No records were deleted.") : null, chunk); } });
    try {
      await pipeline(Readable.from(lines()), createGzip({ level: 9 }), quota, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      await check(); await rename(temporary, path);
      const sha256 = await fileHash(path);
      if (mongoBackups) { await backupStore.save(id, path, sha256); await check(); await unlink(path); }
      await backups.updateOne({ _id: id }, { $set: { status: "verifying", records, files, logicalBytes, bytes: compressed, sha256 } });
      await verifyBackup(id);
      if (mongoBackups) await unlink(path);
      await audit(actor, "backup.completed", { backupId: id, records, files, bytes: compressed });
      return backups.findOne({ _id: id });
    } catch (error) {
      await unlink(temporary).catch(() => {}); await unlink(path).catch(() => {});
      if (mongoBackups) await backupStore.remove(id);
      await backups.updateOne({ _id: id }, { $set: { status: "failed", error: error.publicMessage ? error.message : "Backup failed. Check storage availability and permissions.", finishedAt: clock() } });
      await audit(actor, "backup.failed", { backupId: id }); throw error;
    }
  }
  async function readBackup(id, onRecord = async () => {}, onFile = async () => {}) {
    const saved = await backups.findOne({ _id: id });
    if (!saved || !["verified", "verifying"].includes(saved.status)) throw fail(409, "A completed backup is required.");
    const path = backupPath(id); let info;
    if (saved.storage === "mongodb") await backupStore.materialize(id, path);
    try { info = await lstat(path); } catch { throw fail(409, "The backup file is missing. Deletion and restore are blocked."); }
    if (!info.isFile() || info.isSymbolicLink() || info.size !== saved.bytes || await fileHash(path) !== saved.sha256) throw fail(409, "Backup checksum verification failed.");
    let header, footer, activeFile, records = 0, files = 0, logicalBytes = 0, expanded = 0;
    const limit = new Transform({ transform(chunk, _encoding, callback) { expanded += chunk.length; callback(expanded > CAPACITY * 4 ? fail(413, "Backup expands beyond the supported size.") : null, chunk); } });
    const output = createGunzip(), source = createReadStream(path);
    const pumping = pipeline(source, output, limit).catch(error => { limit.destroy(error); });
    const reader = createInterface({ input: limit, crlfDelay: Infinity });
    try {
      for await (const line of reader) {
        if (!line || line.length > 24 * 1024 * 1024) throw fail(409, "Invalid backup record size.");
        const encoded = JSON.parse(line), item = BSON.EJSON.deserialize(encoded, { relaxed: true });
        if (item.type === "record") item.document = parse(JSON.stringify(encoded.document));
        if (footer) throw fail(409, "Unexpected data after the backup footer.");
        if (!header) {
          if (item.type !== "header" || item.format !== "eternal-india-backup" || item.version !== 1 || item.id !== id || !Array.isArray(item.collections) || item.collections.some(name => !businessCollections.includes(name))) throw fail(409, "Unsupported backup manifest.");
          header = item; continue;
        }
        if (item.type === "record" && !activeFile) {
          if (!header.collections.includes(item.collection) || !item.document || item.document._id === undefined) throw fail(409, "Invalid backup collection or document.");
          records++; logicalBytes += bytesOf(item.document); await onRecord(item.collection, item.document);
        } else if (item.type === "file-start" && !activeFile) {
          if (!["upload", "temporary"].includes(item.kind)) throw fail(409, "Invalid file type."); safePath(uploadRoot, item.name);
          activeFile = { ...item, hash: createHash("sha256"), bytes: 0 }; await onFile("start", item);
        } else if (item.type === "file-chunk" && activeFile && typeof item.data === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(item.data)) {
          const bytes = Buffer.from(item.data, "base64"); activeFile.hash.update(bytes); activeFile.bytes += bytes.length; await onFile("chunk", { bytes });
        } else if (item.type === "file-end" && activeFile) {
          if (activeFile.bytes !== item.bytes || activeFile.hash.digest("hex") !== item.sha256) throw fail(409, "Backup file content is corrupt.");
          await onFile("end", { ...activeFile, sha256: item.sha256 }); activeFile = null; files++;
        } else if (item.type === "footer" && !activeFile) footer = item;
        else throw fail(409, "Invalid backup structure.");
      }
      if (!footer || footer.records !== records || footer.files !== files || footer.logicalBytes !== logicalBytes || records !== saved.records || files !== saved.files) throw fail(409, "Backup is incomplete.");
    } finally { reader.close(); source.destroy(); output.destroy(); limit.destroy(); await pumping; }
    return { records, files, logicalBytes, bytes: info.size, sha256: saved.sha256 };
  }
  async function verifyBackup(id, actor) {
    try { const result = await readBackup(id); await backups.updateOne({ _id: id }, { $set: { status: "verified", verifiedAt: clock(), finishedAt: clock() }, $unset: { error: "" } }); if (actor) await audit(actor, "backup.verified", { backupId: id }); return result; }
    catch (error) { if (error.status !== 503) await backups.updateOne({ _id: id }, { $set: { status: "invalid", error: "Backup verification failed.", verifiedAt: clock() } }); if (actor) await audit(actor, "backup.verification-failed", { backupId: id }); throw error; }
  }
  async function preview(key, input, actor) {
    const section = sectionFor(key), filter = buildFilter(key, input), records = []; let bytes = 0, firstDate, lastDate;
    const eligible = section.protected ? {} : { $and: [filter, section.eligible, { [section.date]: { $lt: section.stringDate ? new Date(clock().getTime() - DAY).toISOString().slice(0, 10) : new Date(clock().getTime() - DAY) } }] };
    const total = await db.collection(section.collection).countDocuments(filter);
    if (!total) throw fail(400, "No records match this selection.");
    if (total > 5000) throw fail(400, "Narrow the date range to at most 5,000 records per operation.");
    if (!section.protected && await db.collection(section.collection).countDocuments(eligible) !== total) throw fail(409, "This selection contains active or recent records. Only archived closed enquiries and read notifications older than one day may be deleted.");
    for await (const doc of db.collection(section.collection).find(filter, { promoteValues: false }).sort({ _id: 1 }).batchSize(100)) {
      records.push({ id: doc._id, hash: digest(doc) }); bytes += bytesOf(doc);
      const value = doc[section.date], date = value instanceof Date ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(value) : value;
      if (typeof date === "string") { if (!firstDate || date < firstDate) firstDate = date; if (!lastDate || date > lastDate) lastDate = date; }
    }
    const entry = { _id: randomUUID(), key, actor: String(actor._id || actor), records, count: records.length, bytes, from: input.from || firstDate || null, to: input.to || lastDate || null, action: section.protected ? "archive" : "delete", createdAt: clock(), expiresAt: new Date(clock().getTime() + 15 * 60000) };
    await db.collection("data_control_previews").insertOne(entry);
    return { id: entry._id, count: entry.count, bytes: entry.action === "delete" ? bytes : 0, selectedBytes: bytes, from: entry.from, to: entry.to, action: entry.action, expiresAt: entry.expiresAt };
  }
  async function executePreview(id, actor, check = async () => {}, suppliedBackupId) {
    const previews = db.collection("data_control_previews"), plan = await previews.findOne({ _id: id, actor: String(actor._id || actor), expiresAt: { $gt: clock() }, completedAt: { $exists: false } });
    if (!plan) throw fail(409, "The confirmation expired or was already used. Preview the selection again.");
    const section = sectionFor(plan.key), collection = db.collection(section.collection);
    const selected = new Map(plan.records.map(item => [ejson(item.id), item.hash]));
    const ids = plan.records.map(item => item.id); let matched = 0;
    for await (const doc of collection.find({ _id: { $in: ids } }, { promoteValues: false }).batchSize(10)) { if (digest(doc) !== selected.get(idOf(doc))) throw fail(409, "Selected records changed. Preview again before continuing."); matched++; }
    if (matched !== plan.count) throw fail(409, "Selected records changed. Preview again before continuing.");
    const backup = suppliedBackupId ? await backups.findOne({ _id: suppliedBackupId }) : await createBackup({ actor, reason: `before-${plan.action}`, check });
    if (!backup) throw fail(409, "A verified backup is required.");
    const covered = new Set();
    await readBackup(backup._id, async (name, doc) => { if (name === section.collection && selected.get(idOf(doc)) === digest(doc)) covered.add(idOf(doc)); });
    if (covered.size !== selected.size) throw fail(409, "The backup does not cover the exact current record versions. No records were changed.");
    const report = { _id: randomUUID(), action: plan.action, key: plan.key, backupId: backup._id, previewId: id, count: plan.count, changed: 0, skipped: 0, estimatedBytes: plan.action === "delete" ? plan.bytes : 0, at: clock(), status: "running" };
    await db.collection("data_control_reports").insertOne(report); await audit(actor, `${plan.action}.started`, { reportId: report._id, backupId: backup._id, count: plan.count });
    try {
      const currentFilter = { $and: [{ _id: { $in: ids } }, section.protected ? {} : section.eligible] };
      for await (const doc of collection.find(currentFilter, { promoteValues: false }).batchSize(10)) {
        await check();
        if (digest(doc) !== selected.get(idOf(doc))) continue;
        const result = section.protected ? await collection.updateOne(exact(doc), { $set: { dataControlArchivedAt: clock(), dataControlArchivedBy: String(actor._id || actor) } }) : await collection.deleteOne(exact(doc));
        report.changed += result.deletedCount || result.modifiedCount || 0;
        if (!(result.deletedCount || result.modifiedCount)) report.skipped++;
        if (result.deletedCount && plan.key === "enquiries") {
          const deletionId = doc.submissionId ? `WEBSITE:${doc.submissionId}` : doc.externalMessageId ? `${doc.source}:${doc.externalMessageId}` : "";
          if (deletionId) await db.collection("enquiry_deleted_submissions").updateOne({ _id: deletionId }, { $setOnInsert: { source: doc.source || "WEBSITE", submissionId: doc.submissionId || null, externalMessageId: doc.externalMessageId || null, deletedAt: clock(), deletedBy: String(actor._id || actor), backupId: backup._id } }, { upsert: true });
        }
      }
      report.skipped = plan.count - report.changed;
      report.status = report.skipped ? "partial" : "completed";
      await previews.updateOne({ _id: id }, { $set: { completedAt: clock() } });
      await audit(actor, `${plan.action}.completed`, { reportId: report._id, changed: report.changed, skipped: report.skipped, backupId: backup._id });
      return report;
    } catch (error) { report.status = "failed"; await audit(actor, `${plan.action}.failed`, { reportId: report._id, changed: report.changed }); throw error; }
    finally { await db.collection("data_control_reports").updateOne({ _id: report._id }, { $set: { changed: report.changed, skipped: report.skipped, status: report.status, finishedAt: clock() } }); }
  }
  async function deleteBackup(id, actor, check = async () => {}) {
    const saved = await backups.findOne({ _id: id }); if (!saved) throw fail(404, "Backup not found.");
    if (["running", "verifying"].includes(saved.status)) throw fail(409, "A running backup cannot be deleted.");
    if (saved.status === "verified") {
      const other = await backups.find({ _id: { $ne: id }, status: "verified", section: "all" }).sort({ createdAt: -1 }).limit(1).toArray();
      if (!other.length) throw fail(409, "Keep at least one verified complete backup."); await readBackup(other[0]._id);
    }
    await check(); await audit(actor, "backup.delete-started", { backupId: id, bytes: saved.bytes || 0 });
    if (saved.storage === "mongodb") await backupStore.remove(id);
    await unlink(backupPath(id)).catch(error => { if (error.code !== "ENOENT") throw error; });
    await backups.updateOne({ _id: id }, { $set: { status: "deleted", deletedAt: clock() } }); await audit(actor, "backup.deleted", { backupId: id });
  }
  async function settings() { return await db.collection("data_control_settings").findOne({ _id: "policy" }) || { ...defaults }; }
  async function saveSettings(input, actor) {
    if (!Object.hasOwn(frequencies, input.frequency) && input.frequency !== "off" || !Number.isInteger(input.backupRetentionDays) || input.backupRetentionDays < 1 || input.backupRetentionDays > 3650 || !Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 3650 || typeof input.cleanupEnabled !== "boolean" || !Array.isArray(input.cleanupSections) || input.cleanupSections.some(key => !["enquiries", "notifications"].includes(key))) throw fail(400, "Choose a valid frequency and retention period (1–3650 days). Financial and attendance records cannot be automatically deleted.");
    if (input.cleanupEnabled && input.frequency === "off") throw fail(400, "Automatic cleanup requires scheduled backups.");
    const saved = { frequency: input.frequency, backupRetentionDays: input.backupRetentionDays, retentionDays: input.retentionDays, cleanupEnabled: input.cleanupEnabled, cleanupSections: [...new Set(input.cleanupSections)], updatedAt: clock(), updatedBy: String(actor._id || actor), nextBackupAt: input.frequency === "off" ? null : nextRun(input.frequency, clock()) };
    await audit(actor, "policy.updated", { policy: saved }); await db.collection("data_control_settings").updateOne({ _id: "policy" }, { $set: saved }, { upsert: true }); return settings();
  }
  async function cleanup(actor, check = async () => {}) {
    const policy = await settings();
    if (!policy.cleanupEnabled) throw fail(409, "Automatic cleanup is disabled in the retention policy.");
    // Fresh coverage is mandatory. Scheduling a backup never implies permission to delete.
    const backup = await createBackup({ actor, reason: "before-cleanup", check }), reports = [];
    const cutoff = new Date(clock().getTime() - policy.retentionDays * DAY);
    for (const key of policy.cleanupSections) {
      const section = sectionFor(key); if (section.protected) continue;
      const ids = await db.collection(section.collection).find({ $and: [section.base || {}, section.eligible, { [section.date]: { $lt: cutoff } }] }, { projection: { _id: 1 } }).sort({ _id: 1 }).limit(200).toArray();
      if (!ids.length) continue;
      const plan = await preview(key, { ids: ids.map(item => String(item._id)) }, actor);
      reports.push(await executePreview(plan.id, actor, check, backup._id));
    }
    await audit(actor, "cleanup.completed", { backupId: backup._id, reports: reports.map(item => item._id) });
    return { backupId: backup._id, reports, note: "Cleanup processes at most 200 eligible records per section per run." };
  }
  async function restore(id, actor, confirmation, check = async () => {}) {
    if (confirmation !== `RESTORE ${id}`) throw fail(400, "Type the exact restore confirmation.");
    const verified = await readBackup(id); await assertSpace(verified.logicalBytes + verified.bytes + 65536);
    const safety = await createBackup({ actor, reason: "before-restore", check }); await readBackup(safety._id);
    let inserted = 0, skipped = 0, restoredFiles = 0, file, handle, partial;
    await audit(actor, "restore.started", { backupId: id, safetyBackupId: safety._id, mode: "missing-only" });
    try {
      await readBackup(id, async (name, doc) => {
        await check();
        // Never roll back numbering or idempotency ledgers. Preserve the greater sequence.
        if (["billing_counters", "employment_letter_counters"].includes(name)) {
          if (Number.isFinite(Number(doc.sequence))) await db.collection(name).updateOne({ _id: doc._id }, { $max: { sequence: doc.sequence } }, { upsert: true }); skipped++; return;
        }
        if (await db.collection(name).findOne({ _id: doc._id }, { projection: { _id: 1 } })) { skipped++; return; }
        await assertSpace(bytesOf(doc) * 2 + 65536);
        try { await db.collection(name).insertOne(doc); inserted++; } catch (error) { if (error.code === 11000) skipped++; else throw error; }
      }, async (event, item) => {
        if (event === "start") {
          const root = item.kind === "upload" ? uploadRoot : tempRoot, target = safePath(root, item.name);
          // Create every directory separately and reject symlinks before opening a file.
          let parent = root;
          for (const part of item.name.split("/").slice(0, -1)) { parent = resolve(parent, part); await mkdir(parent).catch(error => { if (error.code !== "EEXIST") throw error; }); const info = await lstat(parent); if (!info.isDirectory() || info.isSymbolicLink()) throw fail(409, "Restore path is unsafe."); }
          file = target; partial = `${target}.${randomUUID()}.restore`; handle = await open(partial, "wx", 0o600);
        } else if (event === "chunk") { await assertSpace(item.bytes.length + 65536); await handle.write(item.bytes); }
        else { await handle.close(); handle = null; await check();
          // Atomic no-overwrite publication through an exclusive destination.
          let destination;
          try { destination = await open(file, "wx", 0o600); for await (const chunk of createReadStream(partial)) await destination.write(chunk); restoredFiles++; }
          catch (error) { if (error.code !== "EEXIST") throw error; skipped++; }
          finally { await destination?.close(); await unlink(partial); partial = null; }
        }
      });
      await audit(actor, "restore.completed", { backupId: id, safetyBackupId: safety._id, inserted, skipped, restoredFiles });
      return { inserted, skipped, restoredFiles, safetyBackupId: safety._id, mode: "missing-only" };
    } catch (error) { await audit(actor, "restore.failed", { backupId: id, safetyBackupId: safety._id, inserted, skipped, restoredFiles }); throw error; }
    finally { await handle?.close(); if (partial) await unlink(partial).catch(() => {}); }
  }
  async function tick() {
    if (ticking || stopped) return; ticking = true;
    try { await withLock(async check => {
      // Recover abandoned backup artifacts only after their distributed lease has expired.
      for await (const interrupted of backups.find({ status: { $in: ["running", "verifying"] }, createdAt: { $lt: new Date(clock().getTime() - 120000) } })) {
        await check();
        if (interrupted.status === "verifying") {
          try { await verifyBackup(interrupted._id); } catch { /* verifyBackup records invalid status */ }
        } else {
          await unlink(`${backupPath(interrupted._id)}.partial`).catch(error => { if (error.code !== "ENOENT") throw error; });
          await unlink(backupPath(interrupted._id)).catch(error => { if (error.code !== "ENOENT") throw error; });
          if (interrupted.storage === "mongodb") await backupStore.remove(interrupted._id);
          await backups.updateOne({ _id: interrupted._id }, { $set: { status: "failed", error: "Backup was interrupted before verification. No database records were removed.", finishedAt: clock() } });
        }
        await audit("scheduler", "backup.recovered-after-interruption", { backupId: interrupted._id });
      }
      await overview({ snapshot: true }); const policy = await settings();
      if (policy.frequency === "off" || !policy.nextBackupAt || new Date(policy.nextBackupAt) > clock()) return;
      const backup = await createBackup({ actor: "scheduler", reason: "scheduled", check });
      await db.collection("data_control_settings").updateOne({ _id: "policy" }, { $set: { lastBackupAt: clock(), lastBackupId: backup._id, nextBackupAt: nextRun(policy.frequency, clock()), lastError: null } });
      if (policy.cleanupEnabled) await cleanup("scheduler", check);
      const latest = await backups.find({ status: "verified", section: "all" }).sort({ createdAt: -1 }).limit(1).toArray();
      for await (const old of backups.find({ status: { $in: ["verified", "failed", "invalid"] }, createdAt: { $lt: new Date(clock().getTime() - policy.backupRetentionDays * DAY) }, _id: { $ne: latest[0]?._id } })) await deleteBackup(old._id, "scheduler", check);
    }); } catch (error) { if (error.status !== 409) { await db.collection("data_control_settings").updateOne({ _id: "policy" }, { $set: { lastError: error.publicMessage ? error.message : "Scheduled operation failed. Review backup history.", nextBackupAt: new Date(clock().getTime() + 3600000) } }).catch(() => {}); console.error("Data control scheduled operation failed:", error.name); } }
    finally { ticking = false; }
  }
  function reserveWrite(bytes) {
    // Queue admissions from this instance before taking the distributed lock.
    // Otherwise bursts exhaust their retries competing with one another while
    // each accepted request measures storage. Actual business writes still run
    // concurrently and maintenance/other instances retain the same DB lock.
    const admission = writeAdmission.then(() => withLock(async () => {
      const pending = (await runtime.aggregate([{ $match: { _id: /^write:/, until: { $gt: clock() } } }, { $group: { _id: null, bytes: { $sum: "$bytes" } } }]).toArray())[0]?.bytes || 0;
      await assertSpace(pending + bytes); const id = `write:${randomUUID()}`;
      await runtime.insertOne({ _id: id, bytes, until: new Date(clock().getTime() + 120000) }); return id;
    }, { admitWrite: true }));
    writeAdmission = admission.catch(() => {});
    return admission;
  }
  async function withWrite(action, bytes = 2 * 1024 * 1024) {
    let id;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { id = await reserveWrite(bytes); break; }
      catch (error) { if (error.status !== 409 || attempt === 99) throw error; await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    const pulse = setInterval(() => { void runtime.updateOne({ _id: id }, { $set: { until: new Date(clock().getTime() + 120000) } }).catch(() => {}); }, 30000); pulse.unref();
    try { return await action(); } finally { clearInterval(pulse); await runtime.deleteOne({ _id: id }); }
  }
  return { initialize, overview, history, assertSpace, reserveWrite, withWrite, list, documents, audit, withLock, withQueuedLock, createBackup, readBackup, verifyBackup, preview, executePreview, deleteBackup, backupPath, settings, saveSettings, cleanup, restore, db, uploadRoot, tempRoot,
    start() { stopped = false; tickPromise = tick(); timer = setInterval(() => { tickPromise = tick(); }, 60000); timer.unref(); },
    async stop() { stopped = true; clearInterval(timer); await tickPromise; }, tick };
}
