import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { once } from "node:events";
import { createRequire } from "node:module";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { cookieHeader } from "../lib/cookies.js";
import { createApp } from "../app.js";
import { ensureEnquiryModels } from "../enquiries/model.js";
import { parseGmailMessage, tokenVault } from "../enquiries/gmail.js";
import { whatsappMessages } from "../enquiries/whatsapp.js";

const { io } = createRequire(new URL("../../frontend/package.json", import.meta.url))("socket.io-client");
const business = "business@example.com";
const message = (id, body = "Complete Gmail message\nSecond line: नमस्ते") => ({ id, threadId: "thread1", internalDate: "1794450000000", labelIds: ["INBOX"], raw: Buffer.from(`From: "Gmail Customer" <customer@example.com>\r\nTo: ${business}\r\nSubject: Trip planning enquiry\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`).toString("base64url") });
const waPayload = (id = "wamid.Integration1", patch = {}) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "123456" }, contacts: [{ wa_id: "919876543210", profile: { name: "WhatsApp Customer" } }], messages: [{ id, from: "919876543210", timestamp: "1794450000", type: "text", text: { body: "Original WhatsApp message\nPlease plan a journey." }, ...patch }] } }] }] });

test("Gmail MIME parsing, encrypted tokens and WhatsApp original message parsing", async () => {
  const vault = tokenVault("secret-with-more-than-thirty-two-characters"), token = "sensitive-refresh-token", encrypted = vault.encrypt(token);
  assert.equal(vault.decrypt(encrypted), token); assert.ok(!JSON.stringify(encrypted).includes(token));
  assert.throws(() => vault.decrypt({ ...encrypted, tag: Buffer.alloc(16).toString("base64") }));
  const parsed = await parseGmailMessage(message("gmail1"), business); assert.equal(parsed.name, "Gmail Customer"); assert.equal(parsed.email, "customer@example.com"); assert.ok(parsed.message.includes("नमस्ते")); assert.equal(parsed.subject, "Trip planning enquiry");
  const html = message("html1"); html.raw = Buffer.from('From: Sender <sender@example.com>\r\nSubject: HTML only\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hello &amp; welcome</p><script>alert(1)</script>').toString("base64url");
  assert.ok((await parseGmailMessage(html, business)).message.includes("Hello & welcome"));
  const oversized = message("oversized-subject"); oversized.raw = Buffer.from(`From: Sender <sender@example.com>\r\nSubject: ${"x".repeat(2001)}\r\n\r\nMessage`).toString("base64url");
  await assert.rejects(parseGmailMessage(oversized, business), { status: 422 });
  const whatsapp = waPayload(); whatsapp.entry[0].changes[0].value.contacts[0].profile.name = " WhatsApp\u0000 Customer ";
  const [wa] = whatsappMessages(whatsapp, "123456");
  assert.equal(wa.source, "WHATSAPP"); assert.equal(wa.message, "Original WhatsApp message\nPlease plan a journey."); assert.equal(wa.phone, "+919876543210"); assert.equal(wa.name, "WhatsApp  Customer");
  assert.equal(whatsappMessages(waPayload(), "another-number").length, 0);
  assert.throws(() => whatsappMessages(waPayload("bad", { from: { $ne: "" } }), "123456"), { status: 400 });
});

