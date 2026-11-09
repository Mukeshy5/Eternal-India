import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { createApp } from "../app.js";
import { cookieHeader } from "../lib/cookies.js";
import { animationDefaults, decorationEffects, globalDecorationDefaults } from "../../shared/decorationCatalog.js";
import { validateSchedule, zonedDate } from "../festivals/validation.js";
import { currentOccurrence, nextOccurrence, schedulesConflict } from "../festivals/scheduling.js";

test("yearly schedules use local time, New Year windows, leap years and priorities", () => {
  const make = (patch) => {
    const { errors, schedule } = validateSchedule({ festivalId: "000000000000000000000001", startDate: "2026-12-31", endDate: "2027-01-02", startTime: "20:00", endTime: "02:00", timezone: "Asia/Kolkata", recurringYearly: true, enabled: true, priority: 10, ...patch });
    assert.deepEqual(errors, {}); return schedule;
  };
  const newYear = make({});
  assert.equal(nextOccurrence(make({ startDate: "2040-12-31", endDate: "2041-01-02" }), new Date("2026-01-01T00:00:00Z")).start.toISOString(), "2040-12-31T14:30:00.000Z", "far-future annual schedules remain discoverable");
  assert.equal(currentOccurrence(newYear, new Date("2026-01-01T00:00:00Z")), undefined, "recurrence never starts before the configured first year");
  assert.equal(currentOccurrence(newYear, new Date("2027-01-01T00:00:00Z")).start.toISOString(), "2026-12-31T14:30:00.000Z");
  assert.equal(currentOccurrence(newYear, new Date("2028-01-01T00:00:00Z")).end.toISOString(), "2028-01-01T20:30:00.000Z");
  assert.equal(currentOccurrence(newYear, new Date("2027-01-01T20:30:00Z")), undefined, "end time is exclusive");
  const leap = make({ startDate: "2028-02-29", endDate: "2028-03-01", startTime: "00:00", endTime: "00:00" });
  assert.equal(currentOccurrence(leap, new Date("2029-02-28T20:00:00Z")), undefined);
  assert.equal(nextOccurrence(leap, new Date("2029-01-01T00:00:00Z")).start.toISOString(), "2032-02-28T18:30:00.000Z");
  assert.equal(schedulesConflict(newYear, make({ priority: 20 })), false);
  assert.equal(schedulesConflict(newYear, make({})), true);
  assert.ok(validateSchedule({ ...newYear, startDate: "2027-03-14", endDate: "2027-03-14", startTime: "02:30", endTime: "04:00", recurringYearly: false, timezone: "America/New_York" }).errors.timezone, "reject nonexistent DST local times");
  assert.equal(zonedDate("2026-11-01", "01:30", "America/New_York").toISOString(), "2026-11-01T05:30:00.000Z", "ambiguous DST local time consistently chooses the earlier occurrence");
});

