import { Server } from "socket.io";
import { authenticatePanel } from "../lib/panel-auth.js";

export function createEnquiryRealtime({ db, config, enquiries, notifications }) {
  let io, poller, polling = false;
  const emitted = new Map();
  function remember(key) {
    if (emitted.has(key)) return false;
    emitted.set(key, Date.now());
    if (emitted.size > 5000) emitted.delete(emitted.keys().next().value);
    return true;
  }
  function emitNotification(event) {
    if (!io) return;
    if (["read", "read-all"].includes(event.action)) {
      if (event.userId) io.to(`account:${event.userId}`).emit("notification:event", event);
      return;
    }
    if (event.action === "created" && event.notification?.id && !remember(`notification:notification:${event.notification.id}`)) return;
    for (const panel of event.audience || []) io.to(`panel:${panel}`).emit("notification:event", event);
  }
  notifications.onEvent(emitNotification);
  function emit(event) {
    if (!io || !remember(`enquiry:${event._id}`)) return;
    io.to("enquiries").emit("enquiry:event", { id: event._id, type: event.type, enquiryId: event.enquiryId, name: event.name, source: event.source, at: event.at, publishedAt: event.publishedAt });
    if (event.notification) {
      const { _id, type: _type, notification: _notification, readBy: _readBy, audience, ...item } = event;
      emitNotification({ action: "created", notification: { ...item, id: _id.slice("notification:".length), createdAt: event.publishedAt }, audience, actorId: event.actorId || "" });
    }
  }
  enquiries.onEvent(emit);
  const originAllowed = (origin) => {
    if (!origin || config.origins.includes(origin)) return true;
    try { return !config.production && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname); } catch { return false; }
  };
  function attach(server) {
    if (io) return io;
    const started = new Date();
    io = new Server(server, { path: "/api/enquiries/socket.io", transports: ["polling", "websocket"], maxHttpBufferSize: 16384, cors: { origin(origin, callback) { callback(null, originAllowed(origin)); }, credentials: true }, allowRequest: (request, callback) => callback(null, originAllowed(request.headers.origin)) });
    io.use(async (socket, next) => {
      try {
        if (!["admin", "technical"].includes(socket.handshake.auth?.panel)) return next(new Error("Please sign in to continue."));
        const rawCookie = socket.handshake.headers.cookie || "";
        const token = rawCookie.split(";").map((value) => value.trim()).find((value) => value.startsWith("eternal_india.auth="))?.slice("eternal_india.auth=".length);
        const authenticate = () => authenticatePanel({ db, config, token, panel: socket.handshake.auth.panel });
        const result = await authenticate();
        if (!result.admin) return next(new Error("Please sign in to continue."));
        socket.data.authenticate = authenticate;
        socket.data.accountId = result.admin._id.toString();
        socket.data.panel = socket.handshake.auth.panel;
        next();
      } catch { next(new Error("Please sign in again.")); }
    });
    io.on("connection", (socket) => {
      socket.join(["enquiries", `panel:${socket.data.panel}`, `account:${socket.data.accountId}`]); socket.emit("enquiry:ready");
      const since = Date.parse(socket.handshake.auth?.since || "");
      if (Number.isFinite(since) && since <= Date.now() && since > Date.now() - 86400000) void db.collection("enquiry_events").find({ publishedAt: { $gte: new Date(since - 5000) }, $or: [{ notification: true }, { type: { $ne: "notification" } }] }).sort({ publishedAt: 1 }).limit(5000).toArray().then((events) => {
        for (const event of events) {
          if (event.notification) {
            const { _id, type: _type, notification: _notification, readBy: _readBy, audience, ...item } = event;
            if (audience?.includes(socket.data.panel)) socket.emit("notification:event", { action: "created", notification: { ...item, id: _id.slice("notification:".length), createdAt: event.publishedAt }, audience, actorId: event.actorId || "" });
          } else socket.emit("enquiry:event", { id: event._id, type: event.type, enquiryId: event.enquiryId, name: event.name, source: event.source, at: event.at, publishedAt: event.publishedAt });
        }
      }).catch(() => socket.emit("enquiry:ready"));
      // Logout, password rotation, disabled accounts and expired JWTs also revoke
      // long-lived notification connections, rather than trusting the handshake forever.
      const guard = setInterval(() => { void socket.data.authenticate().then((result) => { if (!result.admin) socket.disconnect(true); }).catch(() => socket.disconnect(true)); }, 15000);
      guard.unref?.(); socket.once("disconnect", () => clearInterval(guard));
    });
    // Cross-instance delivery and crash recovery use the MongoDB outbox. An
    // overlap window avoids losing events with equal/out-of-order timestamps.
    poller = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        await enquiries.reconcile();
        if (io.engine.clientsCount) for await (const event of db.collection("enquiry_events").find({ publishedAt: { $gte: new Date(Math.max(started.getTime(), Date.now() - 120000)) } }).sort({ publishedAt: 1 })) {
          if (event.notification) {
            const { _id, type: _type, notification: _notification, readBy: _readBy, audience, ...item } = event;
            emitNotification({ action: "created", notification: { ...item, id: _id.slice("notification:".length), createdAt: event.publishedAt }, audience, actorId: event.actorId || "" });
          } else emit(event);
        }
      } catch (error) { console.error("Enquiry realtime refresh failed:", error.name); }
      finally { polling = false; }
    }, 1500);
    poller.unref?.();
    return io;
  }
  return { attach, async stop() { clearInterval(poller); if (io) await new Promise((resolve) => io.close(resolve)); } };
}
