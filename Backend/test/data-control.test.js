import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, readFile, appendFile, unlink, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { MongoClient, ObjectId, BSON } from "mongodb";
import ExcelJS from "exceljs";
import { readConfig } from "../config/env.js";
import { createDataControl, safePath } from "../data-control/service.js";
import { buildFilter, catalog, CAPACITY, storageStatus, validDate, ejson, parse, publicRecord } from "../data-control/catalog.js";
import { registerDataControl, storageWriteGuard } from "../data-control/routes.js";
import { safeCell } from "../data-control/exports.js";
import { optimizedImage, inspectOptimization, optimizeStorage } from "../data-control/optimization.js";
import sharp from "sharp";

test("data control validates dates, selections, paths and spreadsheet formulas", () => {
  assert.ok(validDate("2024-02-29"));
  for (const value of ["2026-02-30", "2026-13-01", "invalid", "2026-00-01"]) assert.equal(validDate(value), false);
  for (const input of [{ from: "2026-02-30" }, { from: "2026-12-01", to: "2026-01-01" }, { ids: [] }, { ids: ["$ne"] }, { search: { $ne: "" } }, { archived: "no" }]) assert.throws(() => buildFilter("enquiries", input), error => error.status === 400);
  assert.throws(() => buildFilter("admins"), error => error.status === 400);
  const filter = buildFilter("enquiries", { from: "2026-11-15", to: "2026-11-15", search: "[.*]" });
  assert.equal(filter.$and[1].receivedAt.$gte.toISOString(), "2026-11-14T18:30:00.000Z");
  assert.equal(filter.$and[1].receivedAt.$lt.toISOString(), "2026-11-15T18:30:00.000Z");
  assert.equal(filter.$and[2].$or[0].reference.$regex, "\\[\\.\\*\\]");
  assert.equal(CAPACITY, 524288000);
  assert.deepEqual([0, 59, 60, 79, 80, 89, 90, 99, 100, 120].map(storageStatus), ["green", "green", "yellow", "yellow", "orange", "orange", "red", "red", "critical", "critical"]);
  for (const path of ["../outside", "a/../../escape", "C:/escape", "a\\b", "/absolute", "a//b"]) assert.throws(() => safePath(resolve(tmpdir(), "safe"), path));
  assert.match(safeCell("=SUM(A1)"), /^'/); assert.match(safeCell(" +CMD"), /^'/);
  const original = { _id: new ObjectId(), date: new Date(), data: new BSON.Binary(Buffer.from("actual")), big: BSON.Long.fromString("9223372036854775807") };
  assert.equal(ejson(parse(ejson(original))), ejson(original));
  assert.equal(publicRecord({ bytes: Buffer.from("abc"), accessToken: "private" }).bytes, "[binary: 3 bytes]");
  assert.equal(publicRecord({ accessToken: "private" }).accessToken, undefined);
});

test("production data control refuses to start without an absolute persistent backup directory", async () => {
  const db = { databaseName: "startup-check", collection: () => ({}) };
  for (const dataControl of [{}, { backupDirectory: "relative-backups" }]) {
    const control = createDataControl({ db, config: { production: true, dataControl } });
    await assert.rejects(control.initialize(), /DATA_CONTROL_BACKUP_DIR/);
  }
});

