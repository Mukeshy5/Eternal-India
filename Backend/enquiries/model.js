import { legacyEnquiryStatuses } from "../../shared/enquiries.js";

export async function ensureEnquiryModels(db) {
  const enquiries = db.collection("enquiries");
  // Retain the existing collection and UUIDs. External messages have no website UUID.
  await enquiries.createIndex({ submissionId: 1 }, { name: "enquiry_submission_unique", unique: true, partialFilterExpression: { submissionId: { $type: "string" } } });
  const indexes = await enquiries.indexes();
  if (indexes.some((index) => index.name === "submissionId_1" && !index.partialFilterExpression)) await enquiries.dropIndex("submissionId_1");
  await enquiries.updateMany({ $or: [{ source: { $exists: false } }, { status: { $in: Object.keys(legacyEnquiryStatuses) } }] }, [{ $set: {
    source: { $ifNull: ["$source", "WEBSITE"] }, customerName: { $ifNull: ["$customerName", "$name"] },
    receivedAt: { $ifNull: ["$receivedAt", "$createdAt"] }, subject: { $ifNull: ["$subject", { $concat: ["Trip enquiry", { $cond: [{ $ifNull: ["$destination", false] }, { $concat: [" — ", "$destination"] }, ""] }] }] },
    assignedTo: { $ifNull: ["$assignedTo", null] }, revision: { $ifNull: ["$revision", 0] },
    legacyStatus: { $ifNull: ["$legacyStatus", "$status"] },
    status: { $switch: { branches: Object.entries(legacyEnquiryStatuses).map(([old, canonical]) => ({ case: { $eq: ["$status", old] }, then: canonical })), default: { $ifNull: ["$status", "NEW"] } } },
  } }]);
  await Promise.all([
    enquiries.createIndex({ source: 1, externalMessageId: 1 }, { unique: true, partialFilterExpression: { externalMessageId: { $type: "string" } } }),
    enquiries.createIndex({ source: 1, receivedAt: -1 }),
    enquiries.createIndex({ status: 1, receivedAt: -1 }),
    enquiries.createIndex({ "pendingEvents.0": 1 }),
    db.collection("enquiry_deleted_submissions").createIndex({ deletedAt: 1 }),
    db.collection("enquiry_events").createIndex({ publishedAt: 1 }),
    db.collection("enquiry_oauth_states").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export function publicEnquiry(record) {
  const { submissionId, submissionHash, originalPayload, pendingEvents, ...safe } = record;
  return { ...safe, _id: record._id.toString() };
}
