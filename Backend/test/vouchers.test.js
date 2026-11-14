import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { ObjectId } from "mongodb";
import ExcelJS from "exceljs";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin, hashPassword } from "../lib/passwords.js";
import { cookieHeader } from "../lib/cookies.js";
import { createApp } from "../app.js";
import { voucherCollection } from "../vouchers/model.js";
import { calculateVoucherPrice, moneyToPaise } from "../../shared/voucherBilling.js";
import { companyGstNumber } from "../../shared/gst.js";

test("company GST numbers support existing name-only records without inventing missing numbers", () => {
  assert.equal(companyGstNumber({ name: " 07abcde1234f1z5 " }), "07ABCDE1234F1Z5");
  assert.equal(companyGstNumber({ name: "Standard GST", rate: 18 }), "");
  assert.equal(companyGstNumber({ name: "07ABCDE1234F1Z5", gstNumber: "29abcde1234f1z5" }), "29ABCDE1234F1Z5");
});

test("voucher money uses validated integer paise", () => {
  assert.deepEqual(calculateVoucherPrice("100.10", 18), { currency: "INR", basePaise: 10010, gstRate: 18, gstPaise: 1802, totalPaise: 11812 });
  assert.equal(calculateVoucherPrice("0.10", 5).gstPaise, 1);
  for (const value of [true, null, {}, [], "", "1e4", "-1", "1.001", "Infinity", "100000000"]) assert.equal(moneyToPaise(value), null, String(value));
  assert.equal(calculateVoucherPrice("99999999.99", 100).totalPaise, 19999999998);
});

