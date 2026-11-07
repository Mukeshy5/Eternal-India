import { Router } from "express";
import multer from "multer";
import { ObjectId } from "mongodb";
import { randomBytes } from "node:crypto";
import { staffGuard } from "./permissions.js";
import { reportRange, summary, validDate, validateAttendance, validateStaff } from "./validation.js";
import { attendanceExcel, attendancePdf, cardPdf } from "./exports.js";
import { cardPng, cardSvg, validateStaffPhoto } from "./card.js";
import { attendancePolicy, indiaDate } from "../../shared/staff.js";

const projection = { photo: 0 };
const id = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null;
const searchFilter = (value, prefix = "") => {
  const text = typeof value === "string" ? value.trim().slice(0, 100) : "";
  if (!text) return {};
  const regex = { $regex: text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  return { $or: [{ [`${prefix}name`]: regex }, { [`${prefix}employeeId`]: regex }] };
};
const pageOf = (query) => Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
const grouped = [{ $group: { _id: "$status", count: { $sum: 1 }, minutes: { $sum: "$workingMinutes" } } }];
const validationError = (res, errors) => res.status(errors.version ? 409 : 400).json({ message: errors.version || "Please check the highlighted details.", errors });
const download = (res, buffer, type, filename) => res.set({ "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"` }).send(buffer);

export function registerStaffRoutes({ management, db, requireAdmin, config }) {
  const router = Router();
  const guard = (permission = "view") => staffGuard(requireAdmin, config, permission);
  const staff = db.collection("staff"), attendance = db.collection("staff_attendance");
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 9, fieldSize: 1000 } }).single("photo");
  const photoUpload = (req, res, next) => {
    if (!req.is("multipart/form-data")) return next();
    upload(req, res, (error) => error ? res.status(400).json({ message: "Upload one JPEG or PNG photo, up to 2 MB.", errors: { photo: "Invalid or oversized photo." } }) : next());
  };
  function photoFields(file) {
    if (!file) return null;
    const bytes = file.buffer;
    const png = bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) return false;
    // The complete photo is decoded before any permanent write.
    return { photo: bytes, photoMime: png ? "image/png" : "image/jpeg" };
  }
  async function prepareStaff(req, res, current) {
    const { fields, errors } = validateStaff(req.body, current);
    const photo = photoFields(req.file);
    if (photo === false || (!current && !photo)) errors.photo = "Capture or upload a valid JPEG or PNG photo.";
    if (photo) {
      try { await validateStaffPhoto(photo.photo); }
      catch { errors.photo = "This photo cannot be decoded. Please capture or upload it again."; }
    }
    if (Object.keys(errors).length) { validationError(res, errors); return null; }
    return { ...fields, ...(photo || {}) };
  }

  router.get("/staff", ...guard(), async (req, res) => {
    const page = pageOf(req.query), limit = 24;
    const filter = { deletedAt: null, ...searchFilter(req.query.search) };
    if (["active", "inactive"].includes(req.query.status)) filter.status = req.query.status;
    const [records, total, counts] = await Promise.all([
      staff.find(filter, { projection }).sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).toArray(), staff.countDocuments(filter),
      staff.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
    ]);
    res.json({ staff: records, total, page, pages: Math.max(1, Math.ceil(total / limit)), stats: { total: counts.reduce((a, b) => a + b.count, 0), active: counts.find((c) => c._id === "active")?.count || 0, inactive: counts.find((c) => c._id === "inactive")?.count || 0 } });
  });
  router.post("/staff", ...guard("create"), photoUpload, async (req, res) => {
    const fields = await prepareStaff(req, res); if (!fields) return;
    const now = new Date();
    const record = { ...fields, employeeId: `EI-${randomBytes(6).toString("hex").toUpperCase()}`, version: 1, deletedAt: null, createdAt: now, updatedAt: now, createdBy: req.admin._id, updatedBy: req.admin._id };
    await staff.insertOne(record);
    const { photo: _photo, ...result } = record;
    res.status(201).json({ staff: result });
  });
  router.get("/staff/:id/photo", ...guard(), async (req, res) => {
    const record = id(req.params.id) && await staff.findOne({ _id: id(req.params.id) }, { projection: { photo: 1, photoMime: 1 } });
    if (!record) return res.status(404).json({ message: "Staff photo not found." });
    res.type(record.photoMime).send(Buffer.from(record.photo.buffer ?? record.photo));
  });
  router.get("/staff/:id/card-preview", ...guard(), async (req, res) => {
    const record = id(req.params.id) && await staff.findOne({ _id: id(req.params.id), deletedAt: null });
    if (!record) return res.status(404).json({ message: "Staff not found." });
    res.set("Content-Type", "image/svg+xml").send(await cardSvg(record));
  });
  router.get("/staff/:id/card", ...guard("export"), async (req, res) => {
    const format = req.query.format ?? "pdf";
    if (!["pdf", "png"].includes(format)) return res.status(400).json({ message: "Choose PDF or PNG for the ID card." });
    const record = id(req.params.id) && await staff.findOne({ _id: id(req.params.id), deletedAt: null });
    if (!record) return res.status(404).json({ message: "Staff not found." });
    download(res, format === "png" ? await cardPng(record) : await cardPdf(record), format === "png" ? "image/png" : "application/pdf", `${record.employeeId}-card.${format}`);
  });
  router.get("/staff/:id", ...guard(), async (req, res) => {
    const record = id(req.params.id) && await staff.findOne({ _id: id(req.params.id) }, { projection });
    if (!record) return res.status(404).json({ message: "Staff not found." });
    res.json({ staff: record });
  });
  router.patch("/staff/:id", ...guard("edit"), photoUpload, async (req, res) => {
    const current = id(req.params.id) && await staff.findOne({ _id: id(req.params.id), deletedAt: null }, { projection });
    if (!current) return res.status(404).json({ message: "Staff not found." });
    const fields = await prepareStaff(req, res, current); if (!fields) return;
    const record = await staff.findOneAndUpdate({ _id: current._id, version: current.version, deletedAt: null }, { $set: { ...fields, updatedAt: new Date(), updatedBy: req.admin._id }, $inc: { version: 1 } }, { returnDocument: "after", projection });
    if (!record) return res.status(409).json({ message: "This staff record changed. Refresh before editing." });
    res.json({ staff: record });
  });
  router.delete("/staff/:id", ...guard("delete"), async (req, res) => {
    if (!id(req.params.id) || !Number.isInteger(req.body?.version)) return res.status(400).json({ message: "Choose a staff record and its current version." });
    const result = await staff.updateOne({ _id: id(req.params.id), version: req.body.version, deletedAt: null }, { $set: { status: "inactive", deletedAt: new Date(), updatedAt: new Date(), updatedBy: req.admin._id }, $inc: { version: 1 } });
    if (!result.modifiedCount) return res.status(409).json({ message: "This staff record changed or was deleted. Refresh and try again." });
    res.sendStatus(204);
  });

  router.get("/staff-attendance", ...guard(), async (req, res) => {
    const date = req.query.date ?? indiaDate();
    if (!validDate(date)) return res.status(400).json({ message: "Choose a valid date." });
    const page = pageOf(req.query), limit = 24;
    const filter = { status: "active", deletedAt: null, ...searchFilter(req.query.search) };
    const activeLookup = [{ $lookup: { from: "staff", localField: "staffId", foreignField: "_id", pipeline: [{ $project: { status: 1, deletedAt: 1 } }], as: "person" } }, { $match: { "person.status": "active", "person.deletedAt": null } }];
    const [records, total, counts, totalStaff] = await Promise.all([
      staff.aggregate([{ $match: filter }, { $sort: { name: 1, _id: 1 } }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: projection }, { $lookup: { from: "staff_attendance", let: { personId: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$staffId", "$$personId"] }, { $eq: ["$date", date] }] } } }], as: "attendance" } }, { $set: { attendance: { $ifNull: [{ $arrayElemAt: ["$attendance", 0] }, null] } } }]).toArray(),
      staff.countDocuments(filter), attendance.aggregate([{ $match: { date } }, ...activeLookup, ...grouped]).toArray(), staff.countDocuments({ deletedAt: null }),
    ]);
    const activeStaff = await staff.countDocuments({ status: "active", deletedAt: null });
    const stats = summary(counts);
    res.json({ staff: records, total, page, pages: Math.max(1, Math.ceil(total / limit)), date, stats: { ...stats, totalStaff, activeStaff, unmarked: Math.max(0, activeStaff - stats.totalRecordedDays) } });
  });
  router.post("/staff-attendance", ...guard("attendance"), async (req, res) => {
    const { fields, errors } = validateAttendance(req.body);
    const staffId = id(req.body?.staffId); if (!staffId) errors.staffId = "Choose a staff member.";
    if (Object.keys(errors).length) return validationError(res, errors);
    if (!await staff.findOne({ _id: staffId, deletedAt: null, status: "active" }, { projection: { _id: 1 } })) return res.status(409).json({ message: "Attendance can only be marked for active staff." });
    const now = new Date();
    const record = { ...fields, staffId, version: 1, createdAt: now, updatedAt: now, createdBy: req.admin._id, updatedBy: req.admin._id };
    await attendance.insertOne(record); res.status(201).json({ attendance: record });
  });
  router.patch("/staff-attendance/:id", ...guard("attendance"), async (req, res) => {
    const current = id(req.params.id) && await attendance.findOne({ _id: id(req.params.id) });
    if (!current) return res.status(404).json({ message: "Attendance record not found." });
    const { fields, errors } = validateAttendance({ ...req.body, date: current.date });
    if (req.body?.date && req.body.date !== current.date) errors.date = "The date of a saved record cannot be changed.";
    if (req.body?.staffId && req.body.staffId !== current.staffId.toString()) errors.staffId = "The staff member of a saved record cannot be changed.";
    if (req.body?.version !== current.version) errors.version = "Attendance changed in another session. Refresh before saving.";
    if (Object.keys(errors).length) return validationError(res, errors);
    const record = await attendance.findOneAndUpdate({ _id: current._id, version: current.version }, { $set: { ...fields, updatedAt: new Date(), updatedBy: req.admin._id }, $inc: { version: 1 } }, { returnDocument: "after" });
    if (!record) return res.status(409).json({ message: "Attendance changed in another session. Refresh before saving." });
    res.json({ attendance: record });
  });

  async function report(req, res, staffId) {
    const range = reportRange(req.query);
    if (!range) return res.status(400).json({ message: "Choose valid dates, at most 366 days, or a valid month." });
    if (req.query.format && !["pdf", "xlsx"].includes(req.query.format)) return res.status(400).json({ message: "Choose PDF or Excel export." });
    const match = { date: { $gte: range.from, $lte: range.to }, ...(staffId ? { staffId } : {}) };
    const pipeline = [{ $match: match }, { $lookup: { from: "staff", localField: "staffId", foreignField: "_id", pipeline: [{ $project: { name: 1, employeeId: 1, department: 1 } }], as: "staff" } }, { $unwind: "$staff" }, { $match: searchFilter(req.query.search, "staff.") }];
    const [{ counts, totals, daily, monthly }] = await attendance.aggregate([...pipeline, { $facet: {
      counts: grouped, totals: [{ $count: "count" }],
      daily: [{ $group: { _id: { date: "$date", status: "$status" }, count: { $sum: 1 }, minutes: { $sum: "$workingMinutes" } } }, { $sort: { "_id.date": -1 } }],
      monthly: [{ $group: { _id: { date: { $substrBytes: ["$date", 0, 7] }, status: "$status" }, count: { $sum: 1 }, minutes: { $sum: "$workingMinutes" } } }, { $sort: { "_id.date": -1 } }],
    } }]).toArray();
    const total = totals[0]?.count || 0, page = pageOf(req.query), limit = 50;
    const result = { ...range, total, page, pages: Math.max(1, Math.ceil(total / limit)), summary: summary(counts), policy: attendancePolicy, scope: typeof req.query.search === "string" ? `Search: ${req.query.search.slice(0, 100)}` : "All staff" };
    if (staffId) { result.staff = await staff.findOne({ _id: staffId }, { projection }); if (!result.staff) return res.status(404).json({ message: "Staff not found." }); result.scope = `${result.staff.employeeId} ${result.staff.name}`; }
    if (req.query.format && total > 50000) return res.status(400).json({ message: "This export exceeds 50,000 rows. Select a shorter period or a staff member." });
    const rows = await attendance.aggregate([...pipeline, { $sort: { date: -1, staffId: 1 } }, ...(req.query.format ? [{ $limit: 50000 }] : [{ $skip: (page - 1) * limit }, { $limit: limit }]), { $project: { _id: 1, staffId: 1, date: 1, status: 1, checkIn: 1, checkOut: 1, workingMinutes: 1, version: 1, employeeId: "$staff.employeeId", name: "$staff.name", department: "$staff.department" } }]).toArray();
    if (req.query.format) {
      const excel = req.query.format === "xlsx";
      return download(res, excel ? await attendanceExcel(rows, result) : await attendancePdf(rows, result), excel ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf", `attendance-${range.from}-${range.to}.${req.query.format}`);
    }
    const buckets = (groups) => [...new Set(groups.map((g) => g._id.date))].map((date) => ({ date, ...summary(groups.filter((g) => g._id.date === date).map((g) => ({ ...g, _id: g._id.status }))) }));
    res.json({ ...result, records: rows, daily: buckets(daily), monthly: buckets(monthly) });
  }
  const reportPermission = (req, res, next) => req.query.format ? guard("export")[1](req, res, next) : next();
  router.get("/staff-reports", ...guard(), reportPermission, (req, res) => report(req, res));
  router.get("/staff/:id/attendance", ...guard(), reportPermission, (req, res) => {
    if (!id(req.params.id)) return res.status(400).json({ message: "Choose a valid staff member." });
    return report(req, res, id(req.params.id));
  });
  router.use((error, _req, res, next) => {
    if (error.code === 11000) {
      const key = Object.keys(error.keyPattern || {})[0];
      return res.status(409).json({ message: key === "staffId" ? "Attendance already exists for this staff member on this date. Refresh to update it." : "A staff member with this email or phone already exists, including deleted staff. Use the existing record.", errors: key ? { [key]: "Already exists." } : {} });
    }
    next(error);
  });
  management.use(router);
}
