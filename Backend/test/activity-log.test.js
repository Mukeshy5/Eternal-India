import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { activityQuery, sanitizeActivityValue } from "../lib/activity-log.js";

test("activity snapshots redact credentials and sensitive payloads recursively", () => {
  const saved = sanitizeActivityValue({
    _id: new ObjectId("0123456789abcdef01234567"),
    name: "Staff member",
    passwordHash: "never store",
    salary: 120000,
    nested: { requestKey: "never store", originalPayload: { secret: "never store" }, status: "active" },
  });
  assert.deepEqual(saved, {
    _id: "0123456789abcdef01234567",
    name: "Staff member",
    nested: { status: "active" },
  });
});

test("activity filters accept bounded searches, categories and pagination only", () => {
  assert.deepEqual(activityQuery({ search: "invoice", resource: "invoices", page: "2", pageSize: "50" }), { search: "invoice", resource: "invoices", page: 2, pageSize: 50 });
  assert.equal(activityQuery({ resource: "festival settings" }).resource, "festival settings");
  assert.equal(activityQuery({ resource: "data control" }).resource, "data control");
  for (const query of [
    { resource: "passwords" },
    { page: "1.5" },
    { pageSize: "20" },
    { search: "x".repeat(121) },
  ]) assert.throws(() => activityQuery(query));
});
