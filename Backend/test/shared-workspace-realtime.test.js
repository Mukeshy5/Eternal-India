import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createRequire } from "node:module";
import { ObjectId } from "mongodb";
import { readConfig } from "../config/env.js";
import { connectDatabase } from "../config/database.js";
import { ensureAdmin } from "../lib/passwords.js";
import { cookieHeader } from "../lib/cookies.js";
import { createApp } from "../app.js";
import { invoiceNotes, invoiceToday } from "../../shared/invoices.js";
import { indiaDate } from "../../shared/staff.js";

const { io } = createRequire(new URL("../../frontend/package.json", import.meta.url))("socket.io-client");
const waitFor = async (check, label) => {
  const deadline = Date.now() + 15000;
  while (!await check()) { assert.ok(Date.now() < deadline, label); await new Promise((resolve) => setTimeout(resolve, 40)); }
};

test("enquiries, vouchers, invoices and history update live across Admin, Technical and every Staff workspace", { timeout: 180000 }, async (t) => {
  const config = { ...readConfig(), databaseName: `eternal_india_test_shared_${randomUUID().replaceAll("-", "").slice(0, 10)}`, adminEmail: "shared-owner@example.com", adminPassword: "SharedWorkspace12!", technicalEmail: "" };
  const { db, client } = await connectDatabase(config), owner = await ensureAdmin(db, config);
  const system = createApp({ db, client, config, schedulerOptions: { intervalMs: 0 } });
  await Promise.all([system.decorationsReady, system.dataControlReady]);
  const server = system.app.listen(0, "127.0.0.1"); await once(server, "listening"); system.enquirySystem.realtime.attach(server);
  const origin = `http://127.0.0.1:${server.address().port}`, streams = [], sockets = [], panels = [], invoices = [], vouchers = [];
  const request = async (panel, path, method = "GET", body) => fetch(`${origin}/api/${panel ? `${panel.name}/` : ""}${path}`, { method, headers: { "Content-Type": "application/json", ...(panel?.cookie ? { Cookie: panel.cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = async (...args) => { const reply = await request(...args), data = reply.status === 204 ? null : await reply.json(); assert.ok(reply.ok, `${args[1]}: ${reply.status} ${JSON.stringify(data)}`); return data; };
  async function stream(panel) {
    const controller = new AbortController(), events = [];
    const reply = await fetch(`${origin}/api/staff/events`, { headers: { Cookie: panel.cookie }, signal: controller.signal });
    assert.equal(reply.status, 200);
    const reader = reply.body.getReader(), decoder = new TextDecoder();
    const finished = (async () => {
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            const event = block.match(/^event: (.+)$/m)?.[1], data = block.match(/^data: (.+)$/m)?.[1];
            if (event && data) events.push({ event, data: JSON.parse(data) });
          }
        }
      } catch (error) { if (!controller.signal.aborted) throw error; }
    })();
    const connection = { controller, events, finished }; streams.push(connection); return connection;
  }
  async function expectChange(resource, action, id) {
    await waitFor(() => sockets.every(({ events }) => events.some((event) => event.resource === resource && event.action === action && event.resourceId === id))
      && streams.every(({ events }) => events.some(({ event, data }) => event === "workspace:changed" && data.resource === resource && data.action === action && (data.resourceId === id || data.invoiceId === id))), `${resource} ${action} must reach every open panel`);
  }
  try {
    const now = new Date(), employees = [1, 2, 3].map((number) => ({ _id: new ObjectId(), employeeId: `EI-00000000000${number}`, name: `Shared staff ${number}`, email: `shared${number}@example.com`, phone: `+91987654321${number}`, department: "Operations", designation: "Travel coordinator", photo: Buffer.from("test-photo"), photoMime: "image/png", version: 1, status: "active", deletedAt: null, createdAt: now, updatedAt: now }));
    await db.collection("staff").insertMany(employees);
    await db.collection("staff_accounts").insertMany(employees.map((employee, index) => ({ _id: new ObjectId(), staffId: employee._id, employeeId: employee.employeeId, username: `shared.${index + 1}`, usernameKey: `shared.${index + 1}`, passwordHash: owner.passwordHash, status: index === 2 ? "inactive" : "active", version: 1, authVersion: 1, createdAt: now, updatedAt: now })));
    for (const name of ["admin", "technical"]) {
      const panel = { name }, reply = await request(panel, "login", "POST", { email: config.adminEmail, password: config.adminPassword }); assert.equal(reply.status, 200);
      panel.cookie = cookieHeader(reply); panels.push(panel);
      const { ticket } = await json(panel, "socket-ticket", "POST", {}), events = [];
      const socket = io(origin, { path: "/api/enquiries/socket.io", transports: ["websocket"], reconnection: false, auth: { panel: name, ticket } });
      sockets.push({ socket, events });
      socket.on("workspace:changed", (event) => events.push(event));
      socket.on("invoices:changed", (event) => events.push({ resource: "invoices", resourceId: event.invoiceId, ...event }));
      await once(socket, "connect");
    }
    for (const username of ["shared.1", "shared.2"]) {
      const panel = { name: "staff" }, reply = await request(panel, "login", "POST", { username, password: config.adminPassword }); assert.equal(reply.status, 200);
      panel.cookie = cookieHeader(reply); panels.push(panel); await stream(panel);
    }
    await waitFor(() => streams.every(({ events }) => events.some(({ event }) => event === "changed")), "both Staff streams initialize");
    await t.test("new unassigned enquiries notify all active staff once and remain visible everywhere", async () => {
      const fields = { submissionId: randomUUID(), name: "Shared enquiry guest", email: "shared-guest@example.com", destination: "Delhi", travellers: 2, message: "Notify every staff panel", voiceLanguage: "en" };
      const first = await request(null, "enquiries", "POST", fields); assert.equal(first.status, 201); const { reference } = await first.json();
      assert.equal((await request(null, "enquiries", "POST", fields)).status, 200);
      const saved = await db.collection("enquiries").findOne({ reference });
      await waitFor(() => streams.every(({ events }) => events.some(({ event, data }) => event === "notification:event" && data.enquiryId === saved._id.toString())), "unassigned enquiry alerts reach both Staff accounts");
      for (const employee of employees.slice(0, 2)) assert.equal(await db.collection("staff_notifications").countDocuments({ staffId: employee._id, enquiryId: saved._id.toString() }), 1);
      assert.equal(await db.collection("staff_notifications").countDocuments({ staffId: employees[2]._id, enquiryId: saved._id.toString() }), 0);
      for (const panel of panels) assert.ok((await json(panel, "enquiries")).enquiries.some((row) => row.reference === reference));
    });
    const hotel = (await json(panels[1], "hotels", "POST", { name: "Shared Hotel", address: "Delhi", starRating: "4-Star (Upscale / Deluxe)", amount: 1000 })).hotel;
    const gst = (await json(panels[1], "gst", "POST", { gstNumber: "07ABCDE1234F1Z5" })).gstRate;
    const office = (await json(panels[1], "office-addresses", "POST", { address: "Shared Delhi office" })).address;
    const invoiceBody = { invoiceDate: invoiceToday(), totalPerson: 2, perPersonAmount: "1500", recipientDetails: "Delhi", description: "Shared service", notes: invoiceNotes, invoiceType: "invoice" };
    const voucherBody = { hotelId: hotel._id, gstId: gst._id, officeAddressId: office._id, mealPlan: "CP", voucherDate: indiaDate(), requirement: "One room", checkInDate: "2026-12-01", checkOutDate: "2026-12-03", arrivalDate: "2026-12-01", arrivalPlace: "Delhi", departureDate: "2026-12-03", departurePlace: "Delhi", basePrice: "1000", status: "confirmed" };
    for (const creator of panels.slice(0, 3)) {
      await t.test(`${creator.name} creates and corrects records visible live in all panels`, async () => {
        const createdInvoice = (await json(creator, "invoices", "POST", { ...invoiceBody, clientName: `${creator.name} client`, requestId: randomUUID() })).invoice;
        const reservation = (await json(creator, "vouchers/invoice", "POST", { requestId: randomUUID() })).invoice;
        const createdVoucher = (await json(creator, "vouchers", "POST", { ...voucherBody, guestName: `${creator.name} guest`, reservationId: reservation.reservationId })).voucher;
        await expectChange("invoices", "created", createdInvoice._id); await expectChange("journeys", "created", createdVoucher._id);
        for (const panel of panels) {
          assert.ok((await json(panel, "invoices")).invoices.some((row) => row._id === createdInvoice._id));
          assert.ok((await json(panel, "vouchers")).vouchers.some((row) => row._id === createdVoucher._id));
        }
        const correctedInvoice = (await json(creator, `invoices/${createdInvoice._id}`, "PUT", { ...invoiceBody, clientName: `${creator.name} corrected client`, version: createdInvoice.version })).invoice;
        const correctedVoucher = (await json(creator, `vouchers/${createdVoucher._id}`, "PATCH", { ...voucherBody, guestName: `${creator.name} corrected guest`, revision: createdVoucher.revision })).voucher;
        invoices.push({ creator, invoice: correctedInvoice }); vouchers.push({ creator, voucher: correctedVoucher });
        await expectChange("invoices", "updated", correctedInvoice._id); await expectChange("journeys", "updated", correctedVoucher._id);
        for (const panel of panels) {
          assert.equal((await json(panel, `invoices/${correctedInvoice._id}`)).invoice.clientName, correctedInvoice.clientName);
          assert.equal((await json(panel, `vouchers/${correctedVoucher._id}`)).voucher.guestName, correctedVoucher.guestName);
        }
        await system.drainActivity();
        for (const panel of panels) {
          const history = await json(panel, "activity?pageSize=100");
          assert.ok(history.activities.some((row) => row.resourceId === correctedInvoice._id && row.action === "updated"));
          assert.ok(history.activities.some((row) => row.resourceId === correctedVoucher._id && row.action === "updated"));
        }
        assert.equal(await db.collection("panel_activity_history").countDocuments({ resourceId: createdInvoice._id, action: "created" }), 1, "nested routers must not duplicate history");
      });
    }
    await t.test("deletions and notifications from another instance reach staff without a page refresh", async () => {
      const { creator, invoice } = invoices.at(-1), { voucher } = vouchers.at(-1);
      await json(creator, `invoices/${invoice._id}`, "DELETE", { version: invoice.version });
      await json(creator, `vouchers/${voucher._id}?revision=${voucher.revision}`, "DELETE");
      await expectChange("invoices", "deleted", invoice._id); await expectChange("journeys", "deleted", voucher._id);
      for (const panel of panels) {
        assert.equal((await request(panel, `invoices/${invoice._id}`)).status, 404);
        assert.equal((await request(panel, `vouchers/${voucher._id}`)).status, 404);
      }
      const id = `remote:${randomUUID()}`;
      await db.collection("staff_notifications").insertOne({ _id: id, staffId: employees[0]._id, title: "Remote instance", message: "Recovered from durable storage", createdAt: new Date(), read: false });
      await waitFor(() => streams[0].events.some(({ event, data }) => event === "notification:event" && data.id === id), "cross-instance notification recovery");
      assert.equal(streams[1].events.some(({ data }) => data.id === id), false, "personal notification recovery remains scoped");
    });
  } finally {
    streams.forEach(({ controller }) => controller.abort()); await Promise.allSettled(streams.map(({ finished }) => finished));
    sockets.forEach(({ socket }) => socket.disconnect());
    await system.enquirySystem.stop(); await system.decorationScheduler.stop(); await system.dataControl.stop(); await system.drainSessions(); await system.drainActivity();
    await new Promise((resolve) => server.close(resolve));
    if (!config.databaseName.startsWith("eternal_india_test_shared_")) throw new Error("Unsafe shared workspace test cleanup");
    await db.dropDatabase(); await client.close();
  }
});