test("real MongoDB backup, export, verification, restore, cleanup and quota safety", { timeout: 180000 }, async t => {
  const config = readConfig(), client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 4000 });
  try { await client.connect(); } catch (error) { await client.close(); throw error; }
  const databaseName = `eternal_dc_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, db = client.db(databaseName);
  const root = await mkdtemp(resolve(tmpdir(), "eternal-data-control-"));
  const options = { ...config, dataControl: { backupDirectory: resolve(root, "backups"), uploadDirectory: resolve(root, "uploads"), tempDirectory: resolve(root, "temporary") } };
  const control = createDataControl({ db, config: options }); try { await control.initialize(); } catch (error) { await client.close(); throw error; }
  const actor = { _id: new ObjectId(), email: "data-control-test@example.com", roles: ["technical"], status: "active" };
  await db.collection("admins").insertOne(actor);
  const jti = randomUUID(); await db.collection("admin_tokens").insertOne({ _id: jti, adminId: actor._id, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
  const token = jwt.sign({ jti }, config.authTokenSecret, { subject: String(actor._id), issuer: "eternal-india", audience: "eternal-india-panels", expiresIn: "1h" });
  const app = express(); app.use(cookieParser()); app.use(express.json()); registerDataControl({ app, control, db, config: options });
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/api/technical/data-control`;
  const request = (path, { method = "GET", body, auth = true } = {}) => fetch(url + path, { method, headers: { "Content-Type": "application/json", ...(auth ? { Cookie: `eternal_india.auth=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async (path, options) => { const response = await request(path, options), data = await response.json(); assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`); return data; };
  const old = new Date(Date.now() - 100 * 86400000), closed = { _id: new ObjectId(), submissionId: randomUUID(), reference: "DC-CLOSED", name: "=Formula Guest", message: `${"Historical enquiry ".repeat(2000)}=SUM(1,1)`, status: "CLOSED", archivedAt: old, receivedAt: old, createdAt: old, pendingEvents: [], revision: 1 };
  const active = { ...closed, _id: new ObjectId(), submissionId: randomUUID(), reference: "DC-ACTIVE", status: "NEW", archivedAt: null };
  let backupId;
  try {
    await db.collection("enquiries").insertMany([closed, active]);
    await db.collection("billing_invoices").insertOne({ _id: new ObjectId(), invoiceNumber: "EI-INV-000200", invoiceDate: "2024-01-15", clientName: "Financial", totalAmount: 200, binary: new BSON.Binary(Buffer.from("embedded")), exactDouble: new BSON.Double(2), exactLong: BSON.Long.fromString("9223372036854775807"), exactDecimal: BSON.Decimal128.fromString("12.50") });
    await db.collection("billing_counters").insertOne({ _id: "billing_invoice", sequence: 200 });
    await db.collection("staff").insertOne({ _id: new ObjectId(), name: "Stored file fixture", photo: Buffer.from("actual photo bytes") });
    await db.collection("employment_letters").insertOne({ _id: new ObjectId(), pdf: Buffer.from("%PDF-actual stored document bytes") });
    await db.collection("enquiry_events").insertMany([{ _id: "notification:read-old", type: "notification", read: true, publishedAt: old, title: "Old read" }, { _id: "notification:unread-old", type: "notification", readBy: [], publishedAt: old, title: "Unread" }]);
    await mkdir(resolve(control.uploadRoot, "actual")); await writeFile(resolve(control.uploadRoot, "actual", "attachment.txt"), "Actual associated file");
    await t.test("authorization and actual storage accounting", async () => {
      assert.equal((await request("/storage", { auth: false })).status, 401);
      await db.collection("admins").updateOne({ _id: actor._id }, { $set: { roles: ["visitor"] } }); assert.equal((await request("/storage")).status, 403);
      await db.collection("admins").updateOne({ _id: actor._id }, { $set: { roles: ["technical"] } });
      let stats; const originalCommand = db.command.bind(db);
      db.command = async (command, ...args) => { const result = await originalCommand(command, ...args); if (command.dbStats) stats = result; return result; };
      let overview; try { overview = await json("/storage"); } finally { db.command = originalCommand; }
      assert.equal(overview.databaseBytes, stats.storageSize + stats.indexSize); assert.equal(overview.uploadedFilesBytes, Buffer.byteLength("Actual associated file"));
      assert.equal(overview.usedBytes, overview.databaseBytes + overview.uploadedFilesBytes + overview.backupBytes + overview.temporaryBytes);
      assert.equal(overview.embeddedUploadBytes, Buffer.byteLength("actual photo bytes") + Buffer.byteLength("%PDF-actual stored document bytes"));
      await assert.rejects(control.assertSpace(CAPACITY), error => error.status === 507);
      const records = await json("/records/enquiries?search=DC-CLOSED"); assert.equal(records.total, 1); assert.equal(records.bytes, BSON.calculateObjectSize(closed));
      assert.equal((await json("/records/invoices?from=2024-01-01&to=2024-01-31")).total, 1);
      assert.equal((await request("/records/enquiries?search%5B%24ne%5D=x")).status, 400);
    });
    await t.test("CSV, JSON, XLSX and PDF exports contain real selected records", async () => {
      for (const format of ["csv", "json", "xlsx", "pdf"]) {
        const response = await request("/records/enquiries/export", { method: "POST", body: { format, filter: { ids: [String(closed._id)] } } });
        assert.equal(response.status, 200); const bytes = Buffer.from(await response.arrayBuffer());
        if (format === "csv") { assert.match(bytes.toString(), /DC-CLOSED/); assert.match(bytes.toString(), /'=Formula Guest/); assert.doesNotMatch(bytes.toString(), /DC-ACTIVE/); }
        if (format === "json") assert.equal(JSON.parse(bytes.toString())[0]._id, String(closed._id));
        if (format === "pdf") assert.match(bytes.toString("latin1"), /^%PDF-/);
        if (format === "xlsx") { const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes); assert.equal(book.worksheets[0].getRow(2).getCell(2).value, "DC-CLOSED"); const raw = book.getWorksheet("Complete record JSON"); assert.ok(raw.rowCount > 2); const parts = []; raw.eachRow((row, index) => { if (index > 1) parts.push(row.getCell(3).value); }); assert.deepEqual(JSON.parse(parts.join("")), publicRecord(closed)); }
      }
    });
    await t.test("compressed backup verifies records, binary values and associated files", async () => {
      const backup = await json("/backups", { method: "POST", body: {} }); backupId = backup._id; assert.equal(backup.status, "verified"); assert.ok(backup.bytes > 0); assert.ok(backup.files === 1);
      let sawBinary = false; await control.readBackup(backupId, async (name, doc) => { if (name === "billing_invoices") { sawBinary = doc.binary instanceof BSON.Binary; assert.ok(doc.exactDouble instanceof BSON.Double); assert.equal(doc.exactLong.toString(), "9223372036854775807"); assert.equal(doc.exactDecimal.toString(), "12.50"); } }); assert.ok(sawBinary);
      assert.equal((await request(`/backups/${backupId}/download`)).status, 200);
      const bytes = await readFile(control.backupPath(backupId)); assert.equal(bytes.length, backup.bytes);
      const scoped = await control.withLock(check => control.createBackup({ actor, key: "enquiries", input: { ids: [String(closed._id)] }, check }));
      let enquiryCount = 0; await control.readBackup(scoped._id, async name => { if (name === "enquiries") enquiryCount++; }); assert.equal(enquiryCount, 1);
      await assert.rejects(control.deleteBackup(backupId, actor), /at least one/);
    });
    await t.test("active data cannot be deleted, and financial records archive only", async () => {
      assert.equal((await request("/records/enquiries/preview", { method: "POST", body: { filter: { ids: [String(active._id)] } } })).status, 409);
      assert.equal((await request("/records/notifications/preview", { method: "POST", body: { filter: { ids: ["notification:unread-old"] } } })).status, 409);
      const invoice = await db.collection("billing_invoices").findOne({});
      const plan = await json("/records/invoices/preview", { method: "POST", body: { filter: { ids: [String(invoice._id)] } } }); assert.equal(plan.action, "archive"); assert.equal(plan.bytes, 0);
      const result = await json("/records/execute", { method: "POST", body: { previewId: plan.id, confirm: true } }); assert.equal(result.changed, 1); assert.ok((await db.collection("billing_invoices").findOne({ _id: invoice._id })).dataControlArchivedAt);
    });
    await t.test("confirmation detects edits and valid deletion has a verified recoverable backup", async () => {
      const stale = await control.preview("enquiries", { ids: [String(closed._id)] }, actor);
      await db.collection("enquiries").updateOne({ _id: closed._id }, { $set: { message: "Changed after confirmation" } });
      await assert.rejects(control.withLock(check => control.executePreview(stale.id, actor, check)), /changed/);
      assert.ok(await db.collection("enquiries").findOne({ _id: closed._id }));
      const plan = await json("/records/enquiries/preview", { method: "POST", body: { filter: { ids: [String(closed._id)] } } });
      assert.equal((await request("/records/execute", { method: "POST", body: { previewId: plan.id } })).status, 400);
      const result = await json("/records/execute", { method: "POST", body: { previewId: plan.id, confirm: true } }); assert.equal(result.changed, 1); assert.equal(await db.collection("enquiries").findOne({ _id: closed._id }), null);
      assert.ok(await db.collection("enquiry_deleted_submissions").findOne({ _id: `WEBSITE:${closed.submissionId}` }));
      assert.equal((await db.collection("data_control_backups").findOne({ _id: result.backupId })).status, "verified");
      assert.equal((await request("/records/execute", { method: "POST", body: { previewId: plan.id, confirm: true } })).status, 409);
    });
    await t.test("restore requires confirmation and preserves production values and numbering", async () => {
      await db.collection("billing_counters").updateOne({ _id: "billing_invoice" }, { $set: { sequence: 500 } });
      await db.collection("enquiries").updateOne({ _id: active._id }, { $set: { message: "Production edit must survive" } });
      assert.equal((await request(`/backups/${backupId}/restore`, { method: "POST", body: { confirmation: "yes" } })).status, 400);
      await unlink(resolve(control.uploadRoot, "actual", "attachment.txt"));
      const result = await json(`/backups/${backupId}/restore`, { method: "POST", body: { confirmation: `RESTORE ${backupId}` } }); assert.ok(result.inserted >= 1); assert.ok(result.safetyBackupId);
      assert.equal(result.restoredFiles, 1); assert.equal(await readFile(resolve(control.uploadRoot, "actual", "attachment.txt"), "utf8"), "Actual associated file");
      assert.equal((await db.collection("billing_counters").findOne({ _id: "billing_invoice" })).sequence, 500);
      assert.equal((await db.collection("enquiries").findOne({ _id: active._id })).message, "Production edit must survive");
      assert.ok(await db.collection("enquiries").findOne({ _id: closed._id }));
    });
    await t.test("corrupt or missing backups block recovery and verification", async () => {
      const corrupt = await control.withLock(check => control.createBackup({ actor, check })); await appendFile(control.backupPath(corrupt._id), "tampered");
      assert.equal((await request(`/backups/${corrupt._id}/verify`, { method: "POST", body: {} })).status, 409);
      assert.equal((await request(`/backups/${corrupt._id}/download`)).status, 409);
      assert.equal((await db.collection("data_control_backups").findOne({ _id: corrupt._id })).status, "invalid");
    });
    await t.test("retention cleanup requires explicit policy and never removes financial or unread records", async () => {
      await assert.rejects(control.cleanup(actor), /disabled/);
      await assert.rejects(control.saveSettings({ frequency: "daily", backupRetentionDays: 30, retentionDays: 7, cleanupEnabled: true, cleanupSections: ["invoices"] }, actor), /Financial/);
      await control.saveSettings({ frequency: "daily", backupRetentionDays: 30, retentionDays: 7, cleanupEnabled: true, cleanupSections: ["notifications"] }, actor);
      const result = await control.withLock(check => control.cleanup(actor, check)); assert.ok(result.backupId);
      assert.equal(await db.collection("enquiry_events").findOne({ _id: "notification:read-old" }), null); assert.ok(await db.collection("enquiry_events").findOne({ _id: "notification:unread-old" })); assert.equal(await db.collection("billing_invoices").countDocuments({}), 1);
      await control.overview({ snapshot: true }); assert.equal((await control.history("week")).length, 1);
      const policy = await control.settings(); assert.ok(policy.nextBackupAt);
    });
    await t.test("distributed job lock prevents overlap and HTTP writers block maintenance", async () => {
      const lease = await control.reserveWrite(65536); await assert.rejects(control.withLock(() => 1), /data update/); await db.collection("data_control_runtime").deleteOne({ _id: lease });
      await control.withLock(async () => { await assert.rejects(control.withLock(() => 1), /Another storage operation/); });
      await control.withLock(async () => { await assert.rejects(control.reserveWrite(1024), /Another storage operation/); });
      await assert.rejects(control.reserveWrite(CAPACITY), error => error.status === 507);
      const leases = await Promise.all(Array.from({ length: 8 }, () => control.reserveWrite(1024)));
      assert.equal(new Set(leases).size, 8, "concurrent writers are admitted without consuming each other's retries, including after a rejection");
      await assert.rejects(control.withLock(() => 1), /data update/);
      await db.collection("data_control_runtime").deleteMany({ _id: { $in: leases } });
      const denied = storageWriteGuard({ reserveWrite: async () => { throw Object.assign(new Error("full"), { status: 507 }); } });
      let failure; await denied({ method: "POST", path: "/invoices", get: () => "10" }, {}, error => { failure = error; }); assert.equal(failure.status, 507);
    });
    await t.test("scheduler creates due verified backups and recovers interrupted backup files", async () => {
      await control.saveSettings({ frequency: "weekly", backupRetentionDays: 30, retentionDays: 30, cleanupEnabled: false, cleanupSections: ["enquiries"] }, actor);
      const interruptedId = randomUUID(); await db.collection("data_control_backups").insertOne({ _id: interruptedId, status: "running", createdAt: new Date(Date.now() - 180000), records: 0, files: 0 }); await writeFile(`${control.backupPath(interruptedId)}.partial`, "incomplete");
      await db.collection("data_control_settings").updateOne({ _id: "policy" }, { $set: { nextBackupAt: old } });
      await control.tick(); const scheduled = await db.collection("data_control_backups").findOne({ reason: "scheduled" }); assert.equal(scheduled.status, "verified");
      assert.equal((await db.collection("data_control_backups").findOne({ _id: interruptedId })).status, "failed");
      await assert.rejects(readFile(`${control.backupPath(interruptedId)}.partial`), error => error.code === "ENOENT");
      const before = await db.collection("data_control_backups").countDocuments({ reason: "scheduled" }); await control.tick(); assert.equal(await db.collection("data_control_backups").countDocuments({ reason: "scheduled" }), before);
      assert.ok((await control.settings()).nextBackupAt > new Date());
    });
    await t.test("optimization detects duplicates and removes only backed-up unused images", async () => {
      const images = [{ _id: new ObjectId(), data: Buffer.from("identical image bytes"), createdAt: old }, { _id: new ObjectId(), data: Buffer.from("identical image bytes"), createdAt: old }];
      await db.collection("offer_images").insertMany(images); await db.collection("tour_promotions").insertOne({ _id: "test-reference", offerImage: `/api/offer-images/${images[1]._id}`.toUpperCase() });
      const scan = await inspectOptimization(control); assert.equal(scan.unusedCount, 1); assert.ok(scan.duplicateBytes > 0);
      const optimized = await control.withLock(check => optimizeStorage(control, actor, "OPTIMIZE STORAGE", check)); assert.equal(optimized.removedImages, 1);
      assert.equal(await db.collection("offer_images").findOne({ _id: images[0]._id }), null); assert.ok(await db.collection("offer_images").findOne({ _id: images[1]._id }));
      assert.equal((await db.collection("data_control_backups").findOne({ _id: optimized.backupId })).status, "verified");
    });
    await t.test("image optimization bounds pixel size and preserves decodability", async () => {
      const original = await sharp(randomBytes(2400 * 1600 * 3), { raw: { width: 2400, height: 1600, channels: 3 } }).png().toBuffer();
      const result = await optimizedImage(original, "image/png"), metadata = await sharp(result.bytes).metadata(); assert.ok(metadata.width <= 1920); assert.ok(result.bytes.length <= original.length);
      const legacy = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4l8AAAAASUVORK5CYII=", "base64"); assert.deepEqual((await optimizedImage(legacy, "image/png")).bytes, legacy);
    });
    const audit = await json("/audit"); assert.ok(audit.total > 10); assert.ok((await json("/reports")).total >= 1);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await control.stop();
    assert.match(databaseName, /^eternal_dc_test_[a-f0-9]{16}$/); await db.dropDatabase(); await client.close();
    const target = resolve(root); assert.ok(target.startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/")) && target.includes("eternal-data-control-")); await rm(target, { recursive: true, force: true });
  }
});
