import { ObjectId } from "mongodb";

export async function removeUnusedImage(db, path, collection = "offer_images", owners = "tour_promotions", field = "offerImage") {
  const prefix = collection === "offer_images" ? "/api/offer-images/" : "/api/public/festival-assets/";
  if (typeof path !== "string" || !path.startsWith(prefix) || !/^[a-f\d]{24}$/i.test(path.slice(prefix.length))) return 0;
  if (await db.collection(owners).findOne({ [field]: path }, { projection: { _id: 1 } })) return 0;
  return (await db.collection(collection).deleteOne({ _id: new ObjectId(path.slice(prefix.length)) })).deletedCount;
}

export const activityForFestival = (id) => ({ $or: [{ decorationId: id }, { "previousValues.festivalId": id }, { "newValues.festivalId": id }, { "previousValues.active.decorationId": id }, { "newValues.active.decorationId": id }] });

// Only records already deleted by the user, broken references and expired temporary data qualify.
export async function cleanupDatabase(db, { apply = false, now = new Date() } = {}) {
  const counts = {};
  const remove = async (name, filter, key = name) => { counts[key] = apply ? (await db.collection(name).deleteMany(filter)).deletedCount : await db.collection(name).countDocuments(filter); };
  await remove("staff", { deletedAt: { $type: "date" } }, "deletedStaff");
  await remove("tour_promotions", { amount: { $in: [null, ""] }, offerAmount: { $in: [null, ""] }, offerEnabled: { $ne: true }, offerTitle: { $in: [null, ""] }, offerImage: { $in: [null, ""] }, offerText: { $in: [null, ""] } }, "emptyPromotions");
  const orphanAttendance = db.collection("staff_attendance").aggregate([{ $lookup: { from: "staff", localField: "staffId", foreignField: "_id", pipeline: [{ $match: { deletedAt: null } }, { $project: { _id: 1 } }], as: "person" } }, { $match: { person: { $size: 0 } } }, { $project: { _id: 1 } }]);
  counts.orphanAttendance = 0;
  for await (const record of orphanAttendance) { if (apply) await db.collection("staff_attendance").deleteOne({ _id: record._id }); counts.orphanAttendance++; }
  for (const [name, owners, field, prefix] of [["offer_images", "tour_promotions", "offerImage", "/api/offer-images/"], ["decoration_assets", "festival_decorations", "bannerImage", "/api/public/festival-assets/"]]) {
    counts[name] = 0;
    for await (const record of db.collection(name).find({}, { projection: { _id: 1, createdAt: 1, expiresAt: 1 } })) {
      const referenced = await db.collection(owners).findOne({ [field]: `${prefix}${record._id}` }, { projection: { _id: 1 } });
      if (referenced) { if (apply && record.expiresAt) await db.collection(name).updateOne({ _id: record._id }, { $unset: { expiresAt: "" } }); continue; }
      // Allow a full day for an upload currently being edited in another tab.
      if (record.createdAt && now - record.createdAt < 86400000) { if (apply && !record.expiresAt) await db.collection(name).updateOne({ _id: record._id }, { $set: { expiresAt: new Date(record.createdAt.getTime() + 86400000) } }); continue; }
      if (apply) await db.collection(name).deleteOne({ _id: record._id }); counts[name]++;
    }
  }
  counts.orphanDecorationActivity = 0;
  for await (const record of db.collection("decoration_activity").find({ decorationId: /^[a-f\d]{24}$/i }, { projection: { _id: 1, decorationId: 1 } })) {
    if (!await db.collection("festival_decorations").findOne({ _id: new ObjectId(record.decorationId) }, { projection: { _id: 1 } })) { if (apply) await db.collection("decoration_activity").deleteOne({ _id: record._id }); counts.orphanDecorationActivity++; }
  }
  await remove("decoration_activity", { timestamp: { $lt: new Date(now.getTime() - 30 * 86400000) } }, "expiredDecorationActivity");
  if (apply) {
    await db.collection("admins").updateMany({ "passwordReset.expiresAt": { $lte: now } }, { $unset: { passwordReset: "" } });
    await db.collection("decoration_activity").updateMany({ expiresAt: { $exists: false }, timestamp: { $type: "date" } }, [{ $set: { expiresAt: { $add: ["$timestamp", 30 * 86400000] } } }]);
    if (counts.deletedStaff || counts.orphanAttendance) await db.collection("staff_runtime").updateOne({ _id: "revision" }, { $inc: { value: 1 }, $set: { updatedAt: now } }, { upsert: true });
  }
  return counts;
}
