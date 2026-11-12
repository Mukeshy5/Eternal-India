import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { enquirySources, enquiryStatus } from "../../shared/enquiries.js";
import { publicEnquiry } from "./model.js";

export const enquiryError = (status, message, details = {}) => Object.assign(new Error(message), { status, publicMessage: true, details });
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const notificationPreferences = (account) => ({ popup: account.enquiryNotifications?.popup !== false, sound: account.enquiryNotifications?.sound !== false });

export function createEnquiryService({ db, notifications }) {
  const collection = db.collection("enquiries");
  const deletedSubmissions = db.collection("enquiry_deleted_submissions");
  let notify = () => {};
  async function flush(record) {
    for (const event of record.pendingEvents || []) {
      const saved = await db.collection("enquiry_events").findOneAndUpdate({ _id: event.id }, { $setOnInsert: { ...event, enquiryId: record._id.toString(), name: record.name, source: record.source, publishedAt: new Date() } }, { upsert: true, returnDocument: "after" });
      await db.collection("enquiry_history").updateOne({ _id: event.id }, { $setOnInsert: { enquiryId: record._id, reference: record.reference, action: event.type === "created" ? "created" : event.type === "archived" ? "archived" : event.type === "restored" ? "restored" : "updated", status: event.status || record.status, from: event.from, changedAt: event.at } }, { upsert: true });
      await collection.updateOne({ _id: record._id }, { $pull: { pendingEvents: { id: event.id } } });
      if (event.type === "created") {
        const source = record.source || "WEBSITE";
        const sourceName = source === "WHATSAPP" ? "WhatsApp" : source === "GMAIL" ? "Gmail" : "Website";
        await notifications?.publish({
          id: `enquiry:${record._id}`,
          category: `${sourceName} enquiry`,
          title: `New ${sourceName} enquiry`,
          message: `A new enquiry has arrived from ${record.name}.`,
          source,
          enquiryId: record._id.toString(),
        });
      }
      notify(saved);
    }
  }
  async function create(fields, { submissionId, submissionHash } = {}) {
    const source = fields.source || "WEBSITE";
    if (!Object.hasOwn(enquirySources, source)) throw enquiryError(400, "Choose a valid enquiry source.");
    if (source !== "WEBSITE" && (typeof fields.externalMessageId !== "string" || !fields.externalMessageId || fields.externalMessageId.length > 300)) throw enquiryError(400, "The external message ID is missing or invalid.");
    const deletionId = submissionId ? `WEBSITE:${submissionId}` : fields.externalMessageId ? `${source}:${fields.externalMessageId}` : "";
    if (deletionId && await deletedSubmissions.findOne({ _id: deletionId }, { projection: { _id: 1 } })) return { enquiry: null, created: false, deleted: true };
    const id = new ObjectId(), now = new Date();
    const name = fields.customerName || fields.name || fields.email || fields.phone;
    if (typeof name !== "string" || name.length > 320 || typeof fields.message !== "string" || Buffer.byteLength(fields.message) > 8 * 1024 * 1024) throw enquiryError(400, "The enquiry message is missing or too large.");
    let record = { ...fields, _id: id, name, customerName: name, source, status: "NEW", assignedTo: null, receivedAt: fields.receivedAt || now, createdAt: now, updatedAt: now, revision: 0, reference: `EI-${randomBytes(6).toString("hex").toUpperCase()}`, pendingEvents: [{ id: `created:${id}`, type: "created", status: "NEW", at: now }] };
    if (submissionId) Object.assign(record, { submissionId, submissionHash });
    let created = true;
    try { await collection.insertOne(record); }
    catch (error) {
      if (error.code !== 11000) throw error;
      record = await collection.findOne(submissionId ? { submissionId } : { source, externalMessageId: fields.externalMessageId });
      if (!record) throw error;
      if (submissionId && record.submissionHash !== submissionHash) throw enquiryError(409, "These details changed. Refresh the form before submitting again.");
      created = false;
    }
    if (deletionId && await deletedSubmissions.findOne({ _id: deletionId }, { projection: { _id: 1 } })) {
      await collection.deleteOne({ _id: record._id });
      return { enquiry: null, created: false, deleted: true };
    }
    // Idempotent history and durable outbox recover even if the first HTTP reply
    // or an update after insert was lost. There is only one central enquiry row.
    await db.collection("enquiry_history").updateOne({ _id: `created:${record._id}` }, { $setOnInsert: { enquiryId: record._id, reference: record.reference, action: "created", status: "NEW", changedAt: record.createdAt } }, { upsert: true });
    await flush(record);
    return { enquiry: publicEnquiry(record), created };
  }
  async function update(id, body, admin) {
    if (!/^[a-f\d]{24}$/i.test(id)) throw enquiryError(400, "Choose a valid enquiry.");
    const status = body.status === undefined ? undefined : enquiryStatus(body.status);
    if (body.status !== undefined && !status) throw enquiryError(400, "Choose a valid enquiry status.");
    let assignedTo;
    if (body.assignedTo !== undefined) {
      if (body.assignedTo === null || body.assignedTo === "") assignedTo = null;
      else {
        if (typeof body.assignedTo !== "string" || !/^[a-f\d]{24}$/i.test(body.assignedTo)) throw enquiryError(400, "Choose a valid assignee.");
        const account = await db.collection("admins").findOne({ _id: new ObjectId(body.assignedTo), status: { $nin: ["disabled", "pending"] } }, { projection: { _id: 1, name: 1, email: 1 } });
        if (!account) throw enquiryError(400, "The selected assignee is unavailable.");
        assignedTo = { id: account._id.toString(), name: account.name || account.email };
      }
    }
    if (body.archive !== undefined && typeof body.archive !== "boolean") throw enquiryError(400, "Choose a valid archive action.");
    if (status === undefined && assignedTo === undefined && body.archive === undefined) throw enquiryError(400, "Choose an enquiry update.");
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await collection.findOne({ _id: new ObjectId(id) });
      if (!current) throw enquiryError(404, "Enquiry not found.");
      const changes = {};
      if (status !== undefined && status !== current.status) changes.status = status;
      if (assignedTo !== undefined && JSON.stringify(assignedTo) !== JSON.stringify(current.assignedTo)) changes.assignedTo = assignedTo;
      if (body.archive === true && !current.archivedAt) changes.archivedAt = new Date();
      if (body.archive === false && current.archivedAt) changes.archivedAt = null;
      if (!Object.keys(changes).length) { await flush(current); return publicEnquiry(current); }
      const now = new Date(), revision = (current.revision || 0) + 1;
      const eventType = changes.archivedAt ? "archived" : body.archive === false && current.archivedAt ? "restored" : "updated";
      const event = { id: `updated:${id}:${revision}`, type: eventType, status: changes.status || current.status, from: current.status, at: now };
      const set = { ...changes, updatedAt: now, revision };
      const unset = changes.archivedAt === null ? { archivedAt: "" } : undefined;
      if (unset) delete set.archivedAt;
      const record = await collection.findOneAndUpdate({ _id: current._id, revision: current.revision ?? { $exists: false } }, { $set: set, ...(unset ? { $unset: unset } : {}), $push: { pendingEvents: event, changes: { ...changes, by: admin._id.toString(), at: now } } }, { returnDocument: "after" });
      if (!record) continue;
      await flush(record);
      return publicEnquiry(record);
    }
    throw enquiryError(409, "This enquiry changed in another panel. Refresh and try again.");
  }
  async function permanentlyDelete(id, admin) {
    if (!/^[a-f\d]{24}$/i.test(id)) throw enquiryError(400, "Choose a valid enquiry.");
    const objectId = new ObjectId(id);
    let record = await collection.findOne({ _id: objectId });
    if (!record) throw enquiryError(404, "Enquiry not found.");
    const deletedRecord = record;
    const deletionId = record.submissionId ? `WEBSITE:${record.submissionId}` : record.externalMessageId ? `${record.source}:${record.externalMessageId}` : "";
    if (deletionId) await deletedSubmissions.updateOne({ _id: deletionId }, { $setOnInsert: { source: record.source, submissionId: record.submissionId || null, externalMessageId: record.externalMessageId || null, deletedAt: new Date(), deletedBy: admin._id.toString() } }, { upsert: true });
    for (let attempt = 0; attempt < 8 && record; attempt++) {
      const result = await collection.deleteOne({ _id: objectId, revision: record.revision ?? { $exists: false } });
      if (result.deletedCount) { record = null; break; }
      record = await collection.findOne({ _id: objectId });
    }
    if (record) throw enquiryError(409, "This enquiry changed in another panel. Try deleting it again.");
    const enquiryId = objectId.toString(), at = new Date(), event = { _id: `deleted:${enquiryId}`, type: "deleted", enquiryId, name: deletedRecord.name, source: deletedRecord.source, at, publishedAt: at };
    await Promise.all([
      db.collection("enquiry_history").deleteMany({ enquiryId: objectId }),
      db.collection("enquiry_events").deleteMany({ enquiryId }),
      ...(deletedRecord.externalMessageId ? [db.collection("enquiry_ingestion_jobs").deleteOne({ _id: `${deletedRecord.source}:${deletedRecord.externalMessageId}` })] : []),
    ]);
    const saved = await db.collection("enquiry_events").findOneAndUpdate({ _id: event._id }, { $setOnInsert: event }, { upsert: true, returnDocument: "after" });
    notify(saved);
  }
  async function reconcile() { for await (const record of collection.find({ "pendingEvents.0": { $exists: true } }).limit(100)) await flush(record); }
  return { create, update, permanentlyDelete, reconcile, onEvent(callback) { notify = callback; } };
}
