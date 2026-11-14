import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ObjectId } from "mongodb";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { cookieHeader } from "../lib/cookies.js";
import { createApp } from "../app.js";
import { defaultLetterContent, employmentDuration, letterCompany } from "../../shared/employmentLetters.js";
import { validateLetter } from "../letters/validation.js";
import { defaultCertificationImageId } from "../../shared/companyCertifications.js";

const employee = { name: "Letter QA Employee", employeeId: "EI-ABCDEF123456", designation: "Travel coordinator", department: "Operations" };
const input = { type: "joining", company: letterCompany, issueDate: "2026-11-14", joiningDate: "2025-01-01", salary: "50000.50", salaryPeriod: "month", terms: "A notice period of 30 days applies.", content: "", responsibilities: "", performance: "" };

test("letter validation, precise money and inclusive calendar durations", () => {
  assert.ok(defaultLetterContent({ type: "joining", employee: null, company: letterCompany }).includes("[Employee name]"));
  assert.equal(employmentDuration("2024-01-01", "2024-12-31"), "1 year");
  assert.equal(employmentDuration("2024-02-29", "2025-02-28"), "1 year, 1 day");
  assert.equal(employmentDuration("2026-01-31", "2026-02-27"), "1 month");
  assert.equal(employmentDuration("2026-01-01", "2026-01-01"), "1 day");
  assert.equal(employmentDuration("2026-01-02", "2026-01-01"), "");
  const valid = validateLetter(input, employee); assert.deepEqual(valid.errors, {}); assert.equal(valid.fields.salaryPaise, 5000050); assert.ok(valid.fields.content.includes(employee.employeeId));
  for (const patch of [{ joiningDate: "2026-02-30" }, { salary: "1.001" }, { salary: -1 }, { type: ["joining"] }, { company: { ...letterCompany, name: "<script>" } }, { company: { ...letterCompany, certificationImageId: "https://invalid.example/cert.png" } }, { content: "x".repeat(16001) }]) assert.ok(Object.keys(validateLetter({ ...input, ...patch }, employee).errors).length);
  assert.ok(validateLetter({ ...input, type: "experience", lastWorkingDate: "2024-12-31" }, employee).errors.lastWorkingDate);
  assert.ok(validateLetter({ ...input, type: "experience", lastWorkingDate: "2026-11-15", responsibilities: "Work", performance: "Good" }, employee).errors.issueDate);
});

