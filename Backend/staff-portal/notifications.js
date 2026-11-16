import { ObjectId } from "mongodb";
import { broadcastNotification } from "./livehub.js";

const staffIdString = (staffId) => staffId instanceof ObjectId ? staffId.toString() : String(staffId);

export async function publishStaffNotification(db, { id, staffId, title, message, enquiryId, enquiry, createdAt = new Date() }) {
  const staffIdStr = staffIdString(staffId);
  const saved = await db.collection("staff_notifications").updateOne({ _id: id }, { $setOnInsert: { staffId, title, message, ...(enquiryId ? { enquiryId } : {}), ...(enquiry ? { enquiry } : {}), createdAt, read: false } }, { upsert: true });
  if (!saved.upsertedCount) return;
  void broadcastNotification(staffIdStr, {
    id,
    staffId: staffIdStr,
    title,
    message,
    ...(enquiryId ? { enquiryId } : {}),
    ...(enquiry ? { enquiry } : {}),
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : createdAt,
    read: false,
  });
}
