import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { adminPanelAccess } from "../lib/panel-access.js";
import { technicalAccess } from "../festivals/permissions.js";
import { calculateVoucherPrice } from "../../shared/voucherBilling.js";
import { ensureVoucherModels, voucherCollection } from "./model.js";
import { billingError, validObjectId, validateVoucher, voucherFilter } from "./validation.js";
import { historyExcel, historyPdf, voucherPdf } from "./documents.js";

export function registerVoucherRoutes({ management, db, requireAdmin, config }) {
  let readiness;
  const guard = [requireAdmin, async (req, _res, next) => {
    if (!adminPanelAccess(req.admin, config) && !technicalAccess(req.admin, config).technical) throw billingError("Your role cannot manage billing.", 403);
    readiness ??= ensureVoucherModels(db).catch((error) => { readiness = undefined; throw error; });
    await readiness; next();
  }];
  const records = () => db.collection(voucherCollection);
  const actor = (req) => req.admin._id.toString();
  async function getVoucher(id) {
    if (!validObjectId(id)) throw billingError("Choose a valid voucher.");
    const voucher = await records().findOne({ _id: new ObjectId(id) });
    if (!voucher) throw billingError("Voucher not found.", 404);
    return voucher;
  }
  const publicVoucher = ({ createHash: _hash, ...voucher }) => voucher;
  async function pricingData(body, previous) {
    if (!validObjectId(body?.hotelId) || !validObjectId(body?.gstId)) throw billingError("Select a saved hotel and company GST record.");
    const [hotelRecord, gstRecord] = await Promise.all([
      db.collection("hotels").findOne({ _id: new ObjectId(body.hotelId) }),
      db.collection("gst_rates").findOne({ _id: new ObjectId(body.gstId) }),
    ]);
    const hotel = hotelRecord ? { name: hotelRecord.name, address: hotelRecord.address, starRating: hotelRecord.starRating, amount: hotelRecord.amount } : previous?.hotelId === body.hotelId ? previous.hotel : null;
    const gst = gstRecord ? { name: gstRecord.name, gstNumber: gstRecord.gstNumber, rate: gstRecord.rate } : previous?.gstId === body.gstId ? previous.gst : null;
    if (!hotel || !gst || !gst.gstNumber) throw billingError("Choose an existing hotel and a GST record with a company GST number.");
    const pricing = calculateVoucherPrice(body.basePrice, gst.rate);
    if (!pricing) throw billingError("Enter a valid base price with up to two decimal places.", 400, { basePrice: "Invalid amount." });
    if (body.expectedGstRate !== undefined && body.expectedGstRate !== gst.rate) throw billingError("This GST rate changed. Refresh pricing and review the total before saving.", 409);
    return { hotel, gst, pricing };
  }
  management.get("/vouchers/options", ...guard, async (_req, res) => {
    const [hotels, gstRates, usedHotels, usedGst] = await Promise.all([
      db.collection("hotels").find({}, { projection: { name: 1, address: 1, starRating: 1, amount: 1 } }).sort({ name: 1 }).limit(500).toArray(),
      db.collection("gst_rates").find({}, { projection: { name: 1, gstNumber: 1, rate: 1 } }).sort({ name: 1 }).limit(500).toArray(),
      records().aggregate([{ $group: { _id: "$hotelId", name: { $first: "$hotel.name" } } }, { $limit: 500 }]).toArray(),
      records().aggregate([{ $group: { _id: "$gstId", gstNumber: { $first: "$gst.gstNumber" } } }, { $limit: 500 }]).toArray(),
    ]);
    res.json({ hotels, gstRates, usedHotels, usedGst });
  });
  management.post("/vouchers/invoice", ...guard, rateLimit({ windowMs: 60000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Please wait before reserving another invoice." } }), async (req, res) => {
    if (typeof req.body?.requestId !== "string" || !/^[a-f\d-]{36}$/i.test(req.body.requestId)) throw billingError("Supply a valid invoice request ID.");
    const reservations = db.collection("journey_invoice_reservations"), requestKey = `${actor(req)}:${req.body.requestId}`;
    const existing = await reservations.findOne({ requestKey });
    if (existing) return res.json({ invoice: { reservationId: existing._id, invoiceNumber: existing.invoiceNumber } });
    const counter = await db.collection("billing_counters").findOneAndUpdate({ _id: "journey_invoice", sequence: { $lt: 99999 } }, { $inc: { sequence: 1 } }, { returnDocument: "after" });
    if (!counter) throw billingError("All five-digit invoice numbers have been allocated. Contact your administrator.", 409);
    const reservation = { _id: new ObjectId(), invoiceNumber: String(counter.sequence), requestKey, ownerId: actor(req), createdAt: new Date() };
    try { await reservations.insertOne(reservation); }
    catch (error) { if (error.code !== 11000) throw error; const duplicate = await reservations.findOne({ requestKey }); if (!duplicate) throw billingError("Invoice allocation conflicted. Please retry.", 409); return res.json({ invoice: { reservationId: duplicate._id, invoiceNumber: duplicate.invoiceNumber } }); }
    res.status(201).json({ invoice: { reservationId: reservation._id, invoiceNumber: reservation.invoiceNumber } });
  });
  management.post("/vouchers/quote", ...guard, async (req, res) => {
    const previous = req.body?.voucherId ? await getVoucher(req.body.voucherId) : null;
    res.json(await pricingData(req.body, previous));
  });
  management.get("/vouchers/export", ...guard, async (req, res) => {
    if (!["xlsx", "pdf"].includes(req.query.format)) throw billingError("Choose Excel or PDF export.");
    const filter = voucherFilter(req.query);
    if (await records().countDocuments(filter) > 5000) throw billingError("Narrow your filters to 5,000 vouchers or fewer before exporting.");
    const vouchers = await records().find(filter).sort({ voucherDate: -1, _id: -1 }).limit(5000).toArray();
    const excel = req.query.format === "xlsx";
    const output = await (excel ? historyExcel(vouchers) : historyPdf(vouchers));
    res.set({ "Content-Type": excel ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf", "Content-Disposition": `attachment; filename="journey-voucher-history.${excel ? "xlsx" : "pdf"}"` }).send(Buffer.from(output));
  });
  management.get("/vouchers", ...guard, async (req, res) => {
    const filter = voucherFilter(req.query);
    const requestedPage = Number(req.query.page ?? 1), pageSize = Number(req.query.pageSize ?? 20);
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > 100000 || ![10, 20, 50].includes(pageSize)) throw billingError("Choose a valid page and page size.");
    const [total, totals] = await Promise.all([records().countDocuments(filter), records().aggregate([{ $match: filter }, { $group: { _id: null, totalBillingPaise: { $sum: "$pricing.totalPaise" } } }]).toArray()]);
    const pages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(requestedPage, pages);
    const vouchers = await records().find(filter, { projection: { createHash: 0 } }).sort({ voucherDate: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray();
    res.json({ vouchers, total, page, pages, pageSize, totalBillingPaise: totals[0]?.totalBillingPaise ?? 0 });
  });
  management.get("/vouchers/:id/pdf", ...guard, async (req, res) => {
    const voucher = await getVoucher(req.params.id);
    const output = await voucherPdf(voucher);
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `${req.query.inline === "1" ? "inline" : "attachment"}; filename="journey-voucher-${voucher.invoiceNumber}.pdf"` }).send(output);
  });
  management.get("/vouchers/:id/print-data", ...guard, async (req, res) => res.json({ voucher: publicVoucher(await getVoucher(req.params.id)) }));
  management.get("/vouchers/:id", ...guard, async (req, res) => res.json({ voucher: publicVoucher(await getVoucher(req.params.id)) }));
  management.post("/vouchers", ...guard, async (req, res) => {
    const fields = validateVoucher(req.body);
    if (!validObjectId(req.body.reservationId)) throw billingError("Reserve an invoice number before saving.");
    const reservation = await db.collection("journey_invoice_reservations").findOne({ _id: new ObjectId(req.body.reservationId), ownerId: actor(req) });
    if (!reservation) throw billingError("This invoice reservation does not belong to your account.", 403);
    const hash = createHash("sha256").update(JSON.stringify({ ...fields, basePrice: String(req.body.basePrice) })).digest("hex");
    const existing = await records().findOne({ _id: reservation._id });
    if (existing) {
      if (existing.createHash !== hash) throw billingError("This invoice already exists. Open it in History to edit it.", 409);
      return res.json({ voucher: publicVoucher(existing) });
    }
    // A deleted invoice remains consumed and can never be recreated.
    if (reservation.consumedAt && (reservation.deletedAt || reservation.pendingHash !== hash)) throw billingError("This invoice was already used. Create a new voucher.", 409);
    const data = await pricingData(req.body);
    const now = new Date();
    const voucher = { _id: reservation._id, schemaVersion: 1, invoiceNumber: reservation.invoiceNumber, ...fields, ...data, revision: 1, createHash: hash, createdAt: now, updatedAt: now, createdBy: actor(req), updatedBy: actor(req) };
    // Mark before insert; a failed insert may be retried by the same request hash.
    const claimed = await db.collection("journey_invoice_reservations").updateOne({ _id: reservation._id, $or: [{ consumedAt: { $exists: false } }, { pendingHash: hash, deletedAt: { $exists: false } }] }, { $set: { consumedAt: now, pendingHash: hash } });
    if (!claimed.matchedCount) throw billingError("This invoice is already in use.", 409);
    try { await records().insertOne(voucher); }
    catch (error) { if (error.code !== 11000) throw error; const duplicate = await records().findOne({ _id: reservation._id }); if (duplicate?.createHash === hash) return res.json({ voucher: publicVoucher(duplicate) }); throw billingError("This invoice number is already in use.", 409); }
    res.status(201).json({ voucher: publicVoucher(voucher) });
  });
  management.patch("/vouchers/:id", ...guard, async (req, res) => {
    const previous = await getVoucher(req.params.id), fields = validateVoucher(req.body);
    if (!Number.isInteger(req.body.revision) || req.body.revision !== previous.revision) throw billingError("Another user changed this voucher. Reopen it before editing.", 409);
    const data = await pricingData(req.body, previous);
    const saved = await records().findOneAndUpdate({ _id: previous._id, revision: req.body.revision }, { $set: { ...fields, ...data, updatedAt: new Date(), updatedBy: actor(req) }, $inc: { revision: 1 } }, { returnDocument: "after", projection: { createHash: 0 } });
    if (!saved) throw billingError("Another user changed or deleted this voucher. Refresh History.", 409);
    res.json({ voucher: saved });
  });
  management.delete("/vouchers/:id", ...guard, async (req, res) => {
    const previous = await getVoucher(req.params.id);
    if (String(previous.revision) !== req.query.revision) throw billingError("This voucher changed. Refresh it before deleting.", 409);
    // Tombstone first: a concurrent create/retry must never resurrect a deleted invoice.
    await db.collection("journey_invoice_reservations").updateOne({ _id: previous._id }, { $set: { deletedAt: new Date() } });
    if (!(await records().deleteOne({ _id: previous._id, revision: previous.revision })).deletedCount) throw billingError("This voucher changed. Refresh it before deleting.", 409);
    res.sendStatus(204);
  });
}