test("letters use real MongoDB, shared authenticated APIs and permanent atomic PDF storage", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "letters-owner@example.com", technicalEmail: "", adminPassword: "LettersIntegration9" };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const viewer = await ensureAdmin(db, { ...config, adminEmail: "letters-viewer@example.com" });
  await db.collection("admins").updateOne({ _id: viewer._id }, { $set: { roles: ["technical"], staffPermissions: ["view"] } });
  const backend = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "", viewerCookie, person, joining, experience, configuredCompany = letterCompany;
  const request = (path, { method = "GET", body, form, sessionCookie = cookie } = {}) => fetch(base + path, { method, headers: { Origin: "http://localhost:5173", ...(form ? {} : { "Content-Type": "application/json" }), ...(sessionCookie ? { Cookie: sessionCookie } : {}) }, ...(form ? { body: form } : body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const login = async (email, panel = "admin") => { const reply = await request(`/${panel}/login`, { method: "POST", body: { email, password: config.adminPassword }, sessionCookie: "" }); assert.equal(reply.status, 200); return cookieHeader(reply); };
  const payload = (patch = {}) => ({ ...input, company: configuredCompany, staffId: person._id, requestKey: randomUUID(), ...patch });
  const editPayload = (record, patch = {}) => ({ ...record, staffId: record.staffId, salary: String(record.salaryPaise / 100), ...patch });
  async function persistQa(pdf, name) {
    if (!process.env.LETTER_QA_DIR) return;
    await mkdir(resolve(process.env.LETTER_QA_DIR), { recursive: true }); await writeFile(resolve(process.env.LETTER_QA_DIR, name), pdf);
  }
  try {
    await t.test("authentication and scoped staff permissions protect every letter action", async () => {
      for (const panel of ["admin", "technical"]) for (const path of ["letters", "letters/settings", "letters/employees", `letters/certifications/${defaultCertificationImageId}`, `letters/${new ObjectId()}/pdf`]) assert.equal((await request(`/${panel}/${path}`)).status, 401);
      cookie = await login(config.adminEmail); viewerCookie = await login(viewer.email, "technical");
      assert.equal((await request("/technical/letters", { sessionCookie: viewerCookie })).status, 200);
      assert.equal((await request("/admin/letters", { sessionCookie: viewerCookie })).status, 403);
      assert.equal((await request("/technical/letters/certifications", { method: "POST", form: new FormData(), sessionCookie: viewerCookie })).status, 403);
      for (const [path, method] of [["letters", "POST"], ["letters/preview", "POST"], ["letters/settings", "PUT"], [`letters/${new ObjectId()}`, "PATCH"], [`letters/${new ObjectId()}`, "DELETE"], [`letters/${new ObjectId()}/pdf`, "GET"]]) assert.equal((await request(`/technical/${path}`, { method, ...(method !== "GET" ? { body: {} } : {}), sessionCookie: viewerCookie })).status, 403);
      const form = new FormData();
      for (const [key, value] of Object.entries({ name: employee.name, email: "letter-staff@example.com", phone: "9876543234", designation: employee.designation, department: employee.department, status: "active", joiningDate: input.joiningDate, salary: input.salary })) form.append(key, value);
      form.append("photo", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAUCAIAAAALACogAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAHUlEQVQokWO48+g1SYhhVMOj0VC6M5o0Xg/a/AAAqQdTblFbfKMAAAAASUVORK5CYII=", "base64")], { type: "image/png" }), "photo.png");
      const created = await request("/admin/staff", { method: "POST", form }); assert.equal(created.status, 201, await created.clone().text()); person = (await created.json()).staff;
      assert.equal(person.salary, "50000.50"); assert.equal(person.joiningDate, input.joiningDate);
    });
    await t.test("company defaults and employee details are fetched centrally with optimistic settings updates", async () => {
      const settings = await (await request("/admin/letters/settings")).json(); assert.equal(settings.version, 0);
      const company = { ...settings.company, signatory: "QA HR Manager" };
      assert.equal((await request("/technical/letters/settings", { method: "PUT", body: { company, version: 0 } })).status, 200);
      assert.equal((await (await request("/admin/letters/settings")).json()).company.signatory, company.signatory);
      assert.equal((await request("/admin/letters/settings", { method: "PUT", body: { company, version: 0 } })).status, 409);
      const people = await (await request(`/technical/letters/employees?search=${person.employeeId}`)).json(); assert.equal(people.total, 1); assert.equal(people.employees[0].photo, undefined);
      const details = await (await request(`/admin/letters/employees/${person._id}`)).json(); assert.equal(details.defaults.joiningDate, input.joiningDate); assert.equal(details.defaults.salary, input.salary);
    });
    await t.test("real company artwork uploads, persists, and is shared across panels; broken images cannot be selected", async () => {
      const original = await (await request(`/admin/letters/certifications/${defaultCertificationImageId}`)).json();
      assert.equal(original.width, 1640); assert.equal(original.height, 210);
      const bytes = Buffer.from(original.dataUrl.split(",")[1], "base64"); assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
      const form = new FormData(); form.append("certification", new Blob([bytes], { type: "image/png" }), "company-certifications.png");
      const response = await request("/technical/letters/certifications", { method: "POST", form }); assert.equal(response.status, 201, await response.clone().text());
      const image = await response.json(); assert.match(image.imageId, /^[a-f0-9]{64}$/);
      const stored = await db.collection("employment_letter_images").findOne({ _id: image.imageId }); assert.ok(stored.bytes); assert.equal(stored.width, 1640);
      assert.equal((await (await request(`/admin/letters/certifications/${image.imageId}`)).json()).dataUrl, image.dataUrl);
      const settings = await (await request("/admin/letters/settings")).json();
      configuredCompany = { ...settings.company, certificationImageId: image.imageId };
      assert.equal((await request("/technical/letters/settings", { method: "PUT", body: { company: configuredCompany, version: settings.version } })).status, 200);
      assert.equal((await (await request("/admin/letters/settings")).json()).company.certificationImageId, image.imageId);
      const invalid = new FormData(); invalid.append("certification", new Blob(["broken image"], { type: "image/png" }), "bad.png");
      assert.equal((await request("/admin/letters/certifications", { method: "POST", form: invalid })).status, 400);
      const oversized = new FormData(); oversized.append("certification", new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: "image/png" }), "oversized.png");
      assert.equal((await request("/admin/letters/certifications", { method: "POST", form: oversized })).status, 400);
      const unknownCompany = { ...configuredCompany, certificationImageId: "a".repeat(64) };
      assert.equal((await request("/admin/letters/settings", { method: "PUT", body: { company: unknownCompany, version: 2 } })).status, 404);
      assert.equal((await request("/technical/letters/preview", { method: "POST", body: payload({ company: unknownCompany }) })).status, 404);
    });
    await t.test("preview creates no record or reservation; generation creates a branded PDF and server employee snapshot", async () => {
      const draft = payload({ employee: { name: "Forged" } });
      const preview = await request("/technical/letters/preview", { method: "POST", body: draft }); assert.equal(preview.status, 200, await preview.clone().text()); assert.match(Buffer.from(await preview.arrayBuffer()).toString("latin1"), /^%PDF-/);
      assert.equal(await db.collection("employment_letters").countDocuments(), 0); assert.equal(await db.collection("employment_letter_counters").countDocuments(), 0);
      const response = await request("/admin/letters", { method: "POST", body: draft }); assert.equal(response.status, 201, await response.clone().text()); joining = (await response.json()).letter;
      assert.match(joining.letterNumber, /^EI\/JL\/2026\/000001$/); assert.equal(joining.employee.name, person.name); assert.equal(joining.pdf, undefined); assert.equal(joining.requestKey, undefined);
      assert.equal(joining.company.certificationImageId, configuredCompany.certificationImageId);
      assert.equal((await (await request("/technical/letters?type=joining")).json()).letters[0]._id, joining._id);
      const retry = await request("/technical/letters", { method: "POST", body: draft }); assert.equal(retry.status, 200); assert.equal((await retry.json()).letter._id, joining._id);
      assert.equal((await request("/admin/letters", { method: "POST", body: { ...draft, terms: "Changed retry" } })).status, 409);
      assert.equal((await request("/admin/letters", { method: "POST", body: payload() })).status, 409);
      const file = await request(`/technical/letters/${joining._id}/pdf?download=true`); assert.equal(file.status, 200); assert.match(file.headers.get("content-disposition"), /^attachment;/); assert.match(file.headers.get("cache-control"), /no-store/);
      const pdf = Buffer.from(await file.arrayBuffer()); assert.match(pdf.toString("latin1"), /^%PDF-/); assert.ok(pdf.includes(Buffer.from("/ToUnicode"))); assert.ok(pdf.includes(Buffer.from("/Subtype /Image")));
      assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length, 1, "A standard joining letter fits one A4 page without footer-only pages");
      assert.match(pdf.toString("latin1"), /\/Width 1640/); assert.match(pdf.toString("latin1"), /\/Height 210/);
      assert.equal(createHash("sha256").update(pdf).digest("hex"), joining.pdfSha256); await persistQa(pdf, "joining-letter.pdf");
      const stored = await db.collection("employment_letters").findOne({ _id: new ObjectId(joining._id) }); assert.ok(stored.pdf); assert.equal(stored.version, 1);
    });
    await t.test("experience letters validate employment dates and preserve responsibilities and performance", async () => {
      const draft = payload({ type: "experience", lastWorkingDate: "2026-10-31", responsibilities: "Managed bookings and coordinated guest itineraries.\nMaintained operational records.", performance: "Performed assigned duties professionally and reliably." });
      assert.equal((await request("/admin/letters", { method: "POST", body: { ...draft, lastWorkingDate: "2024-01-01" } })).status, 400);
      assert.equal((await request("/admin/letters", { method: "POST", body: { ...draft, performance: "" } })).status, 400);
      assert.equal((await request("/admin/letters", { method: "POST", body: { ...draft, staffId: new ObjectId().toString() } })).status, 400);
      const reply = await request("/technical/letters", { method: "POST", body: draft }); assert.equal(reply.status, 201, await reply.clone().text()); experience = (await reply.json()).letter;
      assert.match(experience.letterNumber, /^EI\/EL\/2026\/000001$/); assert.equal(experience.employmentDuration, "1 year, 10 months"); assert.equal(experience.responsibilities, draft.responsibilities);
      const pdf = Buffer.from(await (await request(`/admin/letters/${experience._id}/pdf`)).arrayBuffer()); await persistQa(pdf, "experience-letter.pdf");
      assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length, 1, "A standard experience letter fits one A4 page");
      assert.equal(experience.company.certificationImageId, joining.company.certificationImageId); assert.match(pdf.toString("latin1"), /\/Width 1640/);
      assert.equal((await (await request("/admin/letters?type=experience&search=Operations&from=2026-11-01&to=2026-11-30")).json()).total, 1);
      assert.equal((await (await request("/technical/letters?search=.%2A")).json()).total, 0);
      assert.equal((await request("/admin/letters?from=2026-02-30")).status, 400);
    });
    await t.test("concurrent creates and edits are atomic, and edits regenerate the PDF without replacing history identity", async () => {
      const concurrent = await Promise.all([1, 2].map(() => request("/technical/letters", { method: "POST", body: payload({ joiningDate: "2026-01-01" }) })));
      assert.deepEqual(concurrent.map((reply) => reply.status).sort(), [201, 409]);
      const before = joining;
      await db.collection("staff").updateOne({ _id: new ObjectId(person._id) }, { $set: { name: "Renamed employee" } });
      const updates = await Promise.all(["First amendment", "Second amendment"].map((terms) => request(`/admin/letters/${joining._id}`, { method: "PATCH", body: editPayload(joining, { terms }) })));
      assert.deepEqual(updates.map((reply) => reply.status).sort(), [200, 409]); joining = (await updates.find((reply) => reply.status === 200).json()).letter;
      assert.equal(joining.version, 2); assert.equal(joining.letterNumber, before.letterNumber); assert.notEqual(joining.pdfSha256, before.pdfSha256); assert.equal(joining.employee.name, person.name);
      assert.equal((await request(`/technical/letters/${joining._id}`, { method: "DELETE", body: { version: 1 } })).status, 409);
      assert.equal((await request(`/technical/letters/${joining._id}`, { method: "PATCH", body: editPayload(joining, { staffId: new ObjectId().toString() }) })).status, 400);
      const big = editPayload(experience, { content: ("A long employee service description with proper wrapping and complete operational context. ").repeat(160), responsibilities: "कार्य और जिम्मेदारियाँ: यात्रा प्रबंधन और अतिथि सेवा।", performance: "आरव शर्मा ने उत्कृष्ट सेवा प्रदान की।" });
      const reply = await request(`/technical/letters/${experience._id}`, { method: "PATCH", body: big }); assert.equal(reply.status, 200, await reply.clone().text()); experience = (await reply.json()).letter;
      const longPdf = Buffer.from(await (await request(`/admin/letters/${experience._id}/pdf`)).arrayBuffer()); assert.ok((longPdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length > 2); await persistQa(longPdf, "long-experience-letter.pdf");
      assert.equal((longPdf.toString("latin1").match(/\/Width 1640\b/g) || []).length, 1, "Certification bytes are embedded once and reused across pages");
    });
    await t.test("letters remain available after employee deletion and application restart; deleting removes the PDF without reusing numbers", async () => {
      assert.equal((await request(`/admin/staff/${person._id}`, { method: "DELETE", body: { version: person.version } })).status, 204);
      assert.equal((await request(`/technical/letters/${joining._id}/pdf`)).status, 200);
      const patched = await request(`/admin/letters/${joining._id}`, { method: "PATCH", body: editPayload(joining, { terms: "Historical letter amendment" }) }); assert.equal(patched.status, 200); joining = (await patched.json()).letter;
      const restarted = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await restarted.decorationsReady;
      const nextServer = restarted.app.listen(0, "127.0.0.1"); await once(nextServer, "listening");
      try { const persisted = await fetch(`http://127.0.0.1:${nextServer.address().port}/api/admin/letters/${joining._id}/pdf`, { headers: { Cookie: cookie } }); assert.equal(persisted.status, 200); assert.equal(createHash("sha256").update(Buffer.from(await persisted.arrayBuffer())).digest("hex"), joining.pdfSha256); }
      finally { await restarted.enquirySystem.stop(); await restarted.decorationScheduler.stop(); await new Promise((done) => nextServer.close(done)); }
      const sequence = await db.collection("employment_letter_counters").findOne({ _id: "joining:2026" });
      assert.equal((await request(`/technical/letters/${joining._id}`, { method: "DELETE", body: { version: joining.version } })).status, 204);
      assert.equal(await db.collection("employment_letters").countDocuments({ _id: new ObjectId(joining._id) }), 0); assert.equal((await request(`/admin/letters/${joining._id}/pdf`)).status, 404);
      assert.equal((await db.collection("employment_letter_counters").findOne({ _id: "joining:2026" })).sequence, sequence.sequence);
      await assert.rejects(db.collection("employment_letters").insertOne({ type: "joining" }), (error) => error.code === 121);
    });
  } finally {
    await backend.enquirySystem.stop(); await backend.decorationScheduler.stop(); await backend.drainSessions();
    await new Promise((done) => server.close(done)); await db.dropDatabase(); await client.close();
  }
});
