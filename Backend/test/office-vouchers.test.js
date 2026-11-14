import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ObjectId } from "mongodb";
import ExcelJS from "exceljs";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { cookieHeader } from "../lib/cookies.js";
import { createApp } from "../app.js";
import { voucherCollection } from "../vouchers/model.js";
import { calculateVoucherPrice, mealPlanLabel, voucherCompany } from "../../shared/voucherBilling.js";

test("office addresses, number-only GST and voucher meal plans use shared authenticated MongoDB APIs", async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`, adminEmail: "office-owner@example.com", technicalEmail: "", adminPassword: "OfficeIntegration9" };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const system = createApp({ client, db, config, schedulerOptions: { intervalMs: 0 } }); await system.decorationsReady;
  const server = system.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "", office, gst, hotel, voucher, base;
  const request = (path, { method = "GET", body, auth = cookie } = {}) => fetch(origin + path, { method, headers: { "Content-Type": "application/json", ...(auth ? { Cookie: auth } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  async function json(path, options) { const reply = await request(path, options), data = reply.status === 204 ? null : await reply.json(); assert.ok(reply.ok, `${path}: ${reply.status} ${JSON.stringify(data)}`); return data; }
  const reserve = async () => (await json("/admin/vouchers/invoice", { method: "POST", body: { requestId: randomUUID() } })).invoice;
  async function qaFile(reply, name) {
    assert.equal(reply.status, 200); const bytes = Buffer.from(await reply.arrayBuffer()); assert.match(bytes.toString("latin1"), /^%PDF-/);
    if (process.env.VOUCHER_QA_DIR) { await mkdir(resolve(process.env.VOUCHER_QA_DIR), { recursive: true }); await writeFile(resolve(process.env.VOUCHER_QA_DIR, name), bytes); }
    return bytes;
  }
  try {
    await t.test("all master data requires authentication in both panels", async () => {
      for (const panel of ["admin", "technical"]) for (const path of ["office-addresses", "gst", "vouchers/options"]) assert.equal((await request(`/${panel}/${path}`)).status, 401);
      cookie = cookieHeader(await request("/admin/login", { method: "POST", body: { email: config.adminEmail, password: config.adminPassword } }));
      hotel = (await json("/admin/hotels", { method: "POST", body: { name: "Office QA Hotel", address: "Hotel Road, Jaipur", starRating: "4-Star (Upscale / Deluxe)", amount: 5000.25 } })).hotel;
    });
    await t.test("office CRUD validates, prevents duplicates and stale edits, and is shared between panels", async () => {
      assert.equal((await request("/technical/office-addresses", { method: "POST", body: { name: "", address: "x" } })).status, 400);
      office = (await json("/admin/office-addresses", { method: "POST", body: { name: "Delhi office", address: "12 Garden Road, New Delhi, 110001", phone: "+91 11 41715155" } })).address;
      assert.equal((await json("/technical/office-addresses")).addresses[0]._id, office._id);
      assert.equal((await json(`/technical/office-addresses/${office._id}`)).address.address, office.address);
      assert.equal((await request("/technical/office-addresses", { method: "POST", body: { ...office, name: "Other office", address: "  12  GARDEN ROAD, New Delhi, 110001 " } })).status, 409);
      const previous = office;
      office = (await json(`/technical/office-addresses/${office._id}`, { method: "PATCH", body: { ...office, address: "14 Garden Road, New Delhi, 110001" } })).address;
      assert.equal(office.version, 2);
      assert.equal((await request(`/admin/office-addresses/${office._id}`, { method: "PATCH", body: previous })).status, 409);
      assert.equal((await request(`/admin/office-addresses/${office._id}`, { method: "DELETE", body: { version: 1 } })).status, 409);
      assert.ok(await db.collection("enquiry_events").findOne({ type: "voucher-options-change", recordId: office._id, action: "updated" }));
      await assert.rejects(db.collection("office_addresses").insertOne({ name: "Missing details" }), (error) => error.code === 121);
    });
    await t.test("GST persists only numbers, normalizes case, rejects duplicates and supports legacy corrections", async () => {
      for (const body of [{}, { name: "Tax", rate: 18 }, { gstNumber: "bad" }, { gstNumber: { $ne: "" } }]) assert.equal((await request("/admin/gst", { method: "POST", body })).status, 400);
      gst = (await json("/technical/gst", { method: "POST", body: { gstNumber: " 07abcde1234f1z5 ", name: "Ignored name", rate: 99 } })).gstRate;
      assert.equal(gst.gstNumber, "07ABCDE1234F1Z5"); assert.equal(gst.name, undefined); assert.equal(gst.rate, undefined);
      const stored = await db.collection("gst_rates").findOne({ _id: new ObjectId(gst._id) }); assert.equal(stored.name, undefined); assert.equal(stored.rate, undefined);
      assert.equal((await request("/admin/gst", { method: "POST", body: { gstNumber: gst.gstNumber } })).status, 409);
      const concurrent = await Promise.all([1, 2, 3].map(() => request("/admin/gst", { method: "POST", body: { gstNumber: "09ABCDE1234F1Z5" } })));
      assert.deepEqual(concurrent.map((reply) => reply.status).sort(), [201, 409, 409]);
      const legacy = await db.collection("gst_rates").insertOne({ name: "29abcde1234f1z5", rate: 12 });
      const listed = (await json("/admin/gst")).gstRates.find((record) => record._id === legacy.insertedId.toString());
      assert.equal(listed.gstNumber, "29ABCDE1234F1Z5"); assert.equal(listed.rate, undefined); assert.equal(listed.name, undefined);
      await json(`/admin/gst/${listed._id}`, { method: "PATCH", body: { gstNumber: "27ABCDE1234F1Z5", version: listed.version } });
      const corrected = await db.collection("gst_rates").findOne({ _id: legacy.insertedId }); assert.equal(corrected.rate, undefined); assert.equal(corrected.name, undefined);
      await json(`/technical/gst/${listed._id}`, { method: "DELETE", body: { version: 2 } });
    });
    await t.test("new vouchers require saved offices and CP/MAP/AP and reject stale configuration", async () => {
      base = { guestName: "Office Voucher Guest", hotelId: hotel._id, gstId: gst._id, officeAddressId: office._id, mealPlan: "MAP", voucherDate: "2026-11-14", checkInDate: "2026-12-01", checkOutDate: "2026-12-03", arrivalDate: "2026-12-01", arrivalPlace: "Delhi airport", departureDate: "2026-12-03", departurePlace: "Jaipur station", requirement: "Two rooms and private transfers.", basePrice: "5000.25", status: "confirmed" };
      const invoice = await reserve();
      for (const patch of [{ officeAddressId: "" }, { officeAddressId: new ObjectId().toString() }, { mealPlan: "" }, { mealPlan: "EP" }, { mealPlan: ["CP"] }]) assert.equal((await request("/admin/vouchers", { method: "POST", body: { ...base, ...patch, reservationId: invoice.reservationId } })).status, 400);
      const quote = await json("/technical/vouchers/quote", { method: "POST", body: base });
      assert.equal(quote.pricing.totalPaise, 500025); assert.equal(quote.pricing.gstPaise, 0); assert.equal(quote.gst.rate, undefined);
      office = (await json(`/technical/office-addresses/${office._id}`, { method: "PATCH", body: { ...office, address: "16 Garden Road, New Delhi, 110001" } })).address;
      assert.equal((await request("/admin/vouchers", { method: "POST", body: { ...base, reservationId: invoice.reservationId, expectedOfficeVersion: quote.officeAddressVersion } })).status, 409);
      voucher = (await json("/admin/vouchers", { method: "POST", body: { ...base, reservationId: invoice.reservationId, expectedOfficeVersion: office.version, expectedGstVersion: gst.version, officeAddress: { address: "Forged" }, pricing: { totalPaise: 1 } } })).voucher;
      assert.equal(voucher.officeAddress.address, office.address); assert.equal(voucher.mealPlan, "MAP"); assert.equal(voucher.pricing.totalPaise, 500025);
      assert.equal((await json(`/technical/vouchers/${voucher._id}`)).voucher.officeAddress.address, office.address);
      assert.equal((await json(`/admin/vouchers?mealPlan=MAP&officeAddressId=${office._id}`)).total, 1);
      assert.equal((await json("/admin/vouchers?mealPlan=CP")).total, 0);
      assert.equal((await request("/admin/vouchers?mealPlan=EP")).status, 400);
    });
    await t.test("vouchers retain snapshots, edit meal plans, print all three plans and export the saved office", async () => {
      const savedOffice = voucher.officeAddress.address;
      office = (await json(`/admin/office-addresses/${office._id}`, { method: "PATCH", body: { ...office, name: "Delhi headquarters", address: "18 Garden Road, New Delhi, 110001" } })).address;
      gst = (await json(`/technical/gst/${gst._id}`, { method: "PATCH", body: { gstNumber: "29ABCDE1234F1Z5", version: gst.version } })).gstRate;
      assert.equal((await json(`/admin/vouchers/${voucher._id}`)).voucher.officeAddress.address, savedOffice);
      assert.equal((await json(`/admin/vouchers/${voucher._id}`)).voucher.gst.gstNumber, "07ABCDE1234F1Z5");
      for (const mealPlan of ["CP", "MAP", "AP"]) {
        const previousRevision = voucher.revision;
        voucher = (await json(`/technical/vouchers/${voucher._id}`, { method: "PATCH", body: { ...base, mealPlan, revision: voucher.revision, expectedOfficeVersion: office.version, expectedGstVersion: gst.version } })).voucher;
        assert.equal(voucher.mealPlan, mealPlan); assert.equal(voucher.officeAddress.address, office.address); assert.equal(voucher.pricing.totalPaise, 500025);
        assert.equal((await request(`/admin/vouchers/${voucher._id}`, { method: "PATCH", body: { ...base, revision: previousRevision } })).status, 409);
        await qaFile(await request(`/admin/vouchers/${voucher._id}/pdf`), `voucher-${mealPlan}.pdf`);
      }
      const excel = await request(`/technical/vouchers/export?format=xlsx&mealPlan=AP`); assert.equal(excel.status, 200);
      const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await excel.arrayBuffer())); const sheet = book.worksheets[0];
      assert.equal(sheet.getCell("R2").value, office.name); assert.equal(sheet.getCell("S2").value, office.address); assert.equal(sheet.getCell("T2").value, mealPlanLabel("AP"));
      await qaFile(await request("/admin/vouchers/export?format=pdf&mealPlan=AP"), "voucher-history.pdf");
    });
    await t.test("deleting masters preserves issued vouchers and their edit/print behavior", async () => {
      await json(`/technical/office-addresses/${office._id}`, { method: "DELETE", body: { version: office.version } });
      await json(`/admin/gst/${gst._id}`, { method: "DELETE", body: { version: gst.version } });
      const options = await json("/technical/vouchers/options"); assert.equal(options.officeAddresses.length, 0); assert.equal(options.usedOffices[0]._id, office._id);
      const saved = (await json(`/admin/vouchers/${voucher._id}`)).voucher; assert.equal(saved.mealPlan, "AP"); assert.equal(saved.officeAddress.address, office.address);
      voucher = (await json(`/technical/vouchers/${voucher._id}`, { method: "PATCH", body: { ...base, guestName: "Still editable", mealPlan: "AP", revision: voucher.revision } })).voucher;
      assert.equal(voucher.officeAddress.address, office.address); assert.equal(voucher.gst.gstNumber, gst.gstNumber);
      await qaFile(await request(`/technical/vouchers/${voucher._id}/pdf`), "voucher-after-master-deletion.pdf");
    });
    await t.test("older vouchers keep their saved tax and never acquire a fabricated meal plan", async () => {
      const now = new Date(), id = new ObjectId();
      const legacy = { ...base, _id: id, schemaVersion: 1, invoiceNumber: "65000", hotel: { name: hotel.name, address: hotel.address, amount: hotel.amount }, gst: { gstNumber: "07ABCDE1234F1Z5", name: "Historical GST", rate: 18 }, pricing: calculateVoucherPrice("100.10", 18), revision: 1, createdAt: now, updatedAt: now };
      delete legacy.officeAddressId; delete legacy.mealPlan;
      await db.collection(voucherCollection).insertOne(legacy);
      for (const invalid of [{ schemaVersion: 2 }, { schemaVersion: 3 }, { schemaVersion: undefined }]) {
        await assert.rejects(db.collection(voucherCollection).insertOne({ ...legacy, _id: new ObjectId(), invoiceNumber: "65001", ...invalid }), (error) => error.code === 121, "new or unrecognized schemas cannot bypass office and meal plan validation");
      }
      const read = (await json(`/admin/vouchers/${id}`)).voucher; assert.equal(read.mealPlan, undefined); assert.equal(read.pricing.totalPaise, 11812);
      const updated = (await json(`/technical/vouchers/${id}`, { method: "PATCH", body: { ...base, officeAddressId: "", mealPlan: "", basePrice: "100.10", revision: 1 } })).voucher;
      assert.equal(updated.pricing.totalPaise, 11812); assert.equal(updated.pricing.gstRate, 18); assert.equal(updated.mealPlan, ""); assert.equal(updated.officeAddress.address, voucherCompany.address);
      await qaFile(await request(`/admin/vouchers/${id}/pdf`), "voucher-legacy.pdf");
      const replacement = (await json("/admin/gst", { method: "POST", body: { gstNumber: "24ABCDE1234F1Z5" } })).gstRate;
      const changedNumber = (await json(`/technical/vouchers/${id}`, { method: "PATCH", body: { ...base, gstId: replacement._id, officeAddressId: "", mealPlan: "", basePrice: "100.10", revision: updated.revision } })).voucher;
      assert.equal(changedNumber.gst.gstNumber, replacement.gstNumber); assert.equal(changedNumber.pricing.totalPaise, 11812, "changing registration numbers retains the existing voucher tax calculation");
    });
  } finally {
    await system.enquirySystem.stop(); await system.decorationScheduler.stop(); await system.drainSessions();
    await new Promise((done) => server.close(done)); assert.ok(db.databaseName.startsWith("eternal_india_test_")); await db.dropDatabase(); await client.close();
  }
});
