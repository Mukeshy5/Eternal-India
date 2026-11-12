import { ObjectId } from "mongodb";
import { adminPayment, paymentStatuses } from "./model.js";
import { paymentError } from "./validation.js";

const token = (req) => /^Bearer ([a-f0-9]{64})$/.exec(req.get("Authorization") || "")?.[1];
export function paymentController(service, db) {
  return {
    configuration: (_req, res) => res.json(service.configuration()),
    createOrder: async (req, res) => res.status(200).json(await service.createOrder(req.body)),
    verify: async (req, res) => res.json({ payment: await service.verify(req.body) }),
    status: async (req, res) => res.json({ payment: await service.status(req.params.orderId || req.query.orderId, token(req)) }),
    webhook: async (req, res) => res.json(await service.webhook(req.body, req.get("X-Razorpay-Signature"), req.get("X-Razorpay-Event-Id"))),
    list: async (req, res) => {
      const filter = {}, page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1)), limit = 20;
      if (req.query.status) {
        if (!paymentStatuses.includes(req.query.status)) throw paymentError(400, "Choose a valid payment status.");
        filter.status = req.query.status;
      }
      const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
      if (search) {
        const pattern = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = ["customerName", "email", "phone", "bookingId", "receipt", "razorpayOrderId", "razorpayPaymentId"].map((field) => ({ [field]: { $regex: pattern, $options: "i" } }));
      }
      const boundary = (value) => {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw paymentError(400, "Choose a valid date.");
        const utc = new Date(`${value}T00:00:00Z`);
        if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) throw paymentError(400, "Choose a valid date.");
        return new Date(utc.getTime() - 19800000);
      };
      if (req.query.from) filter.createdAt = { $gte: boundary(req.query.from) };
      if (req.query.to) filter.createdAt = { ...filter.createdAt, $lt: new Date(boundary(req.query.to).getTime() + 86400000) };
      if (filter.createdAt?.$gte && filter.createdAt?.$lt && filter.createdAt.$gte >= filter.createdAt.$lt) throw paymentError(400, "End date must follow the start date.");
      const collection = db.collection("payments");
      const [entries, total, summary] = await Promise.all([
        collection.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
        collection.countDocuments(filter),
        collection.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" }, refunded: { $sum: "$refundedAmount" } } }]).toArray(),
      ]);
      const stats = { successful: 0, pending: 0, failed: 0, collectedAmount: 0, refundedAmount: 0 };
      for (const group of summary) {
        if (["PAID", "REFUNDED"].includes(group._id)) { stats.successful += group.count; stats.collectedAmount += group.amount; stats.refundedAmount += group.refunded; }
        else if (group._id === "FAILED") stats.failed += group.count;
        else stats.pending += group.count;
      }
      res.json({ payments: entries.map((entry) => { const { history, ...row } = adminPayment(entry); return row; }), total, page, pages: Math.max(1, Math.ceil(total / limit)), stats });
    },
    detail: async (req, res) => {
      if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw paymentError(404, "Transaction not found.");
      const record = await db.collection("payments").findOne({ _id: new ObjectId(req.params.id) });
      if (!record) throw paymentError(404, "Transaction not found.");
      res.json({ payment: adminPayment(record) });
    },
  };
}
