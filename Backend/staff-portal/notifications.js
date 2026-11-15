export async function publishStaffNotification(db, { id, staffId, title, message, enquiryId, createdAt = new Date() }) {
  await db.collection("staff_notifications").updateOne({ _id: id }, { $setOnInsert: { staffId, title, message, ...(enquiryId ? { enquiryId } : {}), createdAt, read: false } }, { upsert: true });
}
