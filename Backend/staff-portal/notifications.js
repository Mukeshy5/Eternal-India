import { ObjectId } from "mongodb";
import { broadcastNotification } from "./livehub.js";

const staffIdString = (staffId) => staffId instanceof ObjectId ? staffId.toString() : String(staffId);

export async function publishStaffNotification(db, { id, staffId, title, message, enquiryId, enquiry, createdAt = new Date() }) {
  const staffIdStr = staffIdString(staffId);
  const storedStaffId = ObjectId.isValid(staffIdStr) ? new ObjectId(staffIdStr) : staffId;
  const saved = await db.collection("staff_notifications").updateOne({ _id: id }, { $setOnInsert: { staffId: storedStaffId, title, message, ...(enquiryId ? { enquiryId } : {}), ...(enquiry ? { enquiry } : {}), createdAt, read: false } }, { upsert: true });
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

export async function publishStaffWorkspaceNotification(db, notification) {
  const recipients = db.collection("staff_accounts").aggregate([
    { $match: { status: "active" } },
    { $lookup: { from: "staff", localField: "staffId", foreignField: "_id", as: "employee" } },
    { $unwind: "$employee" },
    { $match: { "employee.status": "active", "employee.deletedAt": null, $expr: { $eq: ["$employee.employeeId", "$employeeId"] } } },
    { $project: { staffId: 1 } },
  ]);
  for await (const { staffId } of recipients) {
    await publishStaffNotification(db, { ...notification, id: `${notification.id}:${staffId}`, staffId });
  }
}
