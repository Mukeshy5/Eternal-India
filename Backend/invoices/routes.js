import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { invoiceBank, invoiceToday } from "../../shared/invoices.js";
import { billingError, validObjectId } from "../vouchers/validation.js";
import { ensureInvoiceModels, invoiceCollection } from "./model.js";
import { invoiceQuery, validateInvoice } from "./validation.js";
import { invoicePdf } from "./documents.js";

export function registerInvoiceRoutes({ router, db, requireAccount, realtime, staffMode = false }) {
  let readiness;
  const guard = [requireAccount, async (_req, _res, next) => {
    readiness ??= ensureInvoiceModels(db).catch((error) => { readiness = undefined; throw error; });
    await readiness; next();
  }];
  const records = db.collection(invoiceCollection), requests = db.collection("invoice_requests");
  const actor = (req) => staffMode
    ? { id: req.staffAccount._id.toString(), name: req.employee.name, email: req.employee.email, employeeId: req.employee.employeeId, staffId: req.employee._id.toString(), role: "staff" }
    : { id: req.admin._id.toString(), name: req.admin.name || req.admin.email, email: req.admin.email };
  const publicInvoice = (invoice, req) => {
    const { requestKey: _key, ...publicData } = invoice;
    if (staffMode) {
      delete publicData.authorizedStaffIds;
      publicData.canEdit = invoice.createdBy?.id === req.staffAccount._id.toString() && invoice.createdBy?.role === "staff";
    }
    return publicData;
  };
  async function get(id, req) {
    if (!validObjectId(id)) throw billingError("Choose a valid invoice.");
    const invoice = await records.findOne({ _id: new ObjectId(id) });
    if (!invoice) throw billingError("Invoice not found.", 404);
    return invoice;
  }
  router.get("/invoices", ...guard, async (req, res) => {
    const { filter: searchFilter, page: requested, pageSize, direction } = invoiceQuery(req.query), today = invoiceToday(), month = today.slice(0, 7);
    const filter = searchFilter;
    const statsFilter = {};
    const [total, summary, matched] = await Promise.all([
      records.countDocuments(filter),
      records.aggregate([{ $match: statsFilter }, { $group: { _id: null, total: { $sum: 1 }, totalPaise: { $sum: "$totalPaise" }, today: { $sum: { $cond: [{ $eq: ["$invoiceDate", today] }, 1, 0] } }, month: { $sum: { $cond: [{ $eq: [{ $substrBytes: ["$invoiceDate", 0, 7] }, month] }, 1, 0] } } } }]).toArray(),
      records.aggregate([{ $match: filter }, { $group: { _id: null, totalPaise: { $sum: "$totalPaise" } } }]).toArray(),
    ]);
    const pages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(requested, pages);
    const invoices = await records.find(filter, { projection: { requestKey: 0, ...(staffMode ? { authorizedStaffIds: 0 } : {}) } }).sort({ invoiceDate: direction, _id: direction }).skip((page - 1) * pageSize).limit(pageSize).toArray();
    res.json({ invoices: invoices.map((invoice) => publicInvoice(invoice, req)), total, page, pages, pageSize, filteredAmount: (matched[0]?.totalPaise || 0) / 100, stats: { total: summary[0]?.total || 0, totalAmount: (summary[0]?.totalPaise || 0) / 100, today: summary[0]?.today || 0, month: summary[0]?.month || 0 } });
  });
  router.get("/invoices/:id/pdf", ...guard, rateLimit({ windowMs: 60000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false }), async (req, res) => {
    const invoice = await get(req.params.id, req), bytes = await invoicePdf(invoice);
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `${req.query.inline === "1" ? "inline" : "attachment"}; filename="Invoice-${invoice.invoiceNumber}.pdf"` }).send(bytes);
  });
  router.get("/invoices/:id", ...guard, async (req, res) => res.json({ invoice: publicInvoice(await get(req.params.id, req), req) }));
  router.post("/invoices", ...guard, async (req, res) => {
    const fields = validateInvoice(req.body);
    if (typeof req.body.requestId !== "string" || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(req.body.requestId)) throw billingError("Supply a valid invoice request ID.");
    const createdBy = actor(req), requestKey = `${createdBy.id}:${req.body.requestId}`, hash = createHash("sha256").update(JSON.stringify(fields)).digest("hex");
    let reservation = await requests.findOne({ requestKey });
    if (!reservation) {
      const counter = await db.collection("billing_counters").findOneAndUpdate({ _id: "billing_invoice", sequence: { $lt: Number.MAX_SAFE_INTEGER } }, { $inc: { sequence: 1 } }, { returnDocument: "after" });
      if (!counter) throw billingError("Invoice numbering is unavailable.", 409);
      reservation = { _id: new ObjectId(), requestKey, hash, invoiceNumber: `EI-INV-${String(counter.sequence).padStart(6, "0")}`, createdAt: new Date() };
      try { await requests.insertOne(reservation); }
      catch (error) { if (error.code !== 11000) throw error; reservation = await requests.findOne({ requestKey }); if (!reservation) throw billingError("Invoice allocation conflicted. Retry the request.", 409); }
    }
    if (reservation.hash !== hash) throw billingError("This save request already belongs to different invoice details. Reopen the form to create another invoice.", 409);
    if (reservation.deletedAt) throw billingError("This invoice was deleted. Start a new invoice to issue another number.", 410);
    const now = new Date(), invoice = { _id: reservation._id, ...fields, invoiceNumber: reservation.invoiceNumber, companyBankDetails: { ...invoiceBank }, paymentQrAsset: "payment-QR", createdBy, updatedBy: createdBy, ...(staffMode ? { authorizedStaffIds: [req.employee._id.toString()] } : {}), createdAt: reservation.createdAt, updatedAt: now, version: 1, requestKey };
    let created = true;
    try { await records.insertOne(invoice); }
    catch (error) { if (error.code !== 11000) throw error; created = false; }
    // Recheck deletion to cover a retry racing a permanent delete.
    if ((await requests.findOne({ requestKey })).deletedAt) throw billingError("This invoice was deleted.", 410);
    const saved = created ? invoice : await records.findOne({ _id: reservation._id });
    if (!saved) throw billingError("This invoice was deleted.", 410);
    if (created) await realtime?.invoicesChanged("created", saved._id);
    res.status(created ? 201 : 200).json({ invoice: publicInvoice(saved, req) });
  });
  router.put("/invoices/:id", ...guard, async (req, res) => {
    const previous = await get(req.params.id, req);
    if (staffMode && (previous.createdBy?.id !== req.staffAccount._id.toString() || previous.createdBy?.role !== "staff")) throw billingError("You can only edit invoices created by your Staff account.", 403);
    const fields = validateInvoice(req.body);
    if (!Number.isInteger(req.body.version) || req.body.version !== previous.version) throw billingError("This invoice changed in another panel. Reload it before editing.", 409);
    const invoice = await records.findOneAndUpdate({ _id: previous._id, version: req.body.version }, { $set: { ...fields, updatedBy: actor(req), updatedAt: new Date() }, $inc: { version: 1 } }, { returnDocument: "after" });
    if (!invoice) throw billingError("This invoice changed or was deleted. Reload it before editing.", 409);
    await realtime?.invoicesChanged("updated", invoice._id);
    res.json({ invoice: publicInvoice(invoice, req) });
  });
  router.delete("/invoices/:id", ...guard, async (req, res) => {
    const previous = await get(req.params.id, req);
    if (staffMode && (previous.createdBy?.id !== req.staffAccount._id.toString() || previous.createdBy?.role !== "staff")) throw billingError("You can only delete invoices created by your Staff account.", 403);
    if (!Number.isInteger(req.body?.version) || req.body.version !== previous.version) throw billingError("This invoice changed in another panel. Reload it before deleting.", 409);
    // Block creation retries before removal. A stale delete releases only its own
    // claim; a concurrent successful delete keeps its permanent tombstone.
    const deletionToken = new ObjectId().toString();
    const claim = await requests.updateOne({ requestKey: previous.requestKey, $or: [{ deletedAt: { $exists: false } }, { deletedAt: { $lt: new Date(Date.now() - 60000) } }] }, { $set: { deletedAt: new Date(), deletionToken } });
    if (!claim.modifiedCount) throw billingError("This invoice is already being deleted. Refresh the list.", 409);
    const deleted = await records.findOneAndDelete({ _id: previous._id, version: req.body.version });
    if (!deleted) {
      // An expired claim can be recovered after a process restart. Keep the
      // tombstone if another claimant has already removed the record.
      if (await records.findOne({ _id: previous._id }, { projection: { _id: 1 } })) await requests.updateOne({ requestKey: previous.requestKey, deletionToken }, { $unset: { deletedAt: "", deletionToken: "" } });
      throw billingError("This invoice changed. Reload it before deleting.", 409);
    }
    await realtime?.invoicesChanged("deleted", previous._id);
    res.sendStatus(204);
  });
}