test("real festival API, authorization, scheduling, publication, streams and persistence", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "")}`, adminEmail: "festival-owner@example.com", technicalEmail: "", adminPassword: "FestivalOwnerTest9" };
  const { client, db } = await connectDatabase(config);
  await ensureAdmin(db, config);
  const ordinary = await ensureAdmin(db, { ...config, adminEmail: "normal-admin@example.com" });
  const editor = await ensureAdmin(db, { ...config, adminEmail: "festival-editor@example.com" });
  await db.collection("admins").updateOne({ _id: editor._id }, { $set: { roles: ["admin", "technical"], technicalPermissions: ["dashboard", "effects", "createFestival", "editFestival", "createSchedule", "editSchedule", "history"] } });
  let now = new Date("2026-12-24T18:00:00Z");
  let instance = createApp({ client, db, config, schedulerOptions: { clock: () => now, intervalMs: 0 } });
  await instance.decorationsReady;
  let server = instance.app.listen(0, "127.0.0.1"); await once(server, "listening");
  let base = `http://127.0.0.1:${server.address().port}`;
  let cookie, ordinaryCookie, editorCookie;
  let festival, schedule;
  const request = (path, { method = "GET", body, sessionCookie = cookie } = {}) => fetch(`${base}/api${path}`, { method, headers: { Origin: "http://localhost:5173", "Content-Type": "application/json", ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const login = async (email, panel = "admin") => { const reply = await request(`/${panel}/login`, { method: "POST", body: { email, password: config.adminPassword }, sessionCookie: "" }); assert.equal(reply.status, 200); return cookieHeader(reply); };
  const festivalBody = { ...animationDefaults, name: "Christmas test", category: "International Celebrations", description: "An integration-test celebration", selectedEffects: ["christmas", "sparkles"], enabled: true, priority: 20, bannerImage: "", greetingMessage: "Season’s greetings" };
  const scheduleBody = () => ({ festivalId: festival._id, startDate: "2026-12-25", endDate: "2026-12-26", startTime: "00:00", endTime: "00:00", timezone: "Asia/Kolkata", recurringYearly: false, enabled: true, priority: 10 });
  const active = async () => (await (await request("/public/festival-decorations/active", { sessionCookie: "" })).json()).decorations;
  try {
    await t.test("technical authorization is independent of ordinary administrator login", async () => {
      const paths = ["decoration-dashboard", "decoration-effects", "festivals", "festival-schedules", "decoration-settings", "decoration-history", "festival-decorations/active"];
      for (const path of paths) assert.equal((await request(`/technical/${path}`, { sessionCookie: "" })).status, 401);
      ordinaryCookie = await login(ordinary.email);
      for (const path of paths) assert.equal((await request(`/technical/${path}`, { sessionCookie: ordinaryCookie })).status, 403);
      assert.equal((await request("/technical/login", { method: "POST", body: { email: ordinary.email, password: config.adminPassword }, sessionCookie: "" })).status, 403);
      assert.equal((await request("/admin/festivals", { sessionCookie: ordinaryCookie })).status, 404);
      assert.equal((await request("/admin/decoration-settings", { method: "PUT", body: globalDecorationDefaults, sessionCookie: ordinaryCookie })).status, 404);
      cookie = await login(config.adminEmail, "technical"); editorCookie = await login(editor.email, "technical");
      assert.ok((await (await request("/technical/me")).json()).admin.technicalPermissions.includes("publish"));
      assert.equal((await request("/technical/decoration-settings", { method: "PUT", body: globalDecorationDefaults, sessionCookie: editorCookie })).status, 403);
    });
    await t.test("library and dashboard use actual persisted definitions and counts", async () => {
      const { effects } = await (await request("/technical/decoration-effects")).json();
      assert.equal(effects.length, 36); assert.equal(effects.length, decorationEffects.length);
      assert.equal(await db.collection("decoration_effects").countDocuments(), 36);
      const dashboard = await (await request("/technical/decoration-dashboard")).json();
      assert.equal(dashboard.stats.totalEffects, 36); assert.equal(dashboard.stats.totalFestivals, 0); assert.equal(dashboard.stats.activeDecorations, 0);
      assert.equal((await request("/technical/decoration-effects/bubbles", { method: "PATCH", body: { enabled: false } })).status, 200);
      assert.equal((await (await request("/technical/decoration-dashboard")).json()).stats.disabledEffects, 1);
      assert.equal((await request("/technical/decoration-effects/bubbles", { method: "PATCH", body: { enabled: true } })).status, 200);
    });
    await t.test("festival CRUD validates inputs and editors cannot self-publish", async () => {
      for (const patch of [{ name: " " }, { selectedEffects: ["missing"] }, { selectedEffects: ["diwali", "holi"] }, { selectedEffects: [{ $ne: null }] }, { particleDensity: 500 }, { animationSpeed: 0 }, { opacity: -1 }, { musicEnabled: true, musicUrl: "javascript:alert(1)" }, { backgroundColor: "red" }, { displayPosition: "__proto__" }]) assert.equal((await request("/technical/festivals", { method: "POST", body: { ...festivalBody, ...patch } })).status, 400, JSON.stringify(patch));
      const reply = await request("/technical/festivals", { method: "POST", body: { ...festivalBody, published: true }, sessionCookie: editorCookie });
      assert.equal(reply.status, 201); festival = (await reply.json()).festival; assert.equal(festival.published, false);
      assert.equal(festival.createdBy.email, editor.email);
      assert.equal((await request(`/technical/festival-decorations/${festival._id}/publish`, { method: "PATCH", body: { published: true }, sessionCookie: editorCookie })).status, 403);
      assert.equal((await request(`/technical/festival-decorations/${festival._id}/activate`, { method: "POST", body: {}, sessionCookie: editorCookie })).status, 403);
      assert.equal((await request(`/technical/festival-decorations/${festival._id}/activate`, { method: "POST", body: {} })).status, 409, "drafts cannot be activated");
      assert.equal((await active()).length, 0);
      assert.equal((await request(`/technical/festival-decorations/${festival._id}/publish`, { method: "PATCH", body: { published: true } })).status, 200);
      const edited = await request(`/technical/festivals/${festival._id}`, { method: "PUT", body: { ...festivalBody, greetingMessage: "Merry Christmas", published: true }, sessionCookie: editorCookie });
      assert.equal(edited.status, 200); assert.equal((await edited.json()).festival.published, false, "edits become drafts instead of bypassing publication authorization");
      assert.equal((await request(`/technical/festival-decorations/${festival._id}/publish`, { method: "PATCH", body: { published: true } })).status, 200);
      assert.equal((await request(`/technical/festival-decorations/${festival._id}`)).status, 200);
    });
    await t.test("schedules activate on the backend, expire exactly and prevent equal-priority conflicts", async () => {
      const body = scheduleBody();
      for (const patch of [{ startDate: "2026-02-30" }, { endDate: "2026-12-24" }, { timezone: "Invalid/Timezone" }, { startTime: "25:00" }, { priority: "10" }]) assert.equal((await request("/technical/festival-schedules", { method: "POST", body: { ...body, ...patch } })).status, 400);
      const reply = await request("/technical/festival-schedules", { method: "POST", body }); assert.equal(reply.status, 201); schedule = (await reply.json()).schedule;
      const concurrentBody = { ...body, startDate: "2026-12-27", endDate: "2026-12-28", priority: 70 };
      const concurrent = await Promise.all([request("/technical/festival-schedules", { method: "POST", body: concurrentBody }), request("/technical/festival-schedules", { method: "POST", body: concurrentBody })]);
      assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 409], "concurrent schedule writes cannot bypass conflict prevention");
      const inserted = await concurrent.find((response) => response.status === 201).json(); await request(`/technical/festival-schedules/${inserted.schedule._id}`, { method: "DELETE" });
      assert.equal((await request("/technical/festival-schedules", { method: "POST", body })).status, 409);
      assert.equal((await active()).length, 0);
      now = new Date("2026-12-24T18:30:00Z");
      await instance.decorationScheduler.reconcile();
      assert.equal((await db.collection("decoration_runtime").findOne({ _id: "state" })).active[0].decorationId, festival._id, "activation does not require a visitor browser");
      const visible = await active(); assert.equal(visible[0].name, festivalBody.name); assert.equal(visible[0].greetingMessage, "Merry Christmas"); assert.equal(visible[0].createdBy, undefined); assert.equal(visible[0].published, undefined);
      now = new Date("2026-12-25T18:30:00Z"); await instance.decorationScheduler.reconcile(); assert.equal((await active()).length, 0);
      assert.equal((await (await request("/technical/decoration-dashboard")).json()).stats.expiredDecorations, 1);
      now = new Date("2026-12-24T19:00:00Z"); await instance.decorationScheduler.reconcile();
    });
    await t.test("higher-priority overlaps win and manual OFF suppresses the current occurrence", async () => {
      const second = await (await request("/technical/festival-decorations", { method: "POST", body: { ...festivalBody, name: "Priority celebration", selectedEffects: ["snowfall"] } })).json();
      const id = second.festival._id;
      assert.equal((await request(`/technical/festival-decorations/${id}/publish`, { method: "PATCH", body: { published: true } })).status, 200);
      const reply = await request("/technical/festival-schedules", { method: "POST", body: { ...scheduleBody(), festivalId: id, priority: 30 } }); assert.equal(reply.status, 201);
      assert.equal((await active())[0].id, id);
      await request(`/technical/festival-decorations/${id}/deactivate`, { method: "POST", body: {} });
      assert.equal((await active())[0].id, festival._id, "lower priority schedule resumes after OFF suppresses the winning occurrence");
      await request(`/technical/festival-decorations/${festival._id}/deactivate`, { method: "POST", body: {} });
      await instance.decorationScheduler.reconcile(); assert.equal((await active()).length, 0, "the scheduler cannot immediately re-enable a manually stopped occurrence");
      await request(`/technical/festival-decorations/${festival._id}/activate`, { method: "POST", body: {} }); assert.equal((await active())[0].source, "manual");
      const manual = await db.collection("decoration_runtime").findOne({ _id: "control" }); assert.equal(manual.manualUntil.toISOString(), "2026-12-25T18:30:00.000Z", "manual activation during a scheduled window still expires");
    });
    await t.test("master OFF pushes an immediate empty state and settings stay in MongoDB", async () => {
      const controller = new AbortController();
      const stream = await fetch(`${base}/api/public/festival-decorations/events`, { signal: controller.signal });
      assert.match(stream.headers.get("content-type"), /text\/event-stream/);
      const reader = stream.body.getReader(); const decoder = new TextDecoder();
      try {
        const first = decoder.decode((await reader.read()).value); assert.ok(first.includes(festival._id));
        const reply = await request("/technical/decoration-settings", { method: "PUT", body: { ...globalDecorationDefaults, enabled: false, musicEnabled: true } }); assert.equal(reply.status, 200);
        const changed = await Promise.race([reader.read(), new Promise((_, reject) => setTimeout(() => reject(new Error("No OFF stream event")), 2500))]);
        assert.ok(decoder.decode(changed.value).includes('"decorations":[]'));
        assert.equal((await active()).length, 0);
        assert.equal((await db.collection("decoration_settings").findOne({ _id: "global" })).enabled, false);
      } finally { controller.abort(); await reader.cancel().catch(() => {}); }
      assert.equal((await request("/technical/decoration-settings/restore-defaults", { method: "POST", body: {} })).status, 200);
      assert.equal((await active()).length, 1);
    });
    await t.test("festival assets are authenticated, validated and retrievable", async () => {
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4l8AAAAASUVORK5CYII=", "base64");
      const upload = (bytes, sessionCookie = cookie) => { const body = new FormData(); body.append("image", new Blob([bytes], { type: "image/png" }), "banner.png"); return fetch(`${base}/api/technical/festival-assets`, { method: "POST", headers: { Origin: "http://localhost:5173", ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, body }); };
      assert.equal((await upload(png, "")).status, 401); assert.equal((await upload(png, ordinaryCookie)).status, 403);
      assert.equal((await upload(Buffer.from("<svg/>"))).status, 400); assert.equal((await upload(Buffer.alloc(2 * 1024 * 1024 + 1))).status, 400);
      const reply = await upload(png); assert.equal(reply.status, 201); const { image } = await reply.json();
      const publicImage = await fetch(base + image); assert.equal(publicImage.status, 200); assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()), png);
      const updated = await request(`/technical/festivals/${festival._id}`, { method: "PUT", body: { ...festivalBody, bannerImage: image } }); assert.equal(updated.status, 200);
      assert.equal((await active()).length, 0, "an edited decoration leaves the public website until it is published again");
      await request(`/technical/festival-decorations/${festival._id}/publish`, { method: "PATCH", body: { published: true } });
    });
    await t.test("yearly recurrence, updates and activity access controls", async () => {
      assert.equal((await request(`/technical/festival-schedules/${schedule._id}`, { method: "PUT", body: { ...scheduleBody(), recurringYearly: true } })).status, 200);
      now = new Date("2027-12-24T19:00:00Z"); await instance.decorationScheduler.reconcile(); assert.equal((await active())[0].id, festival._id);
      const history = await (await request("/technical/decoration-history?search=Christmas")).json(); assert.ok(history.total > 0); assert.ok(history.history.some((entry) => entry.performedByRole === "technical"));
      const edit = await db.collection("decoration_activity").findOne({ action: "festival_updated", "performedBy.email": editor.email }); assert.ok(edit.previousValues); assert.ok(edit.newValues); assert.equal(edit.performedBy.email, editor.email);
      assert.equal((await request("/technical/decoration-history?from=bad")).status, 400);
      assert.equal((await (await request("/technical/decoration-history?search=Christmas.*")).json()).total, 0, "history searches escape regex characters");
      assert.equal((await request("/technical/decoration-history?from=2026-12-24&to=2026-12-26")).status, 200);
    });
    await t.test("configuration, permissions, schedules and history survive an application restart", async () => {
      const beforeCount = await db.collection("decoration_activity").countDocuments();
      await instance.decorationScheduler.stop(); await new Promise((resolve) => server.close(resolve));
      instance = createApp({ client, db, config, schedulerOptions: { clock: () => now, intervalMs: 0 } }); await instance.decorationsReady;
      server = instance.app.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}`;
      assert.equal((await active())[0].id, festival._id);
      assert.equal((await request("/technical/me")).status, 200, "existing session remains in MongoDB");
      assert.ok(await db.collection("decoration_activity").countDocuments() >= beforeCount);
      assert.equal(await db.collection("decoration_effects").countDocuments(), 36, "restarts do not duplicate the library");
      assert.equal((await request(`/technical/festivals/${festival._id}`, { method: "DELETE" })).status, 204);
      assert.equal(await db.collection("festival_schedules").countDocuments({ festivalId: festival._id }), 0, "festival deletion also removes its schedules");
      assert.equal(await db.collection("decoration_activity").countDocuments({ decorationId: festival._id }), 0);
      assert.equal(await db.collection("decoration_assets").countDocuments(), 0);
      assert.equal((await request("/technical/decoration-history", { method: "DELETE" })).status, 204);
      assert.equal(await db.collection("decoration_activity").countDocuments(), 0);
    });
  } finally {
    await instance.decorationScheduler.stop(); await new Promise((resolve) => server.close(resolve));
    if (!db.databaseName.startsWith("eternal_india_test_")) throw new Error("Refusing to remove a non-test database.");
    await db.dropDatabase(); await client.close();
  }
});
