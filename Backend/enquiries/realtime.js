import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { Server } from "socket.io";
import { adminPanelAccess } from "../lib/panel-access.js";
import { technicalAccess } from "../festivals/permissions.js";

export function createEnquiryRealtime({ db, config, enquiries, notifications }) {
  let io, poller, polling = false;
  const emitted = new Map();
  const socketTickets = db.collection("enquiry_socket_tickets");
  async function issueTicket(panel, accountId, authTokenId) {
    const ticket = randomBytes(32).toString("base64url");
    await socketTickets.insertOne({
      _id: createHash("sha256").update(ticket).digest("hex"),
      accountId,
      authTokenId,
      panel,
      expiresAt: new Date(Date.now() + 60000),
    });
    return ticket;
  }
  async function authenticateSession(accountId, authTokenId, panel) {
    const adminId = new ObjectId(accountId);
    const session = await db.collection("admin_tokens").findOne({
      _id: authTokenId,
      adminId,
      expiresAt: { $gt: new Date() },
    }, { projection: { createdAt: 1 } });
    if (!session) return null;
    const admin = await db.collection("admins").findOne({ _id: adminId });
    if (!admin || ["pending", "disabled"].includes(admin.status) || admin.passwordChangedAt && session.createdAt <= admin.passwordChangedAt) return null;
    if (panel === "technical" ? !technicalAccess(admin, config).technical : !adminPanelAccess(admin, config)) return null;
    return admin;
  }
  function remember(key) {
    if (emitted.has(key)) return false;
    emitted.set(key, Date.now());
    if (emitted.size > 5000) emitted.delete(emitted.keys().next().value);
    return true;
  }
  function emitNotification(event, record) {
    if (!io) return;
    if (event.eventId && !remember(event.eventId)) return;
    if (event.userId) {
      io.to(`account:${event.userId}`).emit("notification:event", event);
      return;
    }
    if (event.action === "created" && event.notification?.id && !remember(`notification:notification:${event.notification.id}`)) return;
    if (event.action === "created") {
      for (const socket of io.sockets.sockets.values()) {
        if (!event.audience?.includes(socket.data.panel) || record?.deletedBy?.includes(socket.data.accountId)) continue;
        const item = record ? notifications.publicNotification(record, socket.data.accountId) : event.notification;
        const fresh = new Date(item.createdAt).getTime() >= socket.data.connectedAt;
        socket.emit("notification:event", { ...event, notification: item, fresh, replay: !fresh });
      }
      return;
    }
    for (const panel of event.audience || []) io.to(`panel:${panel}`).emit("notification:event", event);
  }
  const unsubscribe = notifications.onEvent(emitNotification);
  function emitRecord(event) {
    if (event.type === "notification-change") return emitNotification({ ...event.event, eventId: event._id });
    if (event.notification) return emitNotification({ action: "created", notification: notifications.publicNotification(event, ""), audience: event.audience, actorId: event.actorId || "" }, event);
    emit(event);
  }
  function emit(event) {
    if (!io || !remember(`enquiry:${event._id}`)) return;
    io.to("enquiries").emit("enquiry:event", { id: event._id, type: event.type, enquiryId: event.enquiryId, name: event.name, source: event.source, at: event.at, publishedAt: event.publishedAt });
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
        const { panel, ticket } = socket.handshake.auth || {};
        if (!["admin", "technical"].includes(panel) || typeof ticket !== "string" || ticket.length > 200) return next(new Error("Please sign in to continue."));
        const digest = createHash("sha256").update(ticket).digest("hex");
        const savedTicket = await socketTickets.findOneAndDelete({ _id: digest, panel, expiresAt: { $gt: new Date() } });
        if (!savedTicket) return next(new Error("Live notification authorization expired. Please reconnect."));
        const accountId = savedTicket.accountId;
        const authTokenId = savedTicket.authTokenId;
        const authenticate = async () => ({ admin: await authenticateSession(accountId, authTokenId, panel) });
        const result = await authenticate();
        if (!result.admin) return next(new Error("Please sign in to continue."));
        socket.data.authenticate = authenticate;
        socket.data.accountId = accountId;
        socket.data.panel = panel;
        next();
      } catch (error) { console.error("Live notification authentication failed:", error.name); next(new Error("Live notifications are temporarily unavailable. Reconnecting shortly.")); }
    });
    io.on("connection", (socket) => {
      socket.data.connectedAt = Date.now();
      socket.join(["enquiries", `panel:${socket.data.panel}`, `account:${socket.data.accountId}`]); socket.emit("enquiry:ready");
      const since = Date.parse(socket.handshake.auth?.since || "");
      if (Number.isFinite(since) && since <= Date.now() && since > Date.now() - 86400000) void db.collection("enquiry_events").find({ publishedAt: { $gte: new Date(since - 5000) } }).sort({ publishedAt: 1 }).limit(5000).toArray().then((events) => {
        for (const event of events) {
          if (event.type === "notification-change") {
            if (event.event.userId === socket.data.accountId) socket.emit("notification:event", { ...event.event, eventId: event._id, replay: true });
          } else if (event.notification) {
            if (event.audience?.includes(socket.data.panel) && !event.deletedBy?.includes(socket.data.accountId)) socket.emit("notification:event", { action: "created", notification: notifications.publicNotification(event, socket.data.accountId), audience: event.audience, actorId: event.actorId || "", replay: true });
          } else socket.emit("enquiry:event", { id: event._id, type: event.type, enquiryId: event.enquiryId, name: event.name, source: event.source, at: event.at, publishedAt: event.publishedAt });
        }
      }).catch((error) => { console.error("Live notification recovery failed:", error.name); socket.emit("enquiry:ready"); });
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
          emitRecord(event);
        }
      } catch (error) { console.error("Enquiry realtime refresh failed:", error.name); }
      finally { polling = false; }
    }, 1500);
    poller.unref?.();
    return io;
  }
  return { attach, issueTicket, async stop() { clearInterval(poller); unsubscribe(); if (io) await new Promise((resolve) => io.close(resolve)); } };
}
