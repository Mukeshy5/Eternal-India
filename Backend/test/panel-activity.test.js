import test from "node:test";
import assert from "node:assert/strict";
import { panelActivity } from "../lib/panel-activity.js";

test("background editing and connection requests do not generate alert spam", () => {
  for (const path of ["/vouchers/quote", "/vouchers/invoice", "/letters/preview", "/letters/preview/", "/socket-ticket", "/notifications/read-all", "/notifications/settings", "/logout"]) assert.equal(panelActivity({ method: "POST", path }), null, path);
  assert.equal(panelActivity({ method: "GET", path: "/invoices" }), null);
});

test("saved invoice and voucher alerts describe the actual action", () => {
  assert.deepEqual(panelActivity({ method: "POST", path: "/invoices" }), { label: "an invoice", action: "created" });
  assert.deepEqual(panelActivity({ method: "PUT", path: "/invoices/123" }), { label: "an invoice", action: "updated" });
  assert.deepEqual(panelActivity({ method: "DELETE", path: "/invoices/123" }), { label: "an invoice", action: "deleted" });
  assert.deepEqual(panelActivity({ method: "POST", path: "/vouchers" }), { label: "a journey voucher", action: "created" });
});

test("staff account provisioning and invoice grants are recorded with clear actions", () => {
  const accountId = "0123456789abcdef01234567", invoiceId = "abcdef0123456789abcdef01";
  assert.deepEqual(panelActivity({ method: "POST", path: "/staff-accounts" }), { label: "Staff Login accounts", action: "created" });
  assert.deepEqual(panelActivity({ method: "PATCH", path: `/staff-accounts/${accountId}/invoices/${invoiceId}`, body: { authorized: true } }), { label: "access to an invoice", action: "granted" });
  assert.deepEqual(panelActivity({ method: "PATCH", path: `/staff-accounts/${accountId}/invoices/${invoiceId}`, body: { authorized: false } }), { label: "access to an invoice", action: "revoked" });
});

test("technical workspace changes are recorded without logging data-control previews", () => {
  assert.deepEqual(panelActivity({ method: "POST", path: "/festival-decorations" }), { label: "festival settings", action: "created" });
  assert.deepEqual(panelActivity({ method: "POST", path: "/data-control/cleanup" }), { label: "Data Control operation", action: "updated" });
  assert.equal(panelActivity({ method: "POST", path: "/data-control/records/enquiries/preview" }), null);
});

test("enquiry archive, restore and permanent delete alerts remain distinct", () => {
  const path = "/enquiries/0123456789abcdef01234567";
  assert.deepEqual(panelActivity({ method: "DELETE", path }), { label: "an enquiry", action: "archived" });
  assert.equal(panelActivity({ method: "PATCH", path, body: { archive: true } }).action, "archived");
  assert.equal(panelActivity({ method: "PATCH", path, body: { archive: false } }).action, "restored");
  assert.equal(panelActivity({ method: "PATCH", path, body: { status: "RESOLVED" } }).action, "updated");
  assert.deepEqual(panelActivity({ method: "DELETE", path: `${path}/permanent` }), { label: "an enquiry", action: "deleted" });
});
