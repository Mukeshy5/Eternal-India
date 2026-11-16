import express from "express";
import { rateLimit } from "express-rate-limit";
import { authenticatePanel } from "../lib/panel-auth.js";
import { catalog, fail } from "./catalog.js";
import { exportRecords } from "./exports.js";
import { inspectOptimization, optimizeStorage } from "./optimization.js";

export function registerDataControl({ app, control, db, config }) {
  const router = express.Router();
  router.use(async (req, res, next) => {
    const result = await authenticatePanel({ db, config, token: req.cookies?.["eternal_india.auth"], panel: "technical" });
    if (!result.admin) return res.status(result.status).json({ message: "Sign in with an authorized Technical Panel account." });
    req.admin = result.admin; next();
  });
  router.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));
  const locked = action => async (req, res) => res.json(await control.withQueuedLock(check => action(req, check)));
  router.get("/catalog", (_req, res) => res.json({ sections: Object.entries(catalog).map(([key, value]) => ({ key, label: value.label, protected: Boolean(value.protected) })) }));
  router.get("/storage", async (_req, res) => res.json(await control.overview()));
  router.get("/statistics", async (req, res) => res.json({ points: await control.history(req.query.period || "day") }));
  router.get("/records/:key", async (req, res) => res.json(await control.list(req.params.key, req.query)));
  router.post("/records/:key/export", async (req, res) => exportRecords(control, req.params.key, req.body.filter || {}, req.body.format, res, req.admin));
  router.post("/records/:key/preview", async (req, res) => res.json(await control.preview(req.params.key, req.body.filter || {}, req.admin)));
  router.post("/records/execute", locked((req, check) => {
    if (req.body.confirm !== true || typeof req.body.previewId !== "string") throw fail(400, "Explicit confirmation is required.");
    return control.executePreview(req.body.previewId, req.admin, check);
  }));
  router.get("/backups", async (req, res) => {
    const page = Number(req.query.page || 1); if (!Number.isInteger(page) || page < 1 || page > 100000) throw fail(400, "Invalid backup page.");
    const filter = { status: { $ne: "deleted" } };
    res.json({ backups: await db.collection("data_control_backups").find(filter).sort({ createdAt: -1 }).skip((page - 1) * 25).limit(25).toArray(), total: await db.collection("data_control_backups").countDocuments(filter), page });
  });
  router.post("/backups", locked((req, check) => control.createBackup({ actor: req.admin, key: req.body.section || undefined, input: req.body.filter || {}, check })));
  router.post("/backups/:id/verify", locked(req => control.verifyBackup(req.params.id, req.admin)));
  router.get("/backups/:id/download", async (req, res) => {
    await control.readBackup(req.params.id); await control.audit(req.admin, "backup.download-started", { backupId: req.params.id });
    res.download(control.backupPath(req.params.id), `eternal-india-${req.params.id}.ndjson.gz`, error => { void control.audit(req.admin, error ? "backup.download-failed" : "backup.download-completed", { backupId: req.params.id }).catch(() => {}); if (error && !res.headersSent) res.status(409).json({ message: "Backup download failed. Verify the file and try again." }); });
  });
  router.delete("/backups/:id", locked(async (req, check) => { if (req.body.confirm !== true) throw fail(400, "Confirm backup deletion."); await control.deleteBackup(req.params.id, req.admin, check); return { message: "Backup deleted." }; }));
  router.post("/backups/:id/restore", locked((req, check) => control.restore(req.params.id, req.admin, req.body.confirmation, check)));
  router.get("/policy", async (_req, res) => res.json(await control.settings()));
  router.put("/policy", locked(req => control.saveSettings(req.body, req.admin)));
  router.post("/cleanup", locked((req, check) => { if (req.body.confirm !== true) throw fail(400, "Confirm cleanup before continuing."); return control.cleanup(req.admin, check); }));
  router.get("/optimization", async (_req, res) => res.json(await inspectOptimization(control)));
  router.post("/optimization", locked((req, check) => optimizeStorage(control, req.admin, req.body.confirmation, check)));
  for (const [route, collection] of [["audit", "data_control_audit"], ["reports", "data_control_reports"]]) router.get(`/${route}`, async (req, res) => {
    const page = Number(req.query.page || 1); if (!Number.isInteger(page) || page < 1 || page > 100000) throw fail(400, "Invalid page.");
    res.json({ records: await db.collection(collection).find({}).sort({ [route === "audit" ? "at" : "at"]: -1 }).skip((page - 1) * 25).limit(25).toArray(), total: await db.collection(collection).countDocuments({}), page });
  });
  app.use("/api/technical/data-control", router);
}

export function storageWriteGuard(control, { config } = {}) {
  return async (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || /^\/(?:technical\/data-control|(?:admin|technical|staff|auth)\/(?:login|logout|me|password|forgot-password|reset-password|socket-ticket)|enquiries)\b/.test(req.path)) return next();
    try {
      const businessDelete = req.method === "DELETE" && /^\/(?:(?:admin|technical)\/)?(?:enquiries|invoices|vouchers|staff(?:-attendance|-calendar)?|hotels|gst|office-addresses|letters|festival-decorations|festivals|festival-schedules|decoration-history|promotions|offer-images)(?:\/|$)/.test(req.path);
      if (businessDelete && config) {
        const panel = req.path.startsWith("/technical/") ? "technical" : req.path.startsWith("/admin/") ? "admin" : "either";
        const access = await authenticatePanel({ db: control.db, config, token: req.cookies?.["eternal_india.auth"], panel });
        if (!access.admin) return next(); // The existing route returns its normal authentication error.
        const controller = new AbortController();
        const cancel = () => { if (!res.writableFinished) controller.abort(); };
        res.once("close", cancel);
        try {
            await control.withQueuedLock(async check => {
              const backup = await control.createBackup({ actor: access.admin, reason: "before-manual-delete", check });
              await check();
              res.set("X-Data-Control-Backup", backup._id);
              await control.audit(access.admin, "manual-delete.started", { path: req.path, backupId: backup._id });
              await check();
              await new Promise(resolve => { res.once("finish", resolve); res.once("close", resolve); next(); });
              await control.audit(access.admin, "manual-delete.finished", { path: req.path, backupId: backup._id, status: res.statusCode });
            }, { signal: controller.signal });
        } catch (error) { if (!controller.signal.aborted) throw error; }
        finally { res.off("close", cancel); }
        return;
      }
      // Reserve space for BSON/index growth before accepting a storage-increasing HTTP write.
      let id;
      // Admission is serialized, while ordinary requests can continue concurrently.
      for (let attempt = 0; attempt < 100; attempt++) {
        try { id = await control.reserveWrite(req.method === "DELETE" ? 0 : Math.max(2 * 1024 * 1024, Number(req.get("content-length") || 0) * 2)); break; }
        catch (error) { if (error.status !== 409 || attempt === 99) throw error; await new Promise(resolve => setTimeout(resolve, 50)); }
      }
      const pulse = setInterval(() => { void control.db.collection("data_control_runtime").updateOne({ _id: id }, { $set: { until: new Date(Date.now() + 120000) } }).catch(() => {}); }, 30000); pulse.unref();
      const release = () => { clearInterval(pulse); void control.db.collection("data_control_runtime").deleteOne({ _id: id }).catch(() => {}); };
      res.once("finish", release); res.once("close", release);
      next();
    } catch (error) { next(error); }
  };
}
