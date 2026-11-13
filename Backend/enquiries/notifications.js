import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";

const panels = new Set(["admin", "technical"]);
const notificationError = (status, message) => Object.assign(new Error(message), { status, publicMessage: true });

const publicNotification = (record, userId) => ({
  id: record._id.slice("notification:".length),
  type: record.enquiryId ? "enquiry" : record.source === "REGISTRATION" ? "registration" : "activity",
  category: record.category,
  title: record.title,
  message: record.message,
  source: record.source || "ACTIVITY",
  audience: record.audience,
  ...(record.enquiryId ? { enquiryId: record.enquiryId } : {}),
  ...(record.href ? { href: record.href } : {}),
  createdAt: record.publishedAt,
  read: record.legacy === true || record.read === true || record.readBy?.includes(userId) === true,
});

export function createNotificationService({ db }) {
  const events = db.collection("enquiry_events");
  const listeners = new Set();
  const startedAt = new Date();
  let migration;
  const ensureLegacyHistory = () => {
    if (!migration) migration = (async () => {
      for await (const event of events.find({ type: "created", publishedAt: { $lt: startedAt }, notification: { $ne: true }, notificationCreated: { $ne: true } }, { projection: { _id: 1, source: 1, name: 1, enquiryId: 1, publishedAt: 1 } }).batchSize(500)) {
        if (event.enquiryId && await events.findOne({ type: "notification", notification: true, enquiryId: String(event.enquiryId) }, { projection: { _id: 1 } })) continue;
        if (ObjectId.isValid(event.enquiryId) && await db.collection("enquiries").findOne({ _id: new ObjectId(event.enquiryId), "pendingEvents.id": event._id }, { projection: { _id: 1 } })) continue;
        const source = event.source || "WEBSITE";
        const sourceName = source === "WHATSAPP" ? "WhatsApp" : source === "GMAIL" ? "Gmail" : "Website";
        await events.updateOne({ _id: `notification:legacy:${event._id}` }, { $setOnInsert: {
          _id: `notification:legacy:${event._id}`,
          type: "notification",
          notification: true,
          legacy: true,
          category: `${sourceName} enquiry`,
          title: `New ${sourceName} enquiry`,
          message: event.name ? `Enquiry from ${event.name}.` : `A ${sourceName} enquiry was received.`,
          audience: ["admin", "technical"],
          readBy: [],
          source,
          ...(event.enquiryId ? { enquiryId: String(event.enquiryId) } : {}),
          publishedAt: event.publishedAt || new Date(),
        } }, { upsert: true });
      }
    })().catch((error) => { migration = undefined; throw error; });
    return migration;
  };
  const emit = (event) => {
    for (const listener of listeners) listener(event);
  };
  const panelFilter = (panel, userId) => {
    if (!panels.has(panel)) throw notificationError(400, "Choose a valid notification panel.");
    return { type: "notification", audience: panel, ...(userId ? { deletedBy: { $ne: userId } } : {}) };
  };
  const validateId = (id) => {
    if (typeof id !== "string" || !/^[a-zA-Z0-9:_-]{1,180}$/.test(id)) throw notificationError(400, "Choose a valid notification.");
  };
  async function changed(event) {
    const record = { _id: `notification-change:${randomUUID()}`, type: "notification-change", publishedAt: new Date(), event };
    await events.insertOne(record);
    emit({ ...event, eventId: record._id });
  }

  async function publish({ id = randomUUID(), category, title, message, audience = ["admin", "technical"], actorId, source, enquiryId, href }) {
    if (typeof id !== "string" || !id || id.length > 180) throw new TypeError("Notification deduplication ID must be a non-empty string of at most 180 characters.");
    const allowedAudience = [...new Set(audience)].filter((panel) => panels.has(panel));
    if (!allowedAudience.length || ![category, title, message].every((value) => typeof value === "string" && value.trim() && value.length <= 300)) throw new TypeError("Notification content and audience are invalid.");
    const notification = {
      _id: `notification:${id}`,
      type: "notification",
      notification: true,
      category: category.trim().slice(0, 60),
      title: title.trim().slice(0, 120),
      message: message.trim().slice(0, 300),
      audience: allowedAudience,
      readBy: actorId ? [String(actorId)] : [],
      source: source || "ACTIVITY",
      ...(enquiryId ? { enquiryId: String(enquiryId) } : {}),
      ...(href ? { href: String(href).slice(0, 300) } : {}),
      ...(actorId ? { actorId: String(actorId) } : {}),
      publishedAt: new Date(),
    };
    const result = await events.updateOne({ _id: notification._id }, { $setOnInsert: notification }, { upsert: true });
    if (result.upsertedCount) {
      const saved = await events.findOne({ _id: notification._id });
      emit({ action: "created", notification: publicNotification(saved, ""), audience: saved.audience, actorId: actorId ? String(actorId) : "" });
      return saved;
    }
    return events.findOne({ _id: notification._id });
  }

  async function list(panel, userId, { cursor, limit = 20 } = {}) {
    await ensureLegacyHistory();
    const filter = panelFilter(panel, userId);
    if (cursor !== undefined) {
      if (typeof cursor !== "string" || cursor.length > 512) throw notificationError(400, "Choose a valid notification page.");
      let decoded;
      try { decoded = Buffer.from(cursor, "base64url").toString("utf8").split("|"); } catch { decoded = []; }
      const date = new Date(decoded[0]);
      if (decoded.length !== 2 || !Number.isFinite(date.getTime()) || !decoded[1]?.startsWith("notification:")) throw notificationError(400, "Choose a valid notification page.");
      filter.$or = [{ publishedAt: { $lt: date } }, { publishedAt: date, _id: { $lt: decoded[1] } }];
    }
    const records = await events.find(filter, { projection: { read: 1, readBy: 1, audience: 1, category: 1, title: 1, message: 1, source: 1, enquiryId: 1, href: 1, publishedAt: 1, legacy: 1 } }).sort({ publishedAt: -1, _id: -1 }).limit(limit + 1).toArray();
    const hasMore = records.length > limit;
    const page = records.slice(0, limit);
    const last = page.at(-1);
    return {
      notifications: page.map((item) => publicNotification(item, userId)),
      hasMore,
      ...(hasMore && last ? { cursor: Buffer.from(`${last.publishedAt.toISOString()}|${last._id}`).toString("base64url") } : {}),
    };
  }

  async function unreadCount(panel, userId) {
    await ensureLegacyHistory();
    return events.countDocuments({ ...panelFilter(panel, userId), legacy: { $ne: true }, read: { $ne: true }, readBy: { $ne: userId } });
  }

  async function markRead(id, panel, userId) {
    validateId(id);
    const filter = { ...panelFilter(panel, userId), _id: `notification:${id}` };
    const record = await events.findOne(filter, { projection: { audience: 1 } });
    if (!record) throw notificationError(404, "Notification not found.");
    const result = await events.updateOne(filter, { $addToSet: { readBy: userId } });
    if (result.modifiedCount) await changed({ action: "read", id, userId, audience: record.audience });
  }

  async function markAllRead(panel, userId) {
    const before = new Date();
    const filter = { ...panelFilter(panel, userId), legacy: { $ne: true }, read: { $ne: true }, readBy: { $ne: userId }, publishedAt: { $lte: before } };
    const [audiences, result] = await Promise.all([
      events.distinct("audience", filter),
      events.updateMany(filter, { $addToSet: { readBy: userId } }),
    ]);
    if (result.modifiedCount) await changed({ action: "read-all", userId, panel, before, audience: [...new Set(audiences.flat())] });
    return result.modifiedCount;
  }

  async function remove(id, panel, userId) {
    validateId(id);
    const filter = { ...panelFilter(panel, userId), _id: `notification:${id}` };
    const record = await events.findOneAndUpdate(filter, { $addToSet: { deletedBy: userId } });
    if (!record) throw notificationError(404, "Notification not found.");
    await changed({ action: "deleted", id, userId, audience: record.audience });
  }

  async function clear(panel, userId) {
    await ensureLegacyHistory();
    const before = new Date();
    const filter = { ...panelFilter(panel, userId), publishedAt: { $lte: before } };
    const [audiences, count] = await Promise.all([events.distinct("audience", filter), events.countDocuments(filter)]);
    if (count) {
      await events.updateMany(filter, { $addToSet: { deletedBy: userId } });
      await changed({ action: "cleared", panel, userId, before, audience: [...new Set(audiences.flat())] });
    }
    return count;
  }

  return {
    publish,
    list,
    unreadCount,
    markRead,
    markAllRead,
    remove,
    clear,
    publicNotification,
    preferencesChanged: (userId, preferences) => changed({ action: "settings", userId, preferences }),
    async reconcile() {
      for await (const account of db.collection("admins").find({ notificationPending: { $exists: true } }).limit(100)) {
        await publish(account.notificationPending);
        await db.collection("admins").updateOne({ _id: account._id, "notificationPending.id": account.notificationPending.id }, { $unset: { notificationPending: "" } });
      }
    },
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
