import { ObjectId } from "mongodb";
import { gstNumberPattern, publicGstRecord } from "../../shared/gst.js";
import { billingError, validObjectId } from "../vouchers/validation.js";

export function registerGstRoutes({ management, db, requireAdmin, realtime }) {
  const records = db.collection("gst_rates");
  const parsedNumber = (body) => {
    const value = typeof body?.gstNumber === "string" ? body.gstNumber.trim().toUpperCase() : "";
    if (!gstNumberPattern.test(value)) throw billingError("Enter a valid 15-character GST number.", 400, { gstNumber: "Use a valid 15-character GSTIN." });
    return value;
  };
  const versionFilter = (record) => record.version ? { version: record.version } : { version: { $exists: false } };
  async function currentRecord(req) {
    if (!validObjectId(req.params.id)) throw billingError("Choose a valid GST number.");
    const record = await records.findOne({ _id: new ObjectId(req.params.id) });
    if (!record) throw billingError("GST number not found.", 404);
    if (!Number.isInteger(req.body?.version) || req.body.version !== (record.version || 1)) throw billingError("This GST number changed. Refresh before trying again.", 409);
    return record;
  }
  async function duplicate(number, exclude) {
    // Include legacy GSTINs stored as names without rewriting voucher snapshots.
    const regex = { $regex: `^\\s*${number}\\s*$`, $options: "i" };
    return records.findOne({ ...(exclude ? { _id: { $ne: exclude } } : {}), $or: [{ gstNumber: regex }, { name: regex, $or: [{ gstNumber: { $exists: false } }, { gstNumber: "" }] }] }, { projection: { _id: 1 } });
  }
  management.get("/gst", requireAdmin, async (_req, res) => {
    const gstRates = (await records.find({}).toArray()).map(publicGstRecord).sort((a, b) => a.gstNumber.localeCompare(b.gstNumber) || String(a._id).localeCompare(String(b._id)));
    res.json({ gstRates });
  });
  management.post("/gst", requireAdmin, async (req, res) => {
    const gstNumber = parsedNumber(req.body);
    if (await duplicate(gstNumber)) throw billingError("This GST number is already saved.", 409, { gstNumber: "GST numbers must be unique." });
    const now = new Date(), record = { gstNumber, gstKey: gstNumber, version: 1, createdAt: now, updatedAt: now, createdBy: req.admin._id, updatedBy: req.admin._id };
    try { await records.insertOne(record); }
    catch (error) { if (error.code === 11000) throw billingError("This GST number is already saved.", 409); throw error; }
    await realtime?.gstChanged("created", record._id); res.status(201).json({ gstRate: publicGstRecord(record) });
  });
  management.patch("/gst/:id", requireAdmin, async (req, res) => {
    const current = await currentRecord(req), gstNumber = parsedNumber(req.body);
    if (await duplicate(gstNumber, current._id)) throw billingError("This GST number is already saved.", 409, { gstNumber: "GST numbers must be unique." });
    let saved;
    try { saved = await records.findOneAndUpdate({ _id: current._id, ...versionFilter(current) }, { $set: { gstNumber, gstKey: gstNumber, version: (current.version || 1) + 1, updatedAt: new Date(), updatedBy: req.admin._id }, $unset: { name: "", rate: "" } }, { returnDocument: "after" }); }
    catch (error) { if (error.code === 11000) throw billingError("This GST number is already saved.", 409); throw error; }
    if (!saved) throw billingError("This GST number changed or was deleted. Refresh before editing.", 409);
    await realtime?.gstChanged("updated", saved._id); res.json({ message: "GST number updated.", gstRate: publicGstRecord(saved) });
  });
  management.delete("/gst/:id", requireAdmin, async (req, res) => {
    const current = await currentRecord(req);
    if (!(await records.deleteOne({ _id: current._id, ...versionFilter(current) })).deletedCount) throw billingError("This GST number changed or was deleted. Refresh before deleting.", 409);
    await realtime?.gstChanged("deleted", current._id); res.sendStatus(204);
  });
}