test("journey billing persists CRUD, unique invoices, pricing, filters and documents", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_vouchers_${randomUUID().replaceAll("-", "").slice(0, 10)}`, adminEmail: "billing-owner@example.com", adminPassword: randomUUID() };
  const { client, db } = await connectDatabase(config);
  await ensureAdmin(db, config);
  const system = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await system.decorationsReady;
  const server = system.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie;
  const request = (path, { method = "GET", body, auth = cookie } = {}) => fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(auth ? { Cookie: auth } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async (path, options) => { const reply = await request(path, options); const body = reply.status === 204 ? null : await reply.json(); assert.ok(reply.ok, `${reply.status}: ${JSON.stringify(body)}`); return body; };
  const reserve = async (requestId = randomUUID(), auth = cookie, prefix = "/admin") => (await json(`${prefix}/vouchers/invoice`, { method: "POST", body: { requestId }, auth })).invoice;
  let hotel, gst, office, body, saved;
  try {
    cookie = cookieHeader(await request("/admin/login", { method: "POST", body: { email: config.adminEmail, password: config.adminPassword } }));
    hotel = (await json("/admin/hotels", { method: "POST", body: { name: "Billing test stay", address: "12 Test Road, Jaipur", starRating: "4-Star (Upscale / Deluxe)", amount: 5000.25 } })).hotel;
    gst = (await json("/admin/gst", { method: "POST", body: { gstNumber: "07ABCDE1234F1Z5" } })).gstRate;
    office = (await json("/technical/office-addresses", { method: "POST", body: { name: "Delhi office", address: "12 Office Road, New Delhi 110001", phone: "+91 11 41715155" } })).address;
    body = { hotelId: hotel._id, gstId: gst._id, officeAddressId: office._id, mealPlan: "MAP", guestName: "Test Guest", voucherDate: "2026-11-13", requirement: "Two rooms and airport transfer.\nVegetarian meals.", checkInDate: "2026-12-01", checkOutDate: "2026-12-03", arrivalDate: "2026-12-01", arrivalPlace: "Delhi airport", departureDate: "2026-12-03", departurePlace: "Jaipur station", basePrice: "5000.25", status: "confirmed" };
    await t.test("existing GST numbers saved as names appear in management and voucher options and support pricing", async () => {
      const legacy = await db.collection("gst_rates").insertOne({ name: "29abcde1234f1z5", rate: 12 });
      try {
        for (const panel of ["admin", "technical"]) {
          for (const path of ["gst", "vouchers/options"]) {
            const result = await json(`/${panel}/${path}`);
            assert.equal(result.gstRates.find((item) => item._id === legacy.insertedId.toString()).gstNumber, "29ABCDE1234F1Z5");
          }
          const quote = await json(`/${panel}/vouchers/quote`, { method: "POST", body: { ...body, gstId: legacy.insertedId.toString() } });
          assert.equal(quote.gst.gstNumber, "29ABCDE1234F1Z5");
          assert.equal(quote.pricing.gstRate, 0, "a GSTIN alone does not add tax to new bookings");
        }
        assert.equal((await db.collection("gst_rates").findOne({ _id: legacy.insertedId })).gstNumber, undefined, "reading legacy records does not modify them");
      } finally { await db.collection("gst_rates").deleteOne({ _id: legacy.insertedId }); }
    });
    await t.test("all billing endpoints require authentication", async () => {
      for (const [path, method] of [["", "GET"], ["/options", "GET"], ["/invoice", "POST"], ["/quote", "POST"], ["/export?format=xlsx", "GET"], ["/000000000000000000000001", "GET"], ["/000000000000000000000001/pdf", "GET"], ["/000000000000000000000001/print-data", "GET"], ["", "POST"], ["/000000000000000000000001", "PATCH"], ["/000000000000000000000001", "DELETE"]]) assert.equal((await request(`/admin/vouchers${path}`, { method, auth: "", body: method === "POST" || method === "PATCH" ? {} : undefined })).status, 401, path);
    });
    await t.test("concurrent reservations are unique and retries reuse their number", async () => {
      const invoices = await Promise.all(Array.from({ length: 20 }, () => reserve()));
      assert.equal(new Set(invoices.map((v) => v.invoiceNumber)).size, 20);
      invoices.forEach((v) => assert.match(v.invoiceNumber, /^\d{5}$/));
      const key = randomUUID(), retries = await Promise.all(Array.from({ length: 5 }, () => reserve(key)));
      assert.equal(new Set(retries.map((v) => v.reservationId)).size, 1);
    });
    await t.test("quotes use database GST and creates cannot trust client totals", async () => {
      const quote = await json("/admin/vouchers/quote", { method: "POST", body });
      assert.equal(quote.pricing.totalPaise, 500025); assert.equal(quote.officeAddress.address, office.address);
      const invoice = await reserve();
      const payload = { ...body, reservationId: invoice.reservationId, invoiceNumber: "99999", pricing: { totalPaise: 1 }, gst: { rate: 0 } };
      const responses = await Promise.all(Array.from({ length: 3 }, () => request("/admin/vouchers", { method: "POST", body: payload })));
      assert.ok(responses.every((reply) => reply.ok));
      saved = (await responses[0].json()).voucher;
      assert.equal(saved.invoiceNumber, invoice.invoiceNumber); assert.equal(saved.pricing.totalPaise, 500025); assert.equal(saved.mealPlan, "MAP"); assert.equal(saved.officeAddress.address, office.address);
      assert.equal(await db.collection(voucherCollection).countDocuments({ _id: new ObjectId(saved._id) }), 1);
      assert.equal(saved.createHash, undefined); assert.equal(saved.gst.gstNumber, gst.gstNumber);
      assert.equal((await json(`/admin/vouchers/${saved._id}/print-data`)).voucher.guestName, body.guestName);
      const options = await json("/admin/vouchers/options"); assert.equal(options.hotels[0]._id, hotel._id); assert.equal(options.gstRates[0].gstNumber, gst.gstNumber);
    });
    await t.test("invalid amounts, dates, references and stale tax configurations fail", async () => {
      const invoice = await reserve();
      for (const patch of [{ basePrice: true }, { basePrice: "1.001" }, { basePrice: "-1" }, { checkOutDate: "2026-11-01" }, { arrivalDate: "2026-02-30" }, { departureDate: "2026-11-01" }, { guestName: " " }, { requirement: "" }, { hotelId: new ObjectId().toString() }, { gstId: new ObjectId().toString() }, { status: "paid" }]) assert.equal((await request("/admin/vouchers", { method: "POST", body: { ...body, reservationId: invoice.reservationId, ...patch } })).status, 400, JSON.stringify(patch));
      assert.equal((await request("/admin/vouchers", { method: "POST", body: { ...body, expectedGstRate: 5, reservationId: invoice.reservationId } })).status, 409);
      assert.equal((await request("/admin/gst", { method: "POST", body: { name: "invalid", rate: 18, gstNumber: "bad" } })).status, 400);
      for (const q of ["from=2026-12-01&to=2026-01-01", "hotelId=bad", "status=bad", "page=-1", "search[$ne]=x"]) assert.equal((await request(`/admin/vouchers?${q}`)).status, 400, q);
      assert.equal((await request(`/admin/vouchers/${saved._id}`, { method: "POST", body })).status, 404);
    });
    await t.test("concurrent creates get distinct numbers and history aggregates all filtered records", async () => {
      const invoices = await Promise.all(Array.from({ length: 12 }, () => reserve()));
      await Promise.all(invoices.map((invoice, i) => json("/admin/vouchers", { method: "POST", body: { ...body, guestName: `Concurrent ${i}`, reservationId: invoice.reservationId } })));
      const list = await json("/admin/vouchers?pageSize=10"); assert.equal(list.total, 13); assert.equal(list.vouchers.length, 10); assert.equal(list.pages, 2); assert.equal(list.totalBillingPaise, 13 * 500025);
      assert.equal((await json("/admin/vouchers?page=999&pageSize=10")).page, 2);
      for (const filter of [`invoiceNumber=${saved.invoiceNumber}`, "guestName=Test%20Guest", "search=Test%20Guest", `hotelId=${hotel._id}&gstId=${gst._id}&from=2026-11-13&to=2026-11-13&guestName=Test`]) assert.equal((await json(`/admin/vouchers?${filter}`)).total, 1);
      assert.equal((await json("/admin/vouchers?search=%5B%2E%2A%5D")).total, 0, "regex is escaped");
    });
    await t.test("snapshots persist and revision checks prevent lost edits", async () => {
      await json(`/admin/hotels/${hotel._id}`, { method: "PATCH", body: { ...hotel, name: "Updated hotel", amount: 9000 } });
      gst = (await json(`/admin/gst/${gst._id}`, { method: "PATCH", body: { gstNumber: "29ABCDE1234F1Z5", version: gst.version } })).gstRate;
      const old = (await json(`/admin/vouchers/${saved._id}`)).voucher; assert.equal(old.hotel.name, hotel.name); assert.equal(old.gst.gstNumber, "07ABCDE1234F1Z5"); assert.equal(old.pricing.totalPaise, 500025);
      const update = { ...body, guestName: "Edited guest", basePrice: "100.10", revision: old.revision, expectedGstRate: 0, invoiceNumber: "99999" };
      const replies = await Promise.all([request(`/admin/vouchers/${saved._id}`, { method: "PATCH", body: update }), request(`/admin/vouchers/${saved._id}`, { method: "PATCH", body: update })]);
      assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
      saved = (await json(`/admin/vouchers/${saved._id}`)).voucher; assert.equal(saved._id, old._id); assert.equal(saved.invoiceNumber, old.invoiceNumber); assert.equal(saved.pricing.totalPaise, 10010); assert.equal(saved.revision, 2);
      assert.equal((await request(`/admin/vouchers/${saved._id}?revision=1`, { method: "DELETE" })).status, 409);
    });
    await t.test("PDF and Excel exports use persisted values and filters", async () => {
      const reply = await request(`/admin/vouchers/${saved._id}/pdf`); assert.equal(reply.status, 200); assert.match(reply.headers.get("content-type"), /application\/pdf/); const pdf = Buffer.from(await reply.arrayBuffer()); assert.equal(pdf.subarray(0, 4).toString(), "%PDF"); assert.ok(pdf.length > 5000);
      const exportReply = await request(`/admin/vouchers/export?format=xlsx&invoiceNumber=${saved.invoiceNumber}`);
      assert.equal(exportReply.status, 200); const book = new ExcelJS.Workbook(); await book.xlsx.load(await exportReply.arrayBuffer()); const sheet = book.worksheets[0]; assert.equal(sheet.getCell("A2").value, saved.invoiceNumber); assert.equal(sheet.getCell("C2").value, "Edited guest"); assert.equal(sheet.getCell("M2").value, 100.1); assert.equal(sheet.getCell("A3").value, null);
      const history = await request("/admin/vouchers/export?format=pdf"); assert.equal(history.status, 200); assert.equal(Buffer.from(await history.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
      assert.equal((await request("/admin/vouchers/export?format=csv")).status, 400);
    });
    await t.test("Technical role can bill; other roles cannot use reservations or modify vouchers", async () => {
      const password = randomUUID(); await db.collection("admins").insertOne({ email: "billing-tech@example.com", roles: ["technical"], status: "active", passwordHash: await hashPassword(password) });
      const technicalCookie = cookieHeader(await request("/technical/login", { method: "POST", auth: "", body: { email: "billing-tech@example.com", password } }));
      assert.equal((await request("/technical/vouchers", { auth: technicalCookie })).status, 200);
      assert.equal((await request("/admin/vouchers", { auth: technicalCookie })).status, 403);
      const invoice = await reserve(randomUUID(), technicalCookie, "/technical");
      assert.equal((await request("/admin/vouchers", { method: "POST", body: { ...body, reservationId: invoice.reservationId } })).status, 403, "reservation belongs to its creator");
      const created = await json("/technical/vouchers", { method: "POST", auth: technicalCookie, body: { ...body, reservationId: invoice.reservationId } }); assert.match(created.voucher.invoiceNumber, /^\d{5}$/);
      await db.collection("admins").updateOne({ email: "billing-tech@example.com" }, { $set: { roles: ["staff"] } });
      assert.equal((await request(`/technical/vouchers/${saved._id}`, { method: "PATCH", body, auth: technicalCookie })).status, 403);
    });
    await t.test("deleted referenced records retain snapshots; deletion removes records and never recycles invoices", async () => {
      await request(`/admin/hotels/${hotel._id}`, { method: "DELETE" }); await request(`/admin/gst/${gst._id}`, { method: "DELETE", body: { version: gst.version } });
      await json(`/technical/office-addresses/${office._id}`, { method: "DELETE", body: { version: office.version } });
      const updated = await json(`/admin/vouchers/${saved._id}`, { method: "PATCH", body: { ...body, guestName: "Still editable", revision: saved.revision, expectedGstRate: 0 } });
      assert.equal(updated.voucher.hotel.name, "Updated hotel");
      assert.equal((await request(`/admin/vouchers/${saved._id}?revision=${updated.voucher.revision}`, { method: "DELETE" })).status, 204);
      assert.equal(await db.collection(voucherCollection).countDocuments({ _id: new ObjectId(saved._id) }), 0);
      assert.equal((await request(`/admin/vouchers/${saved._id}`)).status, 404);
      const reservation = await db.collection("journey_invoice_reservations").findOne({ _id: new ObjectId(saved._id) }); assert.ok(reservation.deletedAt);
      assert.equal((await request("/admin/vouchers", { method: "POST", body: { ...body, reservationId: saved._id } })).status, 409);
      assert.notEqual((await reserve()).invoiceNumber, saved.invoiceNumber);
    });
    await t.test("invoice capacity fails explicitly after 99999", async () => {
      await db.collection("billing_counters").updateOne({ _id: "journey_invoice" }, { $set: { sequence: 99998 } });
      assert.equal((await reserve()).invoiceNumber, "99999");
      assert.equal((await request("/admin/vouchers/invoice", { method: "POST", body: { requestId: randomUUID() } })).status, 409);
    });
  } finally {
    system.decorationScheduler.stop(); await system.drainSessions(); await new Promise((resolve) => server.close(resolve));
    if (!config.databaseName.startsWith("eternal_india_test_vouchers_")) throw new Error("Refusing cleanup outside test database");
    await db.dropDatabase(); await client.close();
  }
});
