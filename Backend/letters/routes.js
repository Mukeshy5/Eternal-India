import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import { staffGuard, staffAccess } from "../staff/permissions.js";
import { validDate } from "../staff/validation.js";
import { letterCompany, letterTypes, employmentDuration } from "../../shared/employmentLetters.js";
import { letterCollection } from "./models.js";
import { validateCompany, validateLetter } from "./validation.js";
import { employmentLetterPdf } from "./documents.js";

const objectId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const projection = { pdf: 0, requestKey: 0, payloadHash: 0 };
const publicLetter = ({ pdf: _pdf, requestKey: _key, payloadHash: _hash, ...record }) => ({ ...record, employmentDuration: employmentDuration(record.joiningDate, record.lastWorkingDate) });
const validationError = (res, errors) => res.status(errors.version ? 409 : 400).json({ message: errors.version || "Please check the highlighted letter details.", errors });
const employeeSnapshot = (person) => Object.fromEntries(["name", "employeeId", "designation", "department"].map((key) => [key, person[key]]));
const escapedSearch = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function registerLetterRoutes({ management, db, requireAdmin, config }) {
  const router = Router(), letters = db.collection(letterCollection), staff = db.collection("staff");
  const guard = (permission = "view") => staffGuard(requireAdmin, config, permission);
  const editorGuard = [...guard(), (req, res, next) => staffAccess(req.admin, config).some((key) => ["create", "edit"].includes(key)) ? next() : res.status(403).json({ message: "Your account cannot prepare employment letters." })];
  const pdfLimit = rateLimit({ windowMs: 60000, limit: 30, keyGenerator: (req) => req.admin._id.toString(), standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Too many PDF generation requests. Please wait a minute and try again." } });
  const settings = async () => await db.collection("employment_letter_settings").findOne({ _id: "company" }) || { company: { ...letterCompany, name: config.companyName || letterCompany.name }, version: 0 };

  router.get("/letters/settings", ...guard(), async (req, res) => {
    const record = await settings();
    res.json({ company: record.company, version: record.version, permissions: staffAccess(req.admin, config) });
  });
  router.put("/letters/settings", ...guard("edit"), async (req, res) => {
    const { company, errors } = validateCompany(req.body?.company);
    if (!Number.isInteger(req.body?.version) || req.body.version < 0) errors.version = "Refresh the company settings before saving.";
    if (Object.keys(errors).length) return validationError(res, errors);
    const fields = { company, updatedAt: new Date(), updatedBy: req.admin._id };
    try {
      if (req.body.version === 0) await db.collection("employment_letter_settings").insertOne({ _id: "company", ...fields, version: 1 });
      else {
        const result = await db.collection("employment_letter_settings").updateOne({ _id: "company", version: req.body.version }, { $set: fields, $inc: { version: 1 } });
        if (!result.matchedCount) return validationError(res, { version: "Company settings changed. Refresh before saving again." });
      }
    } catch (error) { if (error.code === 11000) return validationError(res, { version: "Company settings changed. Refresh before saving again." }); throw error; }
    res.json({ company, version: req.body.version + 1 });
  });

  router.get("/letters/employees", ...guard(), async (req, res) => {
    if (req.query.search !== undefined && (typeof req.query.search !== "string" || req.query.search.length > 100)) return res.status(400).json({ message: "Search employees using up to 100 characters." });
    const search = req.query.search?.trim() || "", page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1)), limit = 30;
    const regex = { $regex: escapedSearch(search), $options: "i" };
    const filter = { deletedAt: null, ...(search ? { $or: ["name", "employeeId", "department", "designation"].map((key) => ({ [key]: regex })) } : {}) };
    const [employees, total] = await Promise.all([
      staff.find(filter, { projection: { name: 1, employeeId: 1, department: 1, designation: 1, status: 1, joiningDate: 1, salary: 1 } }).sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).toArray(), staff.countDocuments(filter),
    ]);
    res.json({ employees, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  });
  router.get("/letters/employees/:id", ...guard(), async (req, res) => {
    const person = objectId(req.params.id) && await staff.findOne({ _id: objectId(req.params.id), deletedAt: null }, { projection: { photo: 0 } });
    if (!person) return res.status(404).json({ message: "Employee not found. Refresh the employee list." });
    const joining = await letters.findOne({ staffId: person._id, type: "joining" }, { projection: { joiningDate: 1, salaryPaise: 1, salaryPeriod: 1 } , sort: { joiningDate: -1, createdAt: -1 } });
    res.json({ employee: { _id: person._id, ...employeeSnapshot(person), status: person.status }, defaults: { joiningDate: person.joiningDate || joining?.joiningDate || "", salary: person.salary || (joining ? joining.salaryPaise / 100 : ""), salaryPeriod: person.salary ? "month" : joining?.salaryPeriod || "month" } });
  });

  async function prepare(body, current) {
    const staffId = objectId(body?.staffId);
    if (!staffId || current && !staffId.equals(current.staffId)) return { errors: { staffId: "Choose an employee. The employee of a saved letter cannot change." } };
    const person = !current && await staff.findOne({ _id: staffId, deletedAt: null }, { projection: { name: 1, employeeId: 1, designation: 1, department: 1 } });
    if (!current && !person) return { errors: { staffId: "This employee no longer exists. Refresh the list." } };
    const result = validateLetter(body, current?.employee || employeeSnapshot(person), current);
    return { ...result, fields: { ...result.fields, staffId } };
  }
  const sendPdf = (res, pdf, number, attachment = false) => res.set({ "Content-Type": "application/pdf", "Content-Disposition": `${attachment ? "attachment" : "inline"}; filename="${number.replaceAll("/", "-")}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }).send(pdf);

  router.post("/letters/preview", ...editorGuard, ...guard("export"), pdfLimit, async (req, res) => {
    const current = req.body?.id && objectId(req.body.id) ? await letters.findOne({ _id: objectId(req.body.id) }, { projection }) : null;
    if (req.body?.id && !current) return res.status(404).json({ message: "Letter no longer exists. Refresh its history." });
    const { fields, errors } = await prepare(req.body, current);
    if (Object.keys(errors).length) return validationError(res, errors);
    sendPdf(res, await employmentLetterPdf({ ...fields, letterNumber: current?.letterNumber || "PREVIEW" }, { preview: true }), "letter-preview");
  });
  router.get("/letters", ...guard(), async (req, res) => {
    const { type, search = "", staffId, from, to } = req.query;
    if (type !== undefined && (typeof type !== "string" || !Object.hasOwn(letterTypes, type)) || typeof search !== "string" || search.length > 100 || staffId !== undefined && !objectId(staffId) || from !== undefined && !validDate(from) || to !== undefined && !validDate(to) || from && to && to < from) return res.status(400).json({ message: "Choose valid letter, employee and issue-date filters." });
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1)), limit = 20;
    const regex = { $regex: escapedSearch(search.trim()), $options: "i" };
    const filter = { ...(type ? { type } : {}), ...(staffId ? { staffId: objectId(staffId) } : {}), ...(search.trim() ? { $or: ["letterNumber", "employee.name", "employee.employeeId", "employee.department", "employee.designation"].map((key) => ({ [key]: regex })) } : {}), ...(from || to ? { issueDate: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}) };
    const [records, total] = await Promise.all([letters.find(filter, { projection }).sort({ issueDate: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(), letters.countDocuments(filter)]);
    res.json({ letters: records.map(publicLetter), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  });
  router.post("/letters", ...guard("create"), pdfLimit, async (req, res) => {
    if (typeof req.body?.requestKey !== "string" || !/^[a-f0-9-]{36}$/i.test(req.body.requestKey)) return res.status(400).json({ message: "A valid request key is required. Reopen the letter editor." });
    const payloadHash = digest(JSON.stringify(Object.fromEntries(["type", "staffId", "company", "joiningDate", "issueDate", "lastWorkingDate", "salary", "salaryPeriod", "content", "terms", "responsibilities", "performance"].map((key) => [key, req.body[key] ?? null]))));
    const previous = await letters.findOne({ requestKey: req.body.requestKey }, { projection: { pdf: 0 } });
    if (previous) return previous.payloadHash === payloadHash ? res.json({ letter: publicLetter(previous) }) : res.status(409).json({ message: "This request was already used for different content. Reopen the saved letter before editing." });
    const { fields, errors } = await prepare(req.body);
    if (Object.keys(errors).length) return validationError(res, errors);
    const duplicate = await letters.findOne({ type: fields.type, staffId: fields.staffId, joiningDate: fields.joiningDate }, { projection: { _id: 1, letterNumber: 1 } });
    if (duplicate) return res.status(409).json({ message: `${letterTypes[fields.type]} ${duplicate.letterNumber} already exists for this employment period. Edit the existing letter.`, existingId: duplicate._id });
    const year = fields.issueDate.slice(0, 4);
    const counter = await db.collection("employment_letter_counters").findOneAndUpdate({ _id: `${fields.type}:${year}` }, { $inc: { sequence: 1 } }, { upsert: true, returnDocument: "after" });
    const now = new Date(), letterNumber = `EI/${fields.type === "joining" ? "JL" : "EL"}/${year}/${String(counter.sequence).padStart(6, "0")}`;
    const pdf = await employmentLetterPdf({ ...fields, letterNumber });
    const record = { ...fields, letterNumber, pdf, pdfSha256: digest(pdf), requestKey: req.body.requestKey, payloadHash, version: 1, createdAt: now, updatedAt: now, createdBy: req.admin._id, updatedBy: req.admin._id };
    try { await letters.insertOne(record); }
    catch (error) {
      if (error.code !== 11000) throw error;
      const retry = await letters.findOne({ requestKey: req.body.requestKey }, { projection: { pdf: 0 } });
      if (retry?.payloadHash === payloadHash) return res.json({ letter: publicLetter(retry) });
      return res.status(409).json({ message: "A letter already exists for this employee and employment period. Refresh history and edit it." });
    }
    res.status(201).json({ letter: publicLetter(record) });
  });
  router.get("/letters/:id", ...guard(), async (req, res) => {
    const record = objectId(req.params.id) && await letters.findOne({ _id: objectId(req.params.id) }, { projection });
    if (!record) return res.status(404).json({ message: "Letter not found." });
    res.json({ letter: publicLetter(record) });
  });
  router.get("/letters/:id/pdf", ...guard("export"), async (req, res) => {
    const record = objectId(req.params.id) && await letters.findOne({ _id: objectId(req.params.id) });
    if (!record) return res.status(404).json({ message: "Letter not found." });
    const pdf = Buffer.from(record.pdf.buffer ?? record.pdf);
    if (digest(pdf) !== record.pdfSha256) return res.status(500).json({ message: "The stored document failed its integrity check. Contact an administrator." });
    sendPdf(res, pdf, record.letterNumber, req.query.download === "true");
  });
  router.patch("/letters/:id", ...guard("edit"), pdfLimit, async (req, res) => {
    const current = objectId(req.params.id) && await letters.findOne({ _id: objectId(req.params.id) }, { projection });
    if (!current) return res.status(404).json({ message: "Letter not found." });
    const { fields, errors } = await prepare(req.body, current);
    if (Object.keys(errors).length) return validationError(res, errors);
    const pdf = await employmentLetterPdf({ ...fields, letterNumber: current.letterNumber });
    let updated;
    try { updated = await letters.findOneAndUpdate({ _id: current._id, version: current.version }, { $set: { ...fields, pdf, pdfSha256: digest(pdf), updatedAt: new Date(), updatedBy: req.admin._id }, $inc: { version: 1 } }, { returnDocument: "after", projection }); }
    catch (error) { if (error.code === 11000) return res.status(409).json({ message: "A letter already exists for that employment period." }); throw error; }
    if (!updated) return validationError(res, { version: "This letter changed or was deleted. Reopen it before saving." });
    res.json({ letter: publicLetter(updated) });
  });
  router.delete("/letters/:id", ...guard("delete"), async (req, res) => {
    if (!objectId(req.params.id) || !Number.isInteger(req.body?.version) || req.body.version < 1) return res.status(400).json({ message: "Choose a saved letter and its current version." });
    const result = await letters.deleteOne({ _id: objectId(req.params.id), version: req.body.version });
    if (!result.deletedCount) return res.status(409).json({ message: "This letter changed or was deleted. Refresh history before deleting." });
    res.sendStatus(204);
  });
  management.use(router);
}
