import { randomUUID } from "node:crypto";

const panels = new Set(["admin", "technical"]);
const notificationError = (status, message) => Object.assign(new Error(message), { status, publicMessage: true });

const publicNotification = (record, userId) => ({
  id: record._id.slice("notification:".length),
  category: record.category,
  title: record.title,
  message: record.message,
  ...(record.source ? { source: record.source } : {}),
  ...(record.enquiryId ? { enquiryId: record.enquiryId } : {}),
  ...(record.href ? { href: record.href } : {}),
  createdAt: record.publishedAt,
  read: record.legacy === true || record.readBy?.includes(userId) === true,
});

export function createNotificationService({ db }) {
  const events = db.collection("enquiry_events");
  const listeners = new Set();
  const emit = (event) => {
    for (const listener of listeners) listener(event);
  };
  const panelFilter = (panel) => {
    if (!panels.has(panel)) throw notificationError(400, "Choose a valid notification panel.");
    return { type: "notification", audience: panel };
  };

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
      ...(source ? { source } : {}),
      ...(enquiryId ? { enquiryId: String(enquiryId) } : {}),
      ...(href ? { href: String(href).slice(0, 300) } : {}),
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
    const filter = panelFilter(panel);
    if (cursor !== undefined) {
      if (typeof cursor !== "string" || cursor.length > 180) throw notificationError(400, "Choose a valid notification page.");
      let decoded;
      try { decoded = Buffer.from(cursor, "base64url").toString("utf8").split("|"); } catch { decoded = []; }
      const date = new Date(decoded[0]);
      if (decoded.length !== 2 || !Number.isFinite(date.getTime()) || !decoded[1]?.startsWith("notification:")) throw notificationError(400, "Choose a valid notification page.");
      filter.$or = [{ publishedAt: { $lt: date } }, { publishedAt: date, _id: { $lt: decoded[1] } }];
    }
    const records = await events.find(filter, { projection: { readBy: 1, category: 1, title: 1, message: 1, source: 1, enquiryId: 1, href: 1, publishedAt: 1, legacy: 1 } }).sort({ publishedAt: -1, _id: -1 }).limit(limit + 1).toArray();
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
    return events.countDocuments({ ...panelFilter(panel), legacy: { $ne: true }, readBy: { $ne: userId } });
  }

  async function markRead(id, panel, userId) {
    const filter = { ...panelFilter(panel), _id: `notification:${id}` };
    const result = await events.updateOne(filter, { $addToSet: { readBy: userId } });
    if (!result.matchedCount) throw notificationError(404, "Notification not found.");
    if (result.modifiedCount) emit({ action: "read", id: filter._id, userId, audience: [panel] });
  }

  async function markAllRead(panel, userId) {
    const filter = { ...panelFilter(panel), legacy: { $ne: true }, readBy: { $ne: userId } };
    const result = await events.updateMany(filter, { $addToSet: { readBy: userId } });
    if (result.modifiedCount) emit({ action: "read-all", userId, panel });
    return result.modifiedCount;
  }

  async function remove(id, panel) {
    const filter = { ...panelFilter(panel), _id: `notification:${id}` };
    const record = await events.findOneAndDelete(filter);
    if (!record) throw notificationError(404, "Notification not found.");
    emit({ action: "deleted", id: record._id.slice("notification:".length), audience: record.audience });
  }

  async function clear(panel) {
    const filter = panelFilter(panel);
    const records = await events.find(filter, { projection: { _id: 1, audience: 1 } }).toArray();
    if (records.length) {
      await events.deleteMany(filter);
      emit({ action: "cleared", ids: records.map((record) => record._id.slice("notification:".length)), audience: [...new Set(records.flatMap((record) => record.audience || []))] });
    }
    return records.length;
  }

  return {
    publish,
    list,
    unreadCount,
    markRead,
    markAllRead,
    remove,
    clear,
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
