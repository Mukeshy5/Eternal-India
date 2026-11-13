import { ObjectId } from "mongodb";
import { companyGstNumber, normalizeGstRecord } from "../../shared/gst.js";

function parseGstRate(body) {
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const rate = typeof body?.rate === "number" || typeof body?.rate === "string" && body.rate.trim()
    ? Number(body.rate)
    : NaN;
  if (!name || !Number.isFinite(rate) || rate < 0 || rate > 100 || Number(rate.toFixed(2)) !== rate) return null;
  const gstNumber = companyGstNumber(body);
  if (gstNumber && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstNumber)) return null;
  return { name, rate, gstNumber };
}

export function registerGstRoutes({ management, db, requireAdmin, realtime }) {
  const rates = () => db.collection("gst_rates");

  management.get("/gst", requireAdmin, async (_req, res) => {
    const gstRates = await rates().find({}, { projection: { name: 1, rate: 1, gstNumber: 1, createdAt: 1, updatedAt: 1 } }).sort({ rate: 1, name: 1 }).limit(500).toArray();
    res.json({ gstRates: gstRates.map(normalizeGstRecord) });
  });

  management.post("/gst", requireAdmin, async (req, res) => {
    const gstRate = parseGstRate(req.body);
    if (!gstRate) return res.status(400).json({ message: "Enter a GST name and a rate between 0 and 100 with up to two decimal places, and a valid 15-character company GST number when supplied." });
    const now = new Date();
    const result = await rates().insertOne({ ...gstRate, createdAt: now, updatedAt: now });
    await realtime?.gstChanged("created", result.insertedId);
    res.status(201).json({ gstRate: { _id: result.insertedId, ...gstRate, createdAt: now, updatedAt: now } });
  });

  management.patch("/gst/:id", requireAdmin, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid GST rate." });
    const gstRate = parseGstRate(req.body);
    if (!gstRate) return res.status(400).json({ message: "Enter a GST name and a rate between 0 and 100 with up to two decimal places, and a valid 15-character company GST number when supplied." });
    const updatedAt = new Date();
    const saved = await rates().findOneAndUpdate({ _id: new ObjectId(req.params.id) }, { $set: { ...gstRate, updatedAt } }, { returnDocument: "after", projection: { name: 1, rate: 1, gstNumber: 1, createdAt: 1, updatedAt: 1 } });
    if (!saved) return res.status(404).json({ message: "GST rate not found." });
    await realtime?.gstChanged("updated", saved._id);
    res.json({ message: "GST rate updated.", gstRate: saved });
  });

  management.delete("/gst/:id", requireAdmin, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid GST rate." });
    if (!(await rates().deleteOne({ _id: new ObjectId(req.params.id) })).deletedCount) return res.status(404).json({ message: "GST rate not found." });
    await realtime?.gstChanged("deleted", req.params.id);
    res.sendStatus(204);
  });
}
