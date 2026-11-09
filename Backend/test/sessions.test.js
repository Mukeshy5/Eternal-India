import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionLifecycle } from "../lib/session-lifecycle.js";

test("concurrent logout treats a missing session touch as expiry and waits for pending writes", async () => {
  let finish;
  const store = { touch(_id, _session, callback) { finish = callback; } };
  const drain = sessionLifecycle(store);
  let error = "pending", drained = false;
  store.touch("expired", {}, (failure) => { error = failure; });
  const waiting = drain().then(() => { drained = true; });
  await Promise.resolve(); assert.equal(drained, false);
  finish(new Error("Unable to find the session to touch"));
  await waiting;
  assert.equal(error, null); assert.equal(drained, true);
});

test("session storage failures still reach the request error handler", async () => {
  const failure = new Error("MongoDB unavailable");
  const store = { touch(_id, _session, callback) { callback(failure); } };
  const drain = sessionLifecycle(store);
  let error;
  store.touch("active", {}, (result) => { error = result; });
  assert.equal(error, failure); await drain();
});