test("one permanent MongoDB inbox for website, WhatsApp and Gmail with authenticated two-panel realtime", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "enquiry-owner@example.com", adminPassword: "EnquiryOwnerTest9", technicalEmail: "", enquiries: { tokenSecret: "enquiry-test-token-secret-with-thirty-two-characters", whatsapp: { appSecret: "test-meta-app-secret", verifyToken: "test-meta-verify-token", phoneNumberId: "123456" }, gmail: { clientId: "test-google-client", clientSecret: "test-google-secret", redirectUri: "http://localhost:5000/api/integrations/gmail/callback", email: business, intervalMs: 30000 } } };
  const { db, client } = await connectDatabase(config); const owner = await ensureAdmin(db, config);
  let phase = "initial", failMessage = false, expired = false;
  const gmailMessages = new Map([["gmail1", message("gmail1")], ["gmail2", message("gmail2", "Second enquiry")], ["gmail3", message("gmail3", "Latest enquiry")]]);
  const provider = { async get(path, params = {}) {
    if (path === "profile") return { emailAddress: business, historyId: "100" };
    if (path === "messages") return phase === "initial" && !params.pageToken ? { messages: [{ id: "gmail1" }], nextPageToken: "second-page" } : { messages: [{ id: "gmail2" }, ...(phase !== "initial" ? [{ id: "gmail3" }] : [])] };
    if (path === "history") { if (expired) { expired = false; throw { providerStatus: 404 }; } return { historyId: "200", history: [{ messagesAdded: [{ message: { id: "gmail3" } }, { message: { id: "gmail1" } }] }] }; }
    if (path.startsWith("messages/")) { if (failMessage && path.endsWith("gmail3")) throw new Error("Provider interrupted"); return gmailMessages.get(path.slice(9)); }
    throw new Error(`Unexpected Gmail path ${path}`);
  } };
  const instance = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 }, gmailProviderFactory: () => provider }); await instance.decorationsReady;
  const server = instance.app.listen(0, "127.0.0.1"); await once(server, "listening"); instance.enquirySystem.realtime.attach(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { method = "GET", body, cookie = "" } = {}) => fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", ...(cookie ? { Cookie: cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const login = async (panel) => { const response = await request(`/${panel}/login`, { method: "POST", body: { email: config.adminEmail, password: config.adminPassword } }); assert.equal(response.status, 200); return cookieHeader(response); };
  const webhook = (payload, signature) => { const raw = JSON.stringify(payload, null, 2); return fetch(`${base}/api/integrations/whatsapp/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature || `sha256=${createHmac("sha256", config.enquiries.whatsapp.appSecret).update(raw).digest("hex")}` }, body: raw }); };
  const sockets = [], adminEvents = [], technicalEvents = [], adminNotifications = [], technicalNotifications = [];
  const waitFor = async (check) => { for (let i = 0; i < 100; i++) { if (check()) return; await new Promise((resolve) => setTimeout(resolve, 30)); } assert.fail("Expected realtime event was not delivered"); };
  let adminCookie, technicalCookie, websiteId, waId;
  try {
    await t.test("migration preserves old enquiries and permits multiple external IDs without website UUIDs", async () => {
      const id = randomUUID(); await db.collection("enquiries").insertOne({ name: "Legacy Guest", email: "legacy@example.com", destination: "Delhi", status: "contacted", createdAt: new Date(), submissionId: id, reference: `EI-LEGACY-${id}` });
      await ensureEnquiryModels(db); const saved = await db.collection("enquiries").findOne({ submissionId: id }); assert.equal(saved.status, "IN_PROGRESS"); assert.equal(saved.legacyStatus, "contacted"); assert.equal(saved.source, "WEBSITE"); assert.equal(saved.customerName, "Legacy Guest");
      const indexes = await db.collection("enquiries").indexes(); assert.ok(indexes.some((index) => index.unique && index.key.source && index.key.externalMessageId));
    });
    await t.test("authentication protects both inboxes and realtime connections", async () => {
      for (const panel of ["admin", "technical"]) assert.equal((await request(`/${panel}/enquiries`)).status, 401);
      const rejected = io(base, { path: "/api/enquiries/socket.io", transports: ["polling"], reconnection: false, auth: { panel: "admin" } }); sockets.push(rejected); await once(rejected, "connect_error"); assert.equal(rejected.connected, false);
      assert.equal((await request("/admin/socket-ticket", { method: "POST" })).status, 401);
      adminCookie = await login("admin"); technicalCookie = await login("technical");
      for (const [panel, cookie, events] of [["admin", adminCookie, adminEvents], ["technical", technicalCookie, technicalEvents]]) {
        const ticketReply = await request(`/${panel}/socket-ticket`, { method: "POST", cookie });
        assert.equal(ticketReply.status, 200);
        const { ticket } = await ticketReply.json();
        assert.equal(typeof ticket, "string");
        assert.ok(!ticketReply.headers.get("set-cookie"), "socket ticket is returned without creating a browser cookie");
        const socket = io(base, { path: "/api/enquiries/socket.io", transports: ["polling"], extraHeaders: { Origin: "http://localhost:5173" }, reconnection: false, auth: { panel, ticket, since: new Date().toISOString() } }); sockets.push(socket); socket.on("enquiry:event", (event) => events.push(event)); socket.on("notification:event", (event) => (panel === "admin" ? adminNotifications : technicalNotifications).push(event)); await once(socket, "connect");
      }
    });
    await t.test("website submission persists once, preserves complete fields and notifies both panels once", async () => {
      const fields = { name: "Website Customer", email: "website@example.com", phone: "+919876543210", destination: "Jaipur", travellers: 2, date: "", message: "Complete website enquiry\nFamily holiday", voiceLanguage: "en", submissionId: randomUUID() };
      const replies = await Promise.all([request("/enquiries", { method: "POST", body: fields }), request("/enquiries", { method: "POST", body: fields })]); assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 201]);
      const saved = await db.collection("enquiries").findOne({ email: fields.email }); websiteId = saved._id.toString(); assert.equal(saved.source, "WEBSITE"); assert.equal(saved.status, "NEW"); assert.equal(saved.message, fields.message);
      await waitFor(() => adminEvents.some((event) => event.enquiryId === websiteId) && technicalEvents.some((event) => event.enquiryId === websiteId));
      assert.equal(adminEvents.filter((event) => event.id === `created:${websiteId}`).length, 1); assert.equal(technicalEvents.filter((event) => event.id === `created:${websiteId}`).length, 1);
      await waitFor(() => adminNotifications.some((event) => event.action === "created" && event.notification?.enquiryId === websiteId) && technicalNotifications.some((event) => event.action === "created" && event.notification?.enquiryId === websiteId));
      for (const events of [adminNotifications, technicalNotifications]) assert.equal(events.filter((event) => event.action === "created" && event.notification?.enquiryId === websiteId).length, 1);
    });
    await t.test("WhatsApp challenge, raw signatures, duplicate prevention and original sender/message/timestamp", async () => {
      const challenge = await fetch(`${base}/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-meta-verify-token&hub.challenge=12345`); assert.equal(challenge.status, 200); assert.equal(await challenge.text(), "12345");
      assert.equal((await fetch(`${base}/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`)).status, 403);
      assert.equal((await webhook(waPayload(), `sha256=${"0".repeat(64)}`)).status, 401);
      assert.equal((await webhook(waPayload())).status, 200); assert.equal((await webhook(waPayload())).status, 200);
      const saved = await db.collection("enquiries").findOne({ externalMessageId: "wamid.Integration1" }); waId = saved._id.toString(); assert.equal(saved.source, "WHATSAPP"); assert.equal(saved.phone, "+919876543210"); assert.equal(saved.name, "WhatsApp Customer"); assert.equal(saved.receivedAt.getTime(), 1794450000000); assert.equal(saved.message, waPayload().entry[0].changes[0].value.messages[0].text.body);
      assert.equal(await db.collection("enquiries").countDocuments({ externalMessageId: "wamid.Integration1" }), 1);
      await waitFor(() => technicalEvents.some((event) => event.enquiryId === waId)); assert.equal(adminEvents.filter((event) => event.id === `created:${waId}`).length, 1);
      await waitFor(() => adminNotifications.some((event) => event.action === "created" && event.notification?.enquiryId === waId) && technicalNotifications.some((event) => event.action === "created" && event.notification?.enquiryId === waId));
    });
    await t.test("Gmail pagination, full bodies and incremental sync are retry-safe and deduplicated", async () => {
      const result = await instance.enquirySystem.gmail.sync(); assert.equal(result.imported, 2); assert.equal(await db.collection("enquiries").countDocuments({ source: "GMAIL" }), 2);
      phase = "incremental"; failMessage = true; await assert.rejects(instance.enquirySystem.gmail.sync());
      const failed = await db.collection("enquiry_sync_state").findOne({ _id: `gmail:${business}` }); assert.equal(failed.historyId, "100"); assert.ok(failed.lastError); assert.equal(failed.owner, undefined);
      failMessage = false; assert.equal((await instance.enquirySystem.gmail.sync()).imported, 1); assert.equal((await instance.enquirySystem.gmail.sync()).imported, 0);
      expired = true; await instance.enquirySystem.gmail.sync(); assert.equal(await db.collection("enquiries").countDocuments({ source: "GMAIL" }), 3);
      const email = await db.collection("enquiries").findOne({ externalMessageId: "gmail1" }); assert.ok(email.message.includes("नमस्ते")); assert.equal(email.subject, "Trip planning enquiry");
      await waitFor(() => adminEvents.some((event) => event.enquiryId === email._id.toString()) && technicalEvents.some((event) => event.enquiryId === email._id.toString()));
      await waitFor(() => adminNotifications.some((event) => event.action === "created" && event.notification?.enquiryId === email._id.toString()) && technicalNotifications.some((event) => event.action === "created" && event.notification?.enquiryId === email._id.toString()));
    });
    await t.test("both panels return identical records, source filters, details, status, assignment and unread totals", async () => {
      const admin = await (await request("/admin/enquiries", { cookie: adminCookie })).json(), technical = await (await request("/technical/enquiries", { cookie: technicalCookie })).json();
      assert.deepEqual(admin.enquiries, technical.enquiries); assert.equal(admin.stats.sources.GMAIL, 3); assert.equal(admin.stats.sources.WHATSAPP, 1);
      const filtered = await (await request("/technical/enquiries?source=WHATSAPP", { cookie: technicalCookie })).json(); assert.equal(filtered.total, 1); assert.equal(filtered.enquiries[0]._id, waId);
      assert.equal((await request(`/admin/enquiries/${websiteId}`, { method: "PATCH", body: { status: "IN_PROGRESS", assignedTo: owner._id.toString() }, cookie: adminCookie })).status, 200);
      const detail = await (await request(`/technical/enquiries/${websiteId}`, { cookie: technicalCookie })).json(); assert.equal(detail.enquiry.status, "IN_PROGRESS"); assert.equal(detail.enquiry.assignedTo.id, owner._id.toString()); assert.equal(detail.enquiry.message, "Complete website enquiry\nFamily holiday");
      assert.equal((await request(`/technical/enquiries/${websiteId}`, { method: "PATCH", body: { status: "RESOLVED" }, cookie: technicalCookie })).status, 200);
      assert.equal((await request(`/technical/enquiries/${websiteId}`, { method: "PATCH", body: { status: "INVALID" }, cookie: technicalCookie })).status, 400);
      const summary = await (await request("/admin/enquiry-summary", { cookie: adminCookie })).json(); assert.equal(summary.unread, 4);
    });
    await t.test("sorting is deterministic across both panels and validates the requested order", async () => {
      const collection = db.collection("enquiries");
      for (const [sort, order] of Object.entries({ newest: { receivedAt: -1, _id: -1 }, oldest: { receivedAt: 1, _id: 1 }, updated: { updatedAt: -1, _id: -1 } })) {
        const expected = (await collection.find({ archivedAt: { $exists: false } }).sort(order).toArray()).map((entry) => entry._id.toString());
        for (const [panel, cookie] of [["admin", adminCookie], ["technical", technicalCookie]]) {
          const response = await request(`/${panel}/enquiries?sort=${sort}`, { cookie });
          assert.equal(response.status, 200);
          assert.deepEqual((await response.json()).enquiries.map((entry) => entry._id), expected);
        }
      }
      assert.equal((await request("/admin/enquiries?sort=invalid", { cookie: adminCookie })).status, 400);
      assert.equal((await request("/technical/enquiries?sort=oldest&sort=newest", { cookie: technicalCookie })).status, 400);
    });
    await t.test("notification history, global read state, deletion and panel synchronization", async () => {
      assert.equal((await request("/admin/notifications")).status, 401);
      const adminPage = await (await request("/admin/notifications?limit=50", { cookie: adminCookie })).json();
      const technicalPage = await (await request("/technical/notifications?limit=50", { cookie: technicalCookie })).json();
      const enquiryItems = adminPage.notifications.filter((item) => item.enquiryId);
      assert.equal(enquiryItems.length, 5);
      assert.deepEqual(new Set(enquiryItems.map((item) => item.id)), new Set(technicalPage.notifications.filter((item) => item.enquiryId).map((item) => item.id)));
      assert.equal(new Set(enquiryItems.map((item) => item.enquiryId)).size, 5, "duplicate provider deliveries create one notification per enquiry");
      const websiteNotification = enquiryItems.find((item) => item.enquiryId === websiteId);
      assert.equal((await request(`/admin/notifications/${websiteNotification.id}/read`, { method: "PATCH", cookie: adminCookie })).status, 204);
      await waitFor(() => adminNotifications.some((event) => event.action === "read" && event.id === websiteNotification.id) && technicalNotifications.some((event) => event.action === "read" && event.id === websiteNotification.id));
      const adminAfterRead = await (await request("/admin/notifications?limit=50", { cookie: adminCookie })).json();
      const technicalAfterRead = await (await request("/technical/notifications?limit=50", { cookie: technicalCookie })).json();
      assert.equal(adminAfterRead.notifications.find((item) => item.id === websiteNotification.id).read, true);
      assert.equal(technicalAfterRead.notifications.find((item) => item.id === websiteNotification.id).read, true);
      const gmailNotification = enquiryItems.find((item) => item.source === "GMAIL");
      assert.equal((await request(`/admin/notifications/${gmailNotification.id}`, { method: "DELETE", cookie: adminCookie })).status, 204);
      await waitFor(() => adminNotifications.some((event) => event.action === "deleted" && event.id === gmailNotification.id) && technicalNotifications.some((event) => event.action === "deleted" && event.id === gmailNotification.id));
      assert.equal(await db.collection("enquiry_events").countDocuments({ _id: `notification:${gmailNotification.id}` }), 0);
      assert.equal((await request("/technical/notifications/read-all", { method: "PATCH", cookie: technicalCookie })).status, 200);
      await waitFor(() => adminNotifications.some((event) => event.action === "read-all") && technicalNotifications.some((event) => event.action === "read-all"));
      assert.equal((await (await request("/admin/notifications/unread-count", { cookie: adminCookie })).json()).unread, 0);
      assert.equal((await (await request("/technical/notifications/unread-count", { cookie: technicalCookie })).json()).unread, 0);
    });
    await t.test("notifications and OAuth state stay on the backend; settings and encrypted PKCE are persistent", async () => {
      assert.equal((await request("/admin/enquiry-notification-settings", { method: "PATCH", cookie: adminCookie, body: { popup: true, sound: false } })).status, 200);
      assert.equal((await (await request("/technical/enquiry-notification-settings", { cookie: technicalCookie })).json()).sound, false);
      const reply = await request("/admin/enquiry-integrations/gmail/connect", { method: "POST", cookie: adminCookie, body: {} }); assert.equal(reply.status, 200);
      assert.ok(reply.headers.getSetCookie().some((value) => value.includes("eternal_india.gmail_oauth=") && /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value) && value.includes("Path=/api/integrations/gmail/callback")), "local OAuth return retains authentication without changing the strict sign-in cookie");
      const url = new URL((await reply.json()).url); assert.equal(url.origin, "https://accounts.google.com"); assert.equal(url.searchParams.get("access_type"), "offline"); assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      const state = await db.collection("enquiry_oauth_states").findOne({}); assert.ok(state.verifier.data); assert.notEqual(state._id, url.searchParams.get("state"));
      const configReply = await (await request("/admin/enquiry-integrations", { cookie: adminCookie })).text(); assert.ok(!configReply.includes(config.enquiries.gmail.clientSecret)); assert.ok(!configReply.includes(config.enquiries.whatsapp.appSecret));
    });
    await t.test("archive view restores enquiries and permanent deletion prevents external re-import", async () => {
      assert.equal((await request(`/admin/enquiries/${waId}`, { method: "DELETE", cookie: adminCookie })).status, 204);
      const archived = await (await request("/technical/enquiries?source=WHATSAPP&archived=true", { cookie: technicalCookie })).json();
      assert.equal(archived.total, 1); assert.ok(archived.enquiries[0].archivedAt);
      assert.ok((await db.collection("enquiries").findOne({ externalMessageId: "wamid.Integration1" })).archivedAt);
      await webhook(waPayload()); const list = await (await request("/technical/enquiries?source=WHATSAPP", { cookie: technicalCookie })).json(); assert.equal(list.total, 0); assert.equal(await db.collection("enquiries").countDocuments({ externalMessageId: "wamid.Integration1" }), 1);
      assert.equal((await request(`/technical/enquiries/${waId}`, { method: "PATCH", body: { archive: false }, cookie: technicalCookie })).status, 200);
      assert.equal((await (await request("/admin/enquiries?source=WHATSAPP", { cookie: adminCookie })).json()).total, 1);
      assert.equal((await request(`/admin/enquiries/${waId}/permanent`, { method: "DELETE", cookie: adminCookie })).status, 204);
      assert.equal(await db.collection("enquiries").countDocuments({ externalMessageId: "wamid.Integration1" }), 0);
      assert.equal(await db.collection("enquiry_history").countDocuments({ enquiryId: new (await import("mongodb")).ObjectId(waId) }), 0);
      assert.ok(await db.collection("enquiry_deleted_submissions").findOne({ _id: "WHATSAPP:wamid.Integration1" }));
      await waitFor(() => adminEvents.some((event) => event.id === `deleted:${waId}`) && technicalEvents.some((event) => event.id === `deleted:${waId}`));
      await webhook(waPayload());
      assert.equal(await db.collection("enquiries").countDocuments({ externalMessageId: "wamid.Integration1" }), 0);
    });
    await t.test("clear all notifications persists deletion and broadcasts to both panels", async () => {
      const response = await request("/technical/notifications", { method: "DELETE", cookie: technicalCookie });
      assert.equal(response.status, 200);
      await waitFor(() => adminNotifications.some((event) => event.action === "cleared") && technicalNotifications.some((event) => event.action === "cleared"));
      assert.equal(await db.collection("enquiry_events").countDocuments({ type: "notification" }), 0);
    });
  } finally {
    for (const socket of sockets) socket.disconnect(); await instance.enquirySystem.stop(); await instance.decorationScheduler.stop(); await instance.drainSessions();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    if (!db.databaseName.startsWith("eternal_india_test_")) throw Error("Refusing to remove non-test database"); await db.dropDatabase(); await client.close();
  }
});
