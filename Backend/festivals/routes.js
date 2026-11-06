import express from "express";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { globalDecorationDefaults } from "../../shared/decorationCatalog.js";
import { ensureDecorationModels } from "./models.js";
import { technicalGuard, technicalAccess } from "./permissions.js";
import { asId, validId, validDate, validateDecoration, validateSchedule, validateSettings, zonedDate } from "./validation.js";
import { currentOccurrence, occurrenceKey, schedulesConflict } from "./scheduling.js";
import { createDecorationScheduler } from "./scheduler.js";

const fail = (res, errors) => res.status(400).json({ message: Object.values(errors).join(" "), errors });
const actorFor = (req) => ({ id: req.admin._id.toString(), email: req.admin.email, role: "technical" });
const imageType = (bytes) => {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "image/gif";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
};

export function registerFestivalRoutes({ app, db, requireAdmin, config, schedulerOptions }) {
  const ready = ensureDecorationModels(db);
  // Do not start ticking until MongoDB indexes and real library definitions exist.
  const scheduler = createDecorationScheduler(db, { ...schedulerOptions, intervalMs: 0 });
  let timer;
  let stopped = false;
  ready.then(async () => {
    if (stopped) return;
    await scheduler.reconcile();
    const interval = schedulerOptions?.intervalMs ?? 1000;
    if (interval > 0 && !stopped) { timer = setInterval(() => { void scheduler.reconcile().catch((error) => console.error("Festival scheduler:", error.name)); }, interval); timer.unref(); }
  }).catch((error) => console.error("Festival initialization:", error.name));
  const stop = scheduler.stop;
  scheduler.stop = async () => { stopped = true; if (timer) clearInterval(timer); await ready.catch(() => {}); await stop(); };
  const router = express.Router();
  const allow = (permission) => technicalGuard(requireAdmin, config, permission);
  router.use(async (_req, _res, next) => { await ready; next(); });
  const audit = (req, action, previousValues, newValues, remarks = "") => db.collection("decoration_activity").insertOne({ action, decorationId: newValues?.festivalId || previousValues?.festivalId || newValues?._id?.toString() || previousValues?._id?.toString() || null, festivalName: newValues?.name || previousValues?.name || "", performedBy: actorFor(req), performedByRole: "technical", previousValues: previousValues || null, newValues: newValues || null, timestamp: scheduler.clock(), remarks });
  async function withScheduleLock(res, operation) {
    const token = randomUUID();
    try {
      await db.collection("decoration_runtime").findOneAndUpdate({ _id: "schedule-lock", until: { $lte: new Date() } }, { $set: { owner: token, until: new Date(Date.now() + 15000) } }, { upsert: true });
    } catch (error) { if (error.code === 11000) return res.status(409).json({ message: "Another schedule or festival is being saved. Please retry." }); throw error; }
    try { return await operation(); }
    finally { await db.collection("decoration_runtime").updateOne({ _id: "schedule-lock", owner: token }, { $set: { until: new Date(0) } }); }
  }
  const getFestival = async (req, res) => {
    if (!validId(req.params.id)) { res.status(400).json({ message: "Choose a valid festival." }); return null; }
    const record = await db.collection("festival_decorations").findOne({ _id: asId(req.params.id) });
    if (!record) res.status(404).json({ message: "Festival not found." });
    return record;
  };
  const assertBanner = async (decoration, res) => {
    if (!decoration.bannerImage) return true;
    const found = await db.collection("decoration_assets").findOne({ _id: asId(decoration.bannerImage.split("/").at(-1)) }, { projection: { _id: 1 } });
    if (!found) { res.status(400).json({ message: "This banner is unavailable. Upload it again." }); return false; }
    return true;
  };
  router.get("/decoration-dashboard", ...allow("dashboard"), async (_req, res) => res.json(await scheduler.dashboard()));
  router.get("/decoration-effects", ...allow("effects"), async (_req, res) => res.json({ effects: await db.collection("decoration_effects").find({}).sort({ group: 1, name: 1 }).toArray() }));
  router.patch("/decoration-effects/:id", ...allow("settings"), async (req, res) => {
    if (typeof req.body?.enabled !== "boolean") return fail(res, { enabled: "Choose enabled or disabled." });
    const previous = await db.collection("decoration_effects").findOne({ _id: req.params.id });
    if (!previous) return res.status(404).json({ message: "Effect not found." });
    const changes = { enabled: req.body.enabled, updatedAt: scheduler.clock(), updatedBy: actorFor(req) };
    await db.collection("decoration_effects").updateOne({ _id: previous._id }, { $set: changes });
    await audit(req, "effect_updated", previous, { ...previous, ...changes });
    await scheduler.reconcile(); res.json({ effect: { ...previous, ...changes } });
  });
  router.get("/festival-decorations/active", ...allow("dashboard"), async (_req, res) => res.json(await scheduler.publicState()));
  const listFestivals = async (_req, res) => res.json({ festivals: await db.collection("festival_decorations").find({}).sort({ updatedAt: -1, _id: -1 }).limit(1000).toArray() });
  const createFestival = async (req, res) => {
    const { errors, decoration } = validateDecoration(req.body);
    if (Object.keys(errors).length) return fail(res, errors);
    if (!await assertBanner(decoration, res)) return;
    const now = scheduler.clock();
    const record = { ...decoration, published: false, createdBy: actorFor(req), updatedBy: actorFor(req), createdAt: now, updatedAt: now };
    const result = await db.collection("festival_decorations").insertOne(record); record._id = result.insertedId;
    await audit(req, "festival_created", null, record); res.status(201).json({ festival: record });
  };
  const updateFestival = async (req, res) => {
    const previous = await getFestival(req, res); if (!previous) return;
    const { errors, decoration } = validateDecoration(req.body);
    if (Object.keys(errors).length) return fail(res, errors);
    if (!await assertBanner(decoration, res)) return;
    // Editing a published record creates a draft. Publishing permission is required again.
    const changes = { ...decoration, published: false, updatedBy: actorFor(req), updatedAt: scheduler.clock() };
    await db.collection("festival_decorations").updateOne({ _id: previous._id }, { $set: changes });
    await audit(req, "festival_updated", previous, { ...previous, ...changes });
    await scheduler.reconcile(); res.json({ festival: { ...previous, ...changes } });
  };
  const deleteFestival = async (req, res) => {
    return withScheduleLock(res, async () => {
      const previous = await getFestival(req, res); if (!previous) return;
      if (await db.collection("festival_schedules").countDocuments({ festivalId: previous._id.toString() })) return res.status(409).json({ message: "Remove this festival’s schedules before deleting it." });
      await db.collection("festival_decorations").deleteOne({ _id: previous._id });
      await audit(req, "festival_deleted", previous, null); await scheduler.reconcile(); res.sendStatus(204);
    });
  };
  for (const path of ["/festival-decorations", "/festivals"]) {
    router.get(path, ...allow("dashboard"), listFestivals);
    router.post(path, ...allow("createFestival"), createFestival);
    router.get(`${path}/:id`, ...allow("dashboard"), async (req, res) => { const festival = await getFestival(req, res); if (festival) res.json({ festival }); });
    router.put(`${path}/:id`, ...allow("editFestival"), updateFestival);
    router.delete(`${path}/:id`, ...allow("deleteFestival"), deleteFestival);
  }
  router.patch("/festival-decorations/:id/toggle", ...allow("activate"), async (req, res) => {
    const previous = await getFestival(req, res); if (!previous) return;
    if (typeof req.body?.enabled !== "boolean") return fail(res, { enabled: "Choose enabled or disabled." });
    const changes = { enabled: req.body.enabled, updatedAt: scheduler.clock(), updatedBy: actorFor(req) };
    await db.collection("festival_decorations").updateOne({ _id: previous._id }, { $set: changes });
    await audit(req, "festival_toggled", previous, { ...previous, ...changes }); await scheduler.reconcile(); res.json({ festival: { ...previous, ...changes } });
  });
  router.patch("/festival-decorations/:id/publish", ...allow("publish"), async (req, res) => {
    const previous = await getFestival(req, res); if (!previous) return;
    if (typeof req.body?.published !== "boolean") return fail(res, { published: "Choose published or draft." });
    if (req.body.published) {
      const enabled = await db.collection("decoration_effects").countDocuments({ _id: { $in: previous.selectedEffects }, enabled: true });
      if (enabled !== previous.selectedEffects.length) return res.status(409).json({ message: "Enable all selected effects in the library before publishing." });
    }
    const changes = { published: req.body.published, updatedAt: scheduler.clock(), updatedBy: actorFor(req) };
    await db.collection("festival_decorations").updateOne({ _id: previous._id }, { $set: changes });
    await audit(req, req.body.published ? "decoration_published" : "decoration_unpublished", previous, { ...previous, ...changes });
    await scheduler.reconcile(); res.json({ festival: { ...previous, ...changes } });
  });
  router.post("/festival-decorations/:id/activate", ...allow("activate"), async (req, res) => {
    const festival = await getFestival(req, res); if (!festival) return;
    const settings = await db.collection("decoration_settings").findOne({ _id: "global" });
    if (!settings.enabled || !festival.enabled || !festival.published) return res.status(409).json({ message: "Enable the system and festival, then publish the decoration before activating it." });
    const now = scheduler.clock();
    const schedules = await db.collection("festival_schedules").find({ festivalId: festival._id.toString(), enabled: true }).toArray();
    const ends = schedules.map((schedule) => currentOccurrence(schedule, now)?.end).filter(Boolean).sort((a, b) => b - a);
    const previous = await db.collection("decoration_runtime").findOne({ _id: "control" });
    const changes = { manualId: festival._id.toString(), manualUntil: ends[0] || null, activatedAt: now };
    await db.collection("decoration_runtime").updateOne({ _id: "control" }, { $set: changes });
    await audit(req, "manual_activation", previous, { ...changes, festivalId: festival._id.toString(), name: festival.name });
    await scheduler.reconcile(); res.json(await scheduler.publicState());
  });
  router.post("/festival-decorations/:id/deactivate", ...allow("activate"), async (req, res) => {
    const festival = await getFestival(req, res); if (!festival) return;
    const now = scheduler.clock();
    const schedules = await db.collection("festival_schedules").find({ festivalId: festival._id.toString(), enabled: true }).toArray();
    const suppressed = schedules.flatMap((schedule) => { const window = currentOccurrence(schedule, now); return window ? [{ key: occurrenceKey(schedule, window), until: window.end }] : []; });
    const previous = await db.collection("decoration_runtime").findOne({ _id: "control" });
    const changes = { manualId: previous.manualId === festival._id.toString() ? null : previous.manualId, manualUntil: previous.manualId === festival._id.toString() ? null : previous.manualUntil };
    await db.collection("decoration_runtime").updateOne({ _id: "control" }, { $set: changes, ...(suppressed.length ? { $addToSet: { suppressed: { $each: suppressed } } } : {}) });
    await audit(req, "manual_deactivation", previous, { ...changes, festivalId: festival._id.toString(), name: festival.name, suppressed }, "Current scheduled occurrences stay OFF until they expire.");
    await scheduler.reconcile(); res.json(await scheduler.publicState());
  });

  async function saveSchedule(req, res) {
    const { errors, schedule } = validateSchedule(req.body);
    if (Object.keys(errors).length) return fail(res, errors);
    schedule.festivalId = schedule.festivalId.toLowerCase();
    if (req.params.id && !validId(req.params.id)) return fail(res, { id: "Choose a valid schedule." });
    const now = scheduler.clock();
    return withScheduleLock(res, async () => {
      const festival = await db.collection("festival_decorations").findOne({ _id: asId(schedule.festivalId) });
      if (!festival) return res.status(404).json({ message: "Festival not found." });
      const previous = req.params.id ? await db.collection("festival_schedules").findOne({ _id: asId(req.params.id) }) : null;
      if (req.params.id && !previous) return res.status(404).json({ message: "Schedule not found." });
      const existing = await db.collection("festival_schedules").find({ enabled: true, ...(previous ? { _id: { $ne: previous._id } } : {}) }).toArray();
      const conflict = existing.find((item) => schedulesConflict(schedule, item, now));
      if (conflict) return res.status(409).json({ message: "This time overlaps an enabled schedule at the same priority. Change its dates or priority.", conflictingScheduleId: conflict._id });
      const record = { ...schedule, updatedAt: now, updatedBy: actorFor(req) };
      if (previous) await db.collection("festival_schedules").updateOne({ _id: previous._id }, { $set: record });
      else { record.createdAt = now; record.createdBy = actorFor(req); record._id = (await db.collection("festival_schedules").insertOne(record)).insertedId; }
      await audit(req, previous ? "schedule_updated" : "schedule_created", previous, { ...record, name: festival.name }, `Timezone: ${schedule.timezone}`);
      await scheduler.reconcile(); res.status(previous ? 200 : 201).json({ schedule: { ...previous, ...record } });
    });
  }
  router.get("/festival-schedules", ...allow("dashboard"), async (_req, res) => res.json({ schedules: await db.collection("festival_schedules").find({}).sort({ updatedAt: -1 }).limit(1000).toArray() }));
  router.post("/festival-schedules", ...allow("createSchedule"), saveSchedule);
  router.put("/festival-schedules/:id", ...allow("editSchedule"), saveSchedule);
  router.delete("/festival-schedules/:id", ...allow("deleteSchedule"), async (req, res) => {
    if (!validId(req.params.id)) return fail(res, { id: "Choose a valid schedule." });
    return withScheduleLock(res, async () => {
      const previous = await db.collection("festival_schedules").findOne({ _id: asId(req.params.id) });
      if (!previous) return res.status(404).json({ message: "Schedule not found." });
      const festival = await db.collection("festival_decorations").findOne({ _id: asId(previous.festivalId) }, { projection: { name: 1 } });
      await db.collection("festival_schedules").deleteOne({ _id: previous._id }); await audit(req, "schedule_deleted", { ...previous, name: festival?.name || "" }, null); await scheduler.reconcile(); res.sendStatus(204);
    });
  });
  router.get("/decoration-settings", ...allow(["dashboard", "settings"]), async (req, res) => res.json({ settings: await db.collection("decoration_settings").findOne({ _id: "global" }), permissions: technicalAccess(req.admin, config).permissions }));
  const saveSettings = async (req, res, restore = false) => {
    const { errors, settings } = validateSettings(restore ? globalDecorationDefaults : req.body);
    if (Object.keys(errors).length) return fail(res, errors);
    const previous = await db.collection("decoration_settings").findOne({ _id: "global" });
    const changes = { ...settings, updatedAt: scheduler.clock(), updatedBy: actorFor(req) };
    await db.collection("decoration_settings").updateOne({ _id: "global" }, { $set: changes });
    await audit(req, restore ? "settings_restored" : "settings_updated", previous, changes); await scheduler.reconcile(); res.json({ settings: { ...previous, ...changes } });
  };
  router.put("/decoration-settings", ...allow("settings"), (req, res) => saveSettings(req, res));
  router.post("/decoration-settings/restore-defaults", ...allow("settings"), (req, res) => saveSettings(req, res, true));
  router.get("/decoration-history", ...allow("history"), async (req, res) => {
    const filter = {};
    const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
    if (typeof req.query.action === "string" && req.query.action) filter.action = req.query.action.slice(0, 80);
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const pattern = req.query.search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = ["festivalName", "performedBy.email", "remarks"].map((key) => ({ [key]: { $regex: pattern, $options: "i" } }));
    }
    const settings = await db.collection("decoration_settings").findOne({ _id: "global" });
    if (req.query.from || req.query.to) {
      if ((req.query.from && !validDate(req.query.from)) || (req.query.to && !validDate(req.query.to))) return fail(res, { dates: "Use valid history filter dates." });
      if (req.query.from && req.query.to && req.query.from > req.query.to) return fail(res, { dates: "The history end date cannot be before its start date." });
      filter.timestamp = {};
      if (req.query.from) filter.timestamp.$gte = zonedDate(req.query.from, "00:00", settings.timezone);
      if (req.query.to) { const nextDay = new Date(`${req.query.to}T00:00:00Z`); nextDay.setUTCDate(nextDay.getUTCDate() + 1); filter.timestamp.$lt = zonedDate(nextDay.toISOString().slice(0, 10), "00:00", settings.timezone); }
      if (Object.values(filter.timestamp).some((value) => !value)) return fail(res, { dates: "This date boundary does not exist in the configured timezone." });
    }
    const [history, total] = await Promise.all([db.collection("decoration_activity").find(filter).sort({ timestamp: -1, _id: -1 }).skip((page - 1) * 25).limit(25).toArray(), db.collection("decoration_activity").countDocuments(filter)]);
    res.json({ history, total, page, pages: Math.max(1, Math.ceil(total / 25)), timezone: settings.timezone });
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 } }).single("image");
  router.post("/festival-assets", ...allow(["createFestival", "editFestival"]), (req, res, next) => upload(req, res, (error) => error ? res.status(400).json({ message: "Upload one image up to 2 MB." }) : next()), async (req, res) => {
    const contentType = req.file && imageType(req.file.buffer);
    if (!contentType) return fail(res, { image: "Use a JPG, PNG, WebP or GIF image." });
    const result = await db.collection("decoration_assets").insertOne({ data: req.file.buffer, contentType, createdAt: scheduler.clock(), createdBy: actorFor(req) });
    res.status(201).json({ image: `/api/public/festival-assets/${result.insertedId}` });
  });
  app.use("/api/technical", router);
  app.get("/api/public/festival-assets/:id", async (req, res) => {
    if (!validId(req.params.id)) return res.status(404).json({ message: "Image not found." });
    const image = await db.collection("decoration_assets").findOne({ _id: asId(req.params.id) });
    if (!image) return res.status(404).json({ message: "Image not found." });
    res.set({ "Content-Type": image.contentType, "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" }).send(Buffer.from(image.data.buffer));
  });
  const publicLimit = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Please wait a moment before refreshing decorations." } });
  app.get("/api/public/festival-decorations/active", publicLimit, async (_req, res) => { await ready; res.json(await scheduler.publicState()); });
  app.get("/api/public/festival-decorations/events", publicLimit, async (req, res) => {
    await ready;
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" }); res.flushHeaders();
    const send = (state) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(state)}\n\n`); };
    const end = () => res.end();
    scheduler.events.on("change", send); scheduler.events.on("stop", end);
    const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(": heartbeat\n\n"); }, 20000); heartbeat.unref();
    req.on("close", () => { clearInterval(heartbeat); scheduler.events.off("change", send); scheduler.events.off("stop", end); });
    send(await scheduler.publicState());
  });
  return { scheduler, ready };
}
