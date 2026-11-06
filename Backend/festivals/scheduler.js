import { randomUUID, createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { ObjectId } from "mongodb";
import { dayjs } from "./validation.js";
import { currentOccurrence, nextOccurrence, occurrenceKey } from "./scheduling.js";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createDecorationScheduler(db, { clock = () => new Date(), intervalMs = 1000 } = {}) {
  const events = new EventEmitter(); events.setMaxListeners(0);
  const owner = randomUUID();
  let work = Promise.resolve();
  let stopped = false;
  let lastPublicHash = "";

  async function reconcileOnce() {
    if (stopped) return;
    const now = clock();
    let lease;
    try {
      lease = await db.collection("decoration_runtime").findOneAndUpdate({ _id: "lease", $or: [{ until: { $lte: now } }, { owner }] }, { $set: { owner, until: new Date(now.getTime() + 15000) } }, { upsert: true, returnDocument: "after" });
    } catch (error) { if (error.code === 11000) return; throw error; }
    if (!lease || lease.owner !== owner) return;
    try {
      const [settings, effects, festivals, schedules, control, previous] = await Promise.all([
        db.collection("decoration_settings").findOne({ _id: "global" }),
        db.collection("decoration_effects").find({ enabled: true }).toArray(),
        db.collection("festival_decorations").find({ enabled: true, published: true }).toArray(),
        db.collection("festival_schedules").find({ enabled: true }).toArray(),
        db.collection("decoration_runtime").findOne({ _id: "control" }),
        db.collection("decoration_runtime").findOne({ _id: "state" }),
      ]);
      const enabledIds = new Set(effects.map((effect) => effect._id));
      const byId = new Map(festivals.map((festival) => [festival._id.toString(), festival]));
      const suppressed = new Set((control?.suppressed || []).filter((item) => new Date(item.until) > now).map((item) => item.key));
      const candidates = [];
      if (settings?.enabled) {
        for (const schedule of schedules) {
          const festival = byId.get(schedule.festivalId);
          const window = festival && currentOccurrence(schedule, now);
          if (window && !suppressed.has(occurrenceKey(schedule, window))) candidates.push({ festival, source: "schedule", scheduleId: schedule._id.toString(), startsAt: window.start, endsAt: window.end, priority: schedule.priority });
        }
        const manual = byId.get(control?.manualId);
        if (manual && (!control.manualUntil || new Date(control.manualUntil) > now)) candidates.push({ festival: manual, source: "manual", priority: 1001, startsAt: control.activatedAt, endsAt: control.manualUntil || null });
      }
      candidates.sort((a, b) => b.priority - a.priority || b.festival.priority - a.festival.priority || a.festival._id.toString().localeCompare(b.festival._id.toString()));
      const winner = candidates.find((candidate) => candidate.festival.selectedEffects.some((id) => enabledIds.has(id)));
      const active = winner ? [{ decorationId: winner.festival._id.toString(), scheduleId: winner.scheduleId || null, source: winner.source, startsAt: winner.startsAt, endsAt: winner.endsAt }] : [];
      const previousSignature = hash(previous?.active || []);
      const signature = hash(active);
      const changed = previousSignature !== signature;
      const state = { active, checkedAt: now, lastActivatedAt: changed && active.length ? now : previous?.lastActivatedAt || null };
      await db.collection("decoration_runtime").updateOne({ _id: "state" }, { $set: state }, { upsert: true });
      if (changed) {
        const actor = { id: "system", email: "Backend scheduler", role: "system" };
        await db.collection("decoration_activity").insertOne({ action: active.length ? "decoration_activated" : "decoration_deactivated", decorationId: active[0]?.decorationId || previous?.active?.[0]?.decorationId || null, festivalName: winner?.festival.name || previous?.festivalName || "", performedBy: actor, performedByRole: "system", previousValues: { active: previous?.active || [] }, newValues: { active }, timestamp: now, remarks: active.length ? `Activated by ${winner.source}; highest priority wins.` : "No eligible published decoration or master OFF." });
      }
      if (winner) await db.collection("decoration_runtime").updateOne({ _id: "state" }, { $set: { festivalName: winner.festival.name } });
      const publicState = await readPublicState();
      const publicHash = hash({ enabled: publicState.enabled, settings: publicState.settings, decorations: publicState.decorations });
      if (publicHash !== lastPublicHash) { lastPublicHash = publicHash; events.emit("change", publicState); }
      await db.collection("decoration_runtime").updateOne({ _id: "control" }, { $pull: { suppressed: { until: { $lte: now } } } });
    } finally {
      await db.collection("decoration_runtime").updateOne({ _id: "lease", owner }, { $set: { until: new Date(0) } });
    }
  }
  function reconcile() {
    const next = work.then(reconcileOnce);
    work = next.catch(() => {});
    return next;
  }
  async function readPublicState() {
    const now = clock();
    const [settings, runtime, effects] = await Promise.all([
      db.collection("decoration_settings").findOne({ _id: "global" }),
      db.collection("decoration_runtime").findOne({ _id: "state" }),
      db.collection("decoration_effects").find({ enabled: true }, { projection: { _id: 1 } }).toArray(),
    ]);
    const publicSettings = settings ? Object.fromEntries(["enabled", "visitorHideButton", "greetingEnabled", "musicEnabled", "mobileOptimization", "reducedMotion"].map((key) => [key, settings[key]])) : { enabled: false };
    const decorations = [];
    if (settings?.enabled) {
      const enabled = new Set(effects.map((effect) => effect._id));
      for (const active of runtime?.active || []) {
        if (active.endsAt && new Date(active.endsAt) <= now) continue;
        const festival = await db.collection("festival_decorations").findOne({ _id: new ObjectId(active.decorationId), enabled: true, published: true });
        if (!festival) continue;
        const selectedEffects = festival.selectedEffects.filter((id) => enabled.has(id));
        if (!selectedEffects.length) continue;
        const entry = { id: festival._id.toString(), name: festival.name, selectedEffects, startsAt: active.startsAt, endsAt: active.endsAt, source: active.source };
        for (const key of ["intensity", "animationSpeed", "particleDensity", "opacity", "backgroundColor", "displayPosition", "greetingEnabled", "greetingMessage", "greetingColor", "musicEnabled", "musicUrl", "bannerImage"]) entry[key] = festival[key];
        const year = Number(dayjs(now).tz(settings.timezone).format("YYYY"));
        entry.countdownAt = dayjs.tz(`${year + 1}-01-01 00:00`, settings.timezone).toISOString();
        decorations.push(entry);
      }
    }
    return { enabled: !!settings?.enabled, decorations, settings: publicSettings, serverTime: now.toISOString() };
  }
  async function publicState() { await reconcile(); return readPublicState(); }
  async function dashboard() {
    await reconcile();
    const now = clock();
    const [effects, schedules, festivals, runtime, settings, recentActivity] = await Promise.all([
      db.collection("decoration_effects").find({}).toArray(), db.collection("festival_schedules").find({}).toArray(),
      db.collection("festival_decorations").find({}).toArray(), db.collection("decoration_runtime").findOne({ _id: "state" }),
      db.collection("decoration_settings").findOne({ _id: "global" }), db.collection("decoration_activity").find({}).sort({ timestamp: -1, _id: -1 }).limit(10).toArray(),
    ]);
    const byId = new Map(festivals.map((item) => [item._id.toString(), item]));
    const upcoming = schedules.filter((schedule) => schedule.enabled && byId.get(schedule.festivalId)?.enabled).map((schedule) => ({ scheduleId: schedule._id, festivalId: schedule.festivalId, name: byId.get(schedule.festivalId)?.name, ...nextOccurrence(schedule, now) })).filter((item) => item.start).sort((a, b) => a.start - b.start);
    return { stats: { totalEffects: effects.length, scheduledFestivals: new Set(schedules.filter((schedule) => schedule.enabled).map((schedule) => schedule.festivalId)).size, activeDecorations: runtime?.active?.length || 0, upcomingFestivals: upcoming.length, expiredDecorations: new Set(schedules.filter((schedule) => !schedule.recurringYearly && new Date(schedule.endAt) <= now).map((schedule) => schedule.festivalId)).size, enabledEffects: effects.filter((effect) => effect.enabled).length, disabledEffects: effects.filter((effect) => !effect.enabled).length, totalFestivals: festivals.length }, activeFestival: runtime?.active?.length ? byId.get(runtime.active[0].decorationId)?.name : null, nextFestival: upcoming[0] || null, upcoming: upcoming.slice(0, 8), status: !settings?.enabled ? "Master OFF" : runtime?.active?.length ? "Active" : "Waiting for a published festival", lastActivationDate: runtime?.lastActivatedAt || null, lastModifiedBy: recentActivity.find((item) => item.performedByRole !== "system")?.performedBy || null, recentlyUpdated: festivals.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5), recentActivity, serverTime: now };
  }
  const timer = intervalMs > 0 ? setInterval(() => { void reconcile().catch((error) => console.error("Festival scheduler:", error.name)); }, intervalMs) : null;
  timer?.unref();
  return { events, reconcile, publicState, dashboard, clock, async stop() { stopped = true; if (timer) clearInterval(timer); events.emit("stop"); await work; } };
}
