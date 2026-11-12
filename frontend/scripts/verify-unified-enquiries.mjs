import assert from "node:assert/strict";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { pathToFileURL } from "node:url";

export async function verifyUnifiedEnquiries(vite) {
  const testWindow = new Window({ url: "http://localhost/admin" }), previous = new Map(), originalFetch = globalThis.fetch;
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  let audiblePlays = 0, latestAudio = "", refreshes = 0, prefs = { popup: true, sound: false }, unread = 1, openId, latest, sourceFilter;
  const sockets = [], handlers = {}, timers = new Map(); let timerId = 0;
  testWindow.HTMLMediaElement.prototype.play = async function () { if (!this.muted) audiblePlays++; latestAudio = this.src; }; testWindow.HTMLMediaElement.prototype.pause = () => {};
  testWindow.setInterval = (callback) => { timers.set(++timerId, callback); return timerId; }; testWindow.clearInterval = (id) => timers.delete(id);
  const response = (data) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith("/enquiry-notification-settings")) { if (options.method === "PATCH") prefs = JSON.parse(options.body); return response({ ...prefs, unread }); }
    if (url.includes("/notifications?limit=")) return response({ notifications: [], hasMore: false });
    if (url.endsWith("/notifications/unread-count")) return response({ unread });
    if (url.endsWith("/notifications/read-all") || url.endsWith("/notifications")) return options.method === "DELETE" ? new Response(null, { status: 204 }) : response({ updated: 1 });
    if (/\/notifications\/[^/]+\/read$/.test(url)) return new Response(null, { status: 204 });
    if (/\/notifications\/[^/]+$/.test(url)) return new Response(null, { status: 204 });
    throw new Error(`Unexpected notification API: ${url}`);
  };
  const socketFactory = (_url, options) => {
    const socket = { options, connected: false, on(event, callback) { handlers[event] = callback; return socket; }, off(event) { delete handlers[event]; return socket; }, connect() { socket.connected = true; handlers["enquiry:ready"]?.(); }, disconnect() { socket.connected = false; } }; sockets.push(socket); return socket;
  };
  const { createRoot } = await import("react-dom/client"), container = testWindow.document.createElement("div"); testWindow.document.body.append(container); let root = createRoot(container);
  try {
    const { default: useNotifications } = await vite.ssrLoadModule("/src/Common/useEnquiryNotifications.js"), { default: Notifications } = await vite.ssrLoadModule("/src/Common/EnquiryNotifications.jsx");
    function Probe() { latest = useNotifications({ admin: { id: "notification-test" }, apiBase: "/admin", socketFactory, onRefresh: () => refreshes++, onUnauthorized: () => assert.fail("Unexpected unauthorized request") }); return createElement(Notifications, { notifications: latest, onOpen: (id) => { openId = id; } }); }
    await act(async () => root.render(createElement(Probe))); assert.equal(sockets.length, 1); assert.equal(sockets[0].options.path, "/api/enquiries/socket.io"); assert.equal(sockets[0].options.withCredentials, true);
    assert.ok(container.textContent.includes("Live"));
    await act(async () => { testWindow.document.dispatchEvent(new testWindow.Event("pointerdown")); await Promise.resolve(); });
    await act(async () => container.querySelector('input[type="checkbox"]').click());
    assert.equal(prefs.sound, true); const before = audiblePlays;
    const event = { action: "created", notification: { id: "test1", category: "WhatsApp enquiry", title: "New WhatsApp enquiry", message: "A new enquiry has arrived from WhatsApp Customer.", enquiryId: "test1", source: "WHATSAPP", createdAt: new Date().toISOString(), read: false }, actorId: "" };
    unread = 2;
    await act(async () => { handlers["notification:event"](event); handlers["notification:event"](event); handlers["enquiry:event"]({ id: "created:test1", type: "created", enquiryId: "test1", source: "WHATSAPP" }); });
    assert.equal(container.querySelectorAll(".enquiry-toasts article").length, 1); assert.equal(audiblePlays, before + 1); assert.ok(decodeURIComponent(latestAudio).includes("Notification Ring/notification-ring.mp3")); assert.equal(latest.unread, 2); assert.ok(refreshes >= 2);
    await act(async () => container.querySelector(".enquiry-toasts article button").click()); assert.equal(openId, "test1"); assert.equal(container.querySelectorAll(".enquiry-toasts article").length, 0);
    const afterFresh = audiblePlays;
    await act(async () => handlers["notification:event"]({ ...event, notification: { ...event.notification, id: "read-test", read: true } }));
    await act(async () => handlers["notification:event"]({ ...event, notification: { ...event.notification, id: "old-test", createdAt: new Date(Date.now() - 60000).toISOString() } }));
    assert.equal(audiblePlays, afterFresh, "read and old notifications never play a ring");
    assert.equal(container.querySelectorAll(".enquiry-toasts article").length, 0, "old notifications do not show as new popups");
    await act(async () => container.querySelector('input[type="checkbox"]').click()); const muted = audiblePlays;
    await act(async () => handlers["notification:event"]({ ...event, notification: { ...event.notification, id: "test2", enquiryId: "test2", source: "GMAIL" } })); assert.equal(audiblePlays, muted); assert.equal(prefs.sound, false);
    await act(async () => latest.dismiss("test2"));
    await act(async () => container.querySelectorAll('input[type="checkbox"]')[1].click()); assert.equal(prefs.popup, false);
    await act(async () => handlers["notification:event"]({ ...event, notification: { ...event.notification, id: "test3", enquiryId: "test3" } })); assert.equal(container.querySelectorAll(".enquiry-toasts article").length, 0, "disabled popups do not add a notification");
    await act(async () => root.unmount()); assert.equal(timers.size, 0); assert.equal(testWindow.localStorage.length, 0); root = createRoot(container);
    const { default: Dashboard } = await vite.ssrLoadModule("/src/Common/AdminDashboard.jsx");
    const rows = ["WEBSITE", "WHATSAPP", "GMAIL"].map((source, index) => ({ _id: `row${index}`, name: `${source} Customer`, email: source === "WHATSAPP" ? "" : "guest@example.com", phone: "+919876543210", source, status: "NEW", subject: `${source} subject`, message: `Complete ${source} message\nSecond line`, externalMessageId: `${source}-external`, receivedAt: "2026-11-12T08:00:00Z", createdAt: "2026-11-12T09:00:00Z", reference: `EI-${source}` }));
    const data = { enquiries: rows, total: 3, pages: 1, stats: { total: 3, archived: 1, NEW: 3, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0, sources: { WEBSITE: 1, WHATSAPP: 1, GMAIL: 1 } } };
    for (const technical of [false, true]) {
      let archiveView = false, archiveAction, deleteAction;
      const props = { technical, data, loaded: true, selected: rows[1], searchInput: "", search: "", status: "", page: 1, onSource: (source) => { sourceFilter = source; }, onToggleArchived: (value) => { archiveView = value; }, onArchive: (id, value) => { archiveAction = [id, value]; }, onPermanentDelete: (id) => { deleteAction = id; }, onRefresh() {}, onOpen() {}, onClose() {}, onUpdate() {}, onSearchInput() {}, onSearch() {}, onStatusFilter() {}, onSelectStatus() {}, onClearFilters() {}, onPage() {} };
      await act(async () => root.render(createElement(MemoryRouter, null, createElement(Dashboard, props))));
      assert.ok(container.querySelector(".dashboard-drawer").textContent.includes(rows[1].message)); assert.ok(container.querySelector('.dashboard-drawer a[href="https://wa.me/919876543210"]'));
      assert.equal(container.querySelectorAll(".dashboard-table tbody tr").length, 3); assert.equal(container.querySelectorAll(".dashboard-mobile-card").length, 3);
      const status = container.querySelector(".dashboard-status select"); assert.deepEqual([...status.options].map((option) => option.value), ["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
      await act(async () => [...container.querySelectorAll(".enquiry-source-tabs button")].find((button) => button.textContent.includes("WhatsApp")).click()); assert.equal(sourceFilter, "WHATSAPP");
      assert.ok([...container.querySelectorAll(".dashboard-drawer-footer button")].some((button) => button.textContent === "Archive"));
      assert.ok([...container.querySelectorAll(".dashboard-drawer-footer button")].some((button) => button.textContent === "Delete permanently"));
      await act(async () => [...container.querySelectorAll(".dashboard-source-tabs button, .enquiry-source-tabs button")].find((button) => button.textContent.startsWith("Archive (")).click()); assert.equal(archiveView, true);
      const archivedRows = rows.map((row) => ({ ...row, archivedAt: "2026-11-12T10:00:00Z" }));
      await act(async () => root.render(createElement(MemoryRouter, null, createElement(Dashboard, { ...props, archived: true, data: { ...data, enquiries: archivedRows }, selected: archivedRows[1] }))));
      assert.ok([...container.querySelectorAll(".dashboard-drawer-footer button")].some((button) => button.textContent === "Restore to inbox"));
      await act(async () => container.querySelector(".dashboard-drawer-footer button").click());
      assert.deepEqual(archiveAction, [rows[1]._id, false]);
      assert.ok([...container.querySelectorAll(".dashboard-drawer-footer button")].some((button) => button.textContent === "Delete permanently"));
      assert.equal(deleteAction, undefined);
    }
    console.log("PASS shared source/status and Archive UI in both panels, restore/archive/delete actions, complete WhatsApp details/contact, Socket.IO notifications, original Notification Ring MP3, persisted mute/popup preferences, duplicate suppression and cleanup");
  } finally { await act(async () => root.unmount()); globalThis.fetch = originalFetch; testWindow.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const { createServer } = await import("vite"); const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" }); try { await verifyUnifiedEnquiries(vite); } finally { await vite.close(); } }
