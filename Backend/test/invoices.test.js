import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ObjectId } from "mongodb";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin, hashPassword } from "../lib/passwords.js";
import { cookieHeader } from "../lib/cookies.js";
import { createApp } from "../app.js";
import { calculateInvoice, invoiceBank, invoiceNotes, invoiceToday } from "../../shared/invoices.js";
import { invoiceCollection } from "../invoices/model.js";

test("invoice money uses integer paise and rejects unsafe or malformed inputs", () => {
  assert.deepEqual(calculateInvoice(4, "15000"), { totalPerson: 4, perPersonAmount: 15000, totalAmount: 60000, totalPaise: 6000000 });
  assert.equal(calculateInvoice(3, "0.10").totalPaise, 30);
  for (const [people, rate] of [[0, 10], [-1, 10], [1.5, 10], [true, 10], [1, 0], [1, "1.001"], [1, "1e3"], [1, {}], [999999, 99999999.99]]) assert.equal(calculateInvoice(people, rate), null);
});

test("invoice APIs persist, authorize, number concurrently, synchronize and generate PDFs", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "invoice-owner@example.com", technicalEmail: "", adminPassword: "InvoiceIntegration9" };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const system = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await system.decorationsReady;
  const server = system.app.listen(0, "127.0.0.1"); await once(server, "listening"); system.enquirySystem.realtime.attach(server);
  const origin = `http://127.0.0.1:${server.address().port}/api`; let cookie = "", technicalCookie = "", invoice;
  const base = { invoiceDate: invoiceToday(), clientName: "Invoice QA Client", totalPerson: 4, perPersonAmount: "15000", recipientDetails: "Accounts Department\n12 Garden Road, New Delhi", description: "Travel / Tour Services", notes: invoiceNotes, invoiceType: "invoice" };
  const request = (path, { method = "GET", body, auth = cookie } = {}) => fetch(origin + path, { method, headers: { "Content-Type": "application/json", ...(auth ? { Cookie: auth } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  async function json(path, options) { const reply = await request(path, options), data = reply.status === 204 ? null : await reply.json(); assert.ok(reply.ok, `${path}: ${reply.status} ${JSON.stringify(data)}`); return data; }
  const create = (patch = {}, path = "/invoices") => json(path, { method: "POST", body: { ...base, requestId: randomUUID(), ...patch } });
  async function pdf(id, filename) {
    const reply = await request(`/technical/invoices/${id}/pdf`); assert.equal(reply.status, 200); assert.equal(reply.headers.get("content-type"), "application/pdf");
    assert.match(reply.headers.get("content-disposition"), /filename="Invoice-EI-INV-\d{6,}\.pdf"/);
    const bytes = Buffer.from(await reply.arrayBuffer()); assert.match(bytes.toString("latin1"), /^%PDF-/); assert.ok(bytes.length > 20000);
    // Logo and the original QR must both be embedded as image XObjects.
    assert.ok((bytes.toString("latin1").match(/\/Subtype \/Image/g) || []).length >= 2);
    if (process.env.INVOICE_QA_DIR) { await mkdir(resolve(process.env.INVOICE_QA_DIR), { recursive: true }); await writeFile(resolve(process.env.INVOICE_QA_DIR, filename), bytes); }
    return bytes;
  }
  try {
    await t.test("all routes require authentication and reject unrelated roles", async () => {
      for (const prefix of ["", "/admin", "/technical"]) for (const [suffix, method, body] of [["", "GET"], ["", "POST", base], [`/${new ObjectId()}`, "GET"], [`/${new ObjectId()}/pdf`, "GET"], [`/${new ObjectId()}`, "PUT", base], [`/${new ObjectId()}`, "DELETE", { version: 1 }]]) assert.equal((await request(`${prefix}/invoices${suffix}`, { method, body })).status, 401);
      const outsider = { email: "outsider@example.com", passwordHash: await hashPassword("InvoiceOutsider9"), roles: ["visitor"], status: "active" };
      await db.collection("admins").insertOne(outsider);
      assert.equal((await request("/admin/login", { method: "POST", body: { email: outsider.email, password: "InvoiceOutsider9" } })).status, 403);
      cookie = cookieHeader(await request("/admin/login", { method: "POST", body: { email: config.adminEmail, password: config.adminPassword } })); assert.ok(cookie);
      await db.collection("admins").insertOne({ email: "invoice-tech@example.com", name: "Invoice Technical", passwordHash: await hashPassword("InvoiceTechnical9"), roles: ["technical"], status: "active" });
      technicalCookie = cookieHeader(await request("/technical/login", { method: "POST", auth: "", body: { email: "invoice-tech@example.com", password: "InvoiceTechnical9" } })); assert.ok(technicalCookie);
      assert.equal((await request("/admin/invoices", { auth: technicalCookie })).status, 403);
      assert.equal((await request("/invoices", { auth: technicalCookie })).status, 200);
    });
    await t.test("server validates input and snapshots trusted bank details and amount", async () => {
      for (const patch of [{ clientName: "" }, { totalPerson: 0 }, { totalPerson: 1.5 }, { perPersonAmount: -1 }, { perPersonAmount: "12.001" }, { invoiceDate: "2026-02-30" }, { recipientDetails: {} }, { notes: "x".repeat(6001) }, { requestId: "bad" }]) assert.equal((await request("/invoices", { method: "POST", body: { ...base, requestId: randomUUID(), ...patch } })).status, 400);
      invoice = (await create({ totalAmount: 1, totalPaise: 1, companyBankDetails: { accountNumber: "forged" }, paymentQrAsset: "bad", invoiceNumber: "forged", createdBy: { name: "forged" } })).invoice;
      assert.equal(invoice.invoiceNumber, "EI-INV-000001"); assert.equal(invoice.totalAmount, 60000); assert.equal(invoice.totalPaise, 6000000); assert.deepEqual(invoice.companyBankDetails, invoiceBank); assert.equal(invoice.paymentQrAsset, "payment-QR"); assert.equal(invoice.createdBy.email, config.adminEmail);
      const saved = await db.collection(invoiceCollection).findOne({ _id: new ObjectId(invoice._id) }); assert.equal(saved.totalAmount, 60000); assert.ok(saved.createdAt instanceof Date);
      await assert.rejects(db.collection(invoiceCollection).insertOne({ clientName: "Malformed" }), (error) => error.code === 121);
      assert.equal((await json(`/technical/invoices/${invoice._id}`, { auth: technicalCookie })).invoice.invoiceNumber, invoice.invoiceNumber);
    });
    await t.test("simultaneous creates are unique, sequential and retries idempotent", async () => {
      const replies = await Promise.all(Array.from({ length: 12 }, (_, i) => create({ clientName: `Concurrent ${i}` })));
      const numbers = replies.map(({ invoice: item }) => Number(item.invoiceNumber.split("-").at(-1))).sort((a, b) => a - b);
      assert.deepEqual(numbers, Array.from({ length: 12 }, (_, i) => i + 2));
      const requestId = randomUUID(), same = await Promise.all(Array.from({ length: 5 }, () => create({ requestId, clientName: "Same submission" })));
      assert.equal(new Set(same.map(({ invoice: item }) => item._id)).size, 1);
      assert.equal(await db.collection(invoiceCollection).countDocuments({ clientName: "Same submission" }), 1);
      assert.equal((await request("/invoices", { method: "POST", body: { ...base, requestId, clientName: "Changed submission" } })).status, 409);
    });
    await t.test("search, date, range, month, year, sorting, pagination and totals use MongoDB", async () => {
      const all = await json("/invoices"); assert.equal(all.total, 14); assert.equal(all.stats.totalAmount, 840000); assert.equal(all.stats.today, 14); assert.equal(all.stats.month, 14);
      assert.equal((await json(`/invoices?invoiceNumber=${invoice.invoiceNumber}`)).total, 1);
      assert.equal((await json("/invoices?clientName=Invoice%20QA")).total, 1);
      assert.equal((await json("/invoices?search=Concurrent&pageSize=10")).invoices.length, 10);
      assert.equal((await json("/invoices?search=Concurrent&pageSize=10&page=2")).invoices.length, 2);
      assert.equal((await json("/invoices?search=%5B%2E*%5D")).total, 0, "search is literal, not an injected expression");
      await create({ clientName: "Historical client", invoiceDate: "2024-01-15", perPersonAmount: "0.10", totalPerson: 3 });
      for (const filter of ["date=2024-01-15", "from=2024-01-01&to=2024-01-31", "month=2024-01", "year=2024"]) { const result = await json(`/invoices?${filter}`); assert.equal(result.total, 1); assert.equal(result.filteredAmount, .3); }
      assert.equal((await json("/invoices?sort=oldest")).invoices[0].clientName, "Historical client");
      for (const query of ["date=2026-02-30", "from=2026-12-31&to=2026-01-01", "month=2026-13", "year=1800", "pageSize=13", "sort=bad", "search[x]=x", "page=1.5"]) assert.equal((await request(`/invoices?${query}`)).status, 400);
    });
    await t.test("cross-panel updates preserve number, audit identity and reject stale writes", async () => {
      const old = invoice;
      invoice = (await json(`/technical/invoices/${invoice._id}`, { method: "PUT", auth: technicalCookie, body: { ...base, clientName: "Updated client", totalPerson: 3, perPersonAmount: "100.10", totalAmount: 1, invoiceNumber: "forged", version: invoice.version } })).invoice;
      assert.equal(invoice.totalAmount, 300.3); assert.equal(invoice.invoiceNumber, old.invoiceNumber); assert.deepEqual(invoice.createdBy, old.createdBy); assert.equal(invoice.updatedBy.email, "invoice-tech@example.com"); assert.equal(invoice.version, 2);
      assert.equal((await request(`/invoices/${invoice._id}`, { method: "PUT", body: { ...base, version: 1 } })).status, 409);
      assert.equal((await request(`/invoices/${invoice._id}`, { method: "DELETE", body: { version: 1 } })).status, 409);
      assert.ok(await db.collection("enquiry_events").findOne({ type: "invoice-change", invoiceId: invoice._id, action: "updated" }));
    });
    await t.test("normal and multipage PDFs embed original assets and use A4 pages", async () => {
      await pdf(invoice._id, "invoice-a4.pdf");
      const unicode = (await create({ clientName: "हिंदी ग्राहक", recipientDetails: "दिल्ली ".repeat(500), notes: "हिंदी ".repeat(900) })).invoice;
      assert.equal(unicode.clientName, "हिंदी ग्राहक", "valid Unicode details fit the request body limit");
      const long = (await create({ clientName: "Long invoice / बहु पृष्ठ", invoiceType: "tax_invoice", recipientDetails: Array.from({ length: 40 }, (_, i) => `Recipient address line ${i + 1}: New Delhi billing address`).join("\n"), notes: Array.from({ length: 40 }, (_, i) => `Note ${i + 1}. Keep the invoice reference with your payment confirmation and contact the accounts department.`).join("\n") })).invoice;
      const bytes = await pdf(long._id, "invoice-multipage.pdf");
      assert.ok((bytes.toString("latin1").match(/\/Type \/Page\b/g) || []).length > 1);
      assert.match(bytes.toString("latin1"), /\/MediaBox \[0 0 595\.28 841\.89\]/);
    });
    await t.test("permanent deletion prevents retry resurrection and number reuse", async () => {
      const requestId = randomUUID(), item = (await create({ requestId })).invoice;
      await json(`/technical/invoices/${item._id}`, { method: "DELETE", auth: technicalCookie, body: { version: item.version } });
      assert.equal(await db.collection(invoiceCollection).countDocuments({ _id: new ObjectId(item._id) }), 0);
      assert.equal((await request(`/invoices/${item._id}`)).status, 404);
      assert.equal((await request("/invoices", { method: "POST", body: { ...base, requestId } })).status, 410);
      const next = (await create()).invoice; assert.ok(next.invoiceNumber > item.invoiceNumber);
      const interrupted = (await create()).invoice;
      await db.collection("invoice_requests").updateOne({ _id: new ObjectId(interrupted._id) }, { $set: { deletedAt: new Date(Date.now() - 120000), deletionToken: "interrupted-process" } });
      await json(`/invoices/${interrupted._id}`, { method: "DELETE", body: { version: interrupted.version } });
      assert.equal(await db.collection(invoiceCollection).countDocuments({ _id: new ObjectId(interrupted._id) }), 0, "interrupted deletion can be recovered");
    });
  } finally {
    await system.enquirySystem.stop(); await system.decorationScheduler.stop(); await system.drainSessions();
    await new Promise((done) => server.close(done)); assert.ok(db.databaseName.startsWith("eternal_india_test_")); await db.dropDatabase(); await client.close();
  }
});
