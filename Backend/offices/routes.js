import { ObjectId } from "mongodb";
import { officeCollection } from "./models.js";
import { billingError, validObjectId } from "../vouchers/validation.js";

export function validateOffice(body) {
  const fields = {}, errors = {};
  for (const [key, min, max] of [["name", 2, 100], ["address", 5, 600], ["phone", 0, 100]]) {
    const value = body?.[key] ?? "";
    fields[key] = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
    if (typeof value !== "string" || fields[key].length < min || fields[key].length > max || /[\x00-\x1f\x7f<>]/.test(fields[key])) errors[key] = `Use ${min}–${max} plain-text characters.`;
  }
  if (Object.keys(errors).length) throw billingError("Check the office address details.", 400, errors);
  return { ...fields, addressKey: fields.address.toLocaleLowerCase("en-IN") };
}

export function registerOfficeRoutes({ management, db, requireAdmin, realtime }) {
  const records = db.collection(officeCollection);
  const publicOffice = ({ addressKey: _key, ...record }) => record;
  const changed = async (action, id) => { await realtime?.voucherOptionsChanged("office-address", action, id); };
  management.get("/office-addresses", requireAdmin, async (_req, res) => {
    const addresses = await records.find({}, { projection: { addressKey: 0 } }).sort({ name: 1, _id: 1 }).toArray();
    res.json({ addresses });
  });
  management.get("/office-addresses/:id", requireAdmin, async (req, res) => {
    if (!validObjectId(req.params.id)) throw billingError("Select a valid office address.");
    const address = await records.findOne({ _id: new ObjectId(req.params.id) }, { projection: { addressKey: 0 } });
    if (!address) throw billingError("Office address not found.", 404);
    res.json({ address });
  });
  management.post("/office-addresses", requireAdmin, async (req, res) => {
    const fields = validateOffice(req.body), now = new Date();
    const record = { ...fields, version: 1, createdAt: now, updatedAt: now, createdBy: req.admin._id, updatedBy: req.admin._id };
    try { await records.insertOne(record); }
    catch (error) { if (error.code === 11000) throw billingError("This office address is already saved.", 409, { address: "Choose a different address or edit the existing office." }); throw error; }
    await changed("created", record._id);
    res.status(201).json({ address: publicOffice(record) });
  });
  management.patch("/office-addresses/:id", requireAdmin, async (req, res) => {
    if (!validObjectId(req.params.id) || !Number.isInteger(req.body?.version) || req.body.version < 1) throw billingError("Select an office address and its current version.");
    const fields = validateOffice(req.body);
    let address;
    try { address = await records.findOneAndUpdate({ _id: new ObjectId(req.params.id), version: req.body.version }, { $set: { ...fields, updatedAt: new Date(), updatedBy: req.admin._id }, $inc: { version: 1 } }, { returnDocument: "after", projection: { addressKey: 0 } }); }
    catch (error) { if (error.code === 11000) throw billingError("This office address is already saved.", 409, { address: "Choose a different address." }); throw error; }
    if (!address) throw billingError("This address changed or was deleted. Refresh before editing.", 409);
    await changed("updated", address._id); res.json({ address });
  });
  management.delete("/office-addresses/:id", requireAdmin, async (req, res) => {
    if (!validObjectId(req.params.id) || !Number.isInteger(req.body?.version) || req.body.version < 1) throw billingError("Select an office address and its current version.");
    const result = await records.deleteOne({ _id: new ObjectId(req.params.id), version: req.body.version });
    if (!result.deletedCount) throw billingError("This address changed or was deleted. Refresh before deleting.", 409);
    await changed("deleted", req.params.id); res.sendStatus(204);
  });
}
