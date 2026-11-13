import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { act, createElement } from "react";
import { Window } from "happy-dom";
import { io } from "socket.io-client";
import { readConfig } from "../../Backend/config/env.js";
import { connectDatabase } from "../../Backend/config/database.js";
import { ensureAdmin } from "../../Backend/lib/passwords.js";
import { cookieHeader } from "../../Backend/lib/cookies.js";
import { createApp } from "../../Backend/app.js";

// Real HTTP, MongoDB and Socket.IO with actual React components. Audio hardware
// and autoplay policy are instrumented; device playback needs browser QA.
export async function verifyNotificationIntegration(vite) {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "")}`, adminEmail: "notification-ui@example.com", adminPassword: "NotificationUiTest9", technicalEmail: "" };
  const { db, client } = await connectDatabase(config);
  const owner = await ensureAdmin(db, config);
  const instance = createApp({ db, client, config, schedulerOptions: { intervalMs: 0 } });
  await instance.decorationsReady;
  const server = instance.app.listen(0, "127.0.0.1"); await once(server, "listening"); instance.enquirySystem.realtime.attach(server);
  const base = `http://127.0.0.1:${server.address().port}`, nativeFetch = globalThis.fetch;
  const signedIn = await nativeFetch(`${base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: config.adminEmail, password: config.adminPassword }) });
  assert.equal(signedIn.status, 200); const cookie = cookieHeader(signedIn);
  const win = new Window({ url: `${base}/admin` }), previous = new Map();
  for (const [key, value] of Object.entries({ window: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const sounds = [], sockets = [], errors = [], roots = [], latest = {};
  win.AudioContext = class {
    constructor() { this.state = "suspended"; this.currentTime = 0; this.destination = {}; this.plays = 0; sounds.push(this); }
    async resume() { this.state = "running"; }
    async decodeAudioData() { return {}; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createBufferSource() { const context = this; return { connect() { return { connect() {} }; }, disconnect() {}, start() { context.plays++; }, stop() {} }; }
    async close() { this.state = "closed"; }
  };
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("notification-ring.mp3")) return new Response(await readFile(new URL("../src/assets/Notification Ring/notification-ring.mp3", import.meta.url)));
    const target = new URL(url, base);
    assert.equal(target.origin, base, "test API calls must stay on the isolated backend");
    const response = await nativeFetch(target, { ...options, headers: { ...options.headers, Cookie: cookie, Origin: "http://localhost:5173" } });
    if (!response.ok) errors.push([target.pathname, response.status]);
    return response;
  };
  const { createRoot } = await import("react-dom/client");
  const { default: useNotifications } = await vite.ssrLoadModule("/src/Common/useEnquiryNotifications.js");
  const { default: Notifications } = await vite.ssrLoadModule("/src/Common/EnquiryNotifications.jsx");
  const socketFactory = (url, options) => { assert.equal(url, base); const socket = io(url, { ...options, extraHeaders: { Origin: "http://localhost:5173" } }); sockets.push(socket); return socket; };
  function Probe({ panel }) {
    latest[panel] = useNotifications({ admin: { id: owner._id.toString() }, apiBase: `/${panel}`, socketFactory });
    return createElement(Notifications, { notifications: latest[panel], onOpen() {} });
  }
  const waitFor = async (check, label) => {
    for (let attempt = 0; attempt < 160; attempt++) { if (check()) return; await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); }); }
    assert.fail(`Timed out: ${label}`);
  };
  const fields = (patch = {}) => ({ name: "Integration Guest", email: "guest@example.com", phone: "+919876543210", destination: "Delhi", travellers: 2, date: "", message: "A real saved enquiry", voiceLanguage: "en", submissionId: randomUUID(), ...patch });
  const submit = async (body) => {
    let result; await act(async () => { result = await nativeFetch(`${base}/api/enquiries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); });
    assert.equal(result.status, 201); return (await result.json()).reference;
  };
  try {
    await submit(fields({ name: "Before mount" }));
    for (const panel of ["admin", "technical"]) {
      const host = win.document.createElement("div"); win.document.body.append(host); const root = createRoot(host); roots.push(root);
      await act(async () => root.render(createElement(Probe, { panel })));
    }
    await waitFor(() => latest.admin.connected && latest.technical.connected && latest.admin.items.length === 1 && latest.technical.items.length === 1, "both panels load persisted notifications");
    assert.equal(sounds.length, 0, "no AudioContext is created before a gesture");
    await act(async () => { win.document.dispatchEvent(new win.Event("pointerdown")); });
    assert.equal(sounds.length, 2); assert.equal(sounds.reduce((sum, sound) => sum + sound.plays, 0), 0, "initial history is silent");
    let total = 1;
    for (const [name, patch] of [["Direct", {}], ["WhatsApp handoff", { contactChannel: "whatsapp" }], ["Email handoff", { contactChannel: "email" }], ["Plan trip", { enquiryKind: "PLAN_TRIP" }], ["Contact", { enquiryKind: "CONTACT" }]]) {
      const reference = await submit(fields({ name, ...patch })); total++;
      await waitFor(() => latest.admin.items.length === total && latest.technical.items.length === total, `${name} arrives in both panels`);
      await waitFor(() => sounds.every((sound) => sound.plays === total - 1), `${name} rings once in each panel`);
      assert.equal(await db.collection("enquiries").countDocuments({ reference }), 1);
    }
    assert.equal(latest.admin.unread, total); assert.equal(latest.technical.unread, total);
    const newest = latest.admin.items[0];
    await act(async () => latest.admin.markRead(newest.id));
    await waitFor(() => latest.technical.items.find((item) => item.id === newest.id)?.read, "read synchronizes without refresh");
    await act(async () => latest.technical.remove(newest.id)); total--;
    await waitFor(() => latest.admin.items.length === total, "delete synchronizes without refresh");
    await act(async () => latest.admin.toggleSound());
    await waitFor(() => !latest.technical.preferences.sound, "MongoDB sound preference synchronizes");
    const mutedPlays = sounds.map((sound) => sound.plays);
    await submit(fields({ name: "Muted guest" })); total++;
    await waitFor(() => latest.admin.items.length === total && latest.technical.items.length === total, "muted notification still arrives");
    assert.deepEqual(sounds.map((sound) => sound.plays), mutedPlays);
    await act(async () => latest.admin.toggleSound()); await waitFor(() => latest.technical.preferences.sound, "sound reenabled");
    await act(async () => sockets[0].disconnect());
    await submit(fields({ name: "While disconnected" })); total++;
    await waitFor(() => latest.technical.items.length === total, "connected panel continues receiving");
    const beforeReconnect = sounds[0].plays;
    await act(async () => sockets[0].connect());
    await waitFor(() => latest.admin.connected && latest.admin.items.length === total, "socket reconnect recovers persisted history");
    assert.equal(sounds[0].plays, beforeReconnect, "recovered history is silent");
    const beforeFresh = sounds.map((sound) => sound.plays);
    await submit(fields({ name: "After reconnect" })); total++;
    await waitFor(() => sounds.every((sound, index) => sound.plays === beforeFresh[index] + 1), "fresh notifications ring after reconnect");
    await act(async () => latest.admin.markAllRead());
    await waitFor(() => latest.admin.unread === 0 && latest.technical.unread === 0, "authoritative unread badges synchronize");
    assert.deepEqual(errors, [], "no notification, settings or ticket API fails");
    assert.equal(win.localStorage.length, 0); assert.equal(win.sessionStorage.length, 0);
    console.log("PASS real React → HTTP → MongoDB → Socket.IO integration in Admin and Technical panels: five website categories, read/delete/unread sync, saved mute, silent history/reconnect, fresh-event audio calls and no API errors (audio hardware instrumented)");
  } finally {
    await act(async () => { for (const root of roots) root.unmount(); });
    sockets.forEach((socket) => socket.disconnect()); globalThis.fetch = nativeFetch; win.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    await instance.enquirySystem.stop(); await instance.decorationScheduler.stop(); await instance.drainSessions();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    assert.ok(db.databaseName.startsWith("eternal_india_test_")); await db.dropDatabase(); await client.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { createServer } = await import("vite"); const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try { await verifyNotificationIntegration(vite); } finally { await vite.close(); }
}
