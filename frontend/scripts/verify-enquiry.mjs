import assert from "node:assert/strict";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";

export async function verifyEnquiryInteractions(server) {
  const testWindow = new Window({ url: "http://localhost/request-quote" });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, FormData: testWindow.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const plays = [];
  let pauses = 0;
  let blockWelcome = true;
  testWindow.HTMLMediaElement.prototype.play = function () {
    plays.push(decodeURIComponent(this.src));
    return blockWelcome ? Promise.reject(new testWindow.DOMException("Autoplay blocked", "NotAllowedError")) : Promise.resolve();
  };
  testWindow.HTMLMediaElement.prototype.pause = () => { pauses += 1; };
  const requests = [];
  let mode = "failure";
  let resolvePending;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/enquiries");
    requests.push(JSON.parse(options.body));
    if (mode === "pending") return new Promise((resolve) => { resolvePending = resolve; });
    return new Response(JSON.stringify(mode === "failure" ? { message: "Database unavailable" } : { reference: "EI-TEST-ENGLISH" }), { status: mode === "failure" ? 503 : 201, headers: { "Content-Type": "application/json" } });
  };
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div");
  testWindow.document.body.append(container);
  const root = createRoot(container);
  let unmounted = false;
  try {
    const { default: Quote } = await server.ssrLoadModule("/src/Pages/RequestQuote.jsx");
    await act(async () => root.render(createElement(MemoryRouter, null, createElement(Quote))));
    assert.ok(plays[0].includes("Plan your trip-welcome.mp3"), "welcome is attempted on page entry");
    const audio = container.querySelector("audio");
    assert.equal(audio.hidden, true, "audio plays in the background");
    assert.equal(audio.controls, false, "no audio player is displayed");
    for (const text of ["A little welcome, in a voice.", "Choose your confirmation language.", "Welcome message", "Replay welcome", "Use the player", "Press Play below"]) assert.ok(!container.textContent.includes(text), `${text} is absent from the form`);
    blockWelcome = false;
    await act(async () => testWindow.document.dispatchEvent(new testWindow.PointerEvent("pointerdown", { bubbles: true })));
    assert.ok(plays.at(-1).includes("Plan your trip-welcome.mp3"), "blocked welcome retries on the first interaction");
    const playedWelcome = plays.length;
    await act(async () => testWindow.document.dispatchEvent(new testWindow.PointerEvent("pointerdown", { bubbles: true })));
    assert.equal(plays.length, playedWelcome, "later interactions do not restart a playing welcome");
    const form = container.querySelector("form");
    const submit = container.querySelector(".enquiry-submit");
    const send = () => form.dispatchEvent(new testWindow.SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: submit }));
    await act(async () => send());
    assert.equal(requests.length, 0, "invalid form is not submitted");
    const beforeSuccess = plays.length;
    for (const [name, value] of Object.entries({ name: "Test Guest", email: "guest@example.com", destination: "Jaipur", travellers: "2" })) form.elements.namedItem(name).value = value;
    const language = form.elements.namedItem("voiceLanguage");
    await act(async () => { language.value = "hi"; language.dispatchEvent(new testWindow.Event("change", { bubbles: true })); });
    await act(async () => send());
    assert.equal(requests.length, 1);
    assert.equal(requests[0].voiceLanguage, "hi");
    assert.equal(plays.length, beforeSuccess, "failed save does not play a success recording");
    assert.ok(container.querySelector('[role="alert"]').textContent.includes("Database unavailable"));
    assert.equal(form.elements.namedItem("name").value, "Test Guest", "failed save preserves form values");

    mode = "pending";
    await act(async () => send());
    assert.equal(submit.disabled, true);
    await act(async () => send());
    assert.equal(requests.length, 2, "double submission is ignored while saving");
    assert.equal(requests[1].submissionId, requests[0].submissionId, "retry reuses the idempotency key");
    await act(async () => resolvePending(new Response(JSON.stringify({ reference: "EI-TEST-HINDI" }), { status: 201, headers: { "Content-Type": "application/json" } })));
    assert.ok(plays.at(-1).includes("hindi successfully submited.mp3"));
    assert.ok(decodeURIComponent(container.querySelector("audio").src).includes("hindi successfully submited.mp3"), "render keeps the active Hindi audio source");
    assert.ok(container.querySelector(".enquiry-status").textContent.includes("EI-TEST-HINDI"));
    assert.equal(submit.disabled, false);

    mode = "success";
    // A successful submission resets required fields for the next enquiry.
    for (const [name, value] of Object.entries({ name: "Next Guest", email: "next@example.com", destination: "Kerala", travellers: "2" })) form.elements.namedItem(name).value = value;
    await act(async () => { language.value = "en"; language.dispatchEvent(new testWindow.Event("change", { bubbles: true })); });
    await act(async () => send());
    assert.equal(requests.at(-1).voiceLanguage, "en");
    assert.notEqual(requests.at(-1).submissionId, requests[0].submissionId, "editing starts a new submission");
    assert.ok(plays.at(-1).includes("english successfully submited.mp3"));
    assert.ok(decodeURIComponent(container.querySelector("audio").src).includes("english successfully submited.mp3"), "render keeps the active English audio source");
    assert.ok(pauses >= plays.length, "one shared player stops the previous recording before playback");
    const beforeUnmount = pauses;
    await act(async () => root.unmount());
    unmounted = true;
    assert.ok(pauses > beforeUnmount, "leaving the page stops the audio");
    const playsBeforeLeave = plays.length;
    testWindow.document.dispatchEvent(new testWindow.PointerEvent("pointerdown", { bubbles: true }));
    assert.equal(plays.length, playsBeforeLeave, "leaving the page removes background audio interaction handlers");
    console.log("PASS hidden background audio, gesture retry, enquiry validation, failed-save recovery, duplicate prevention, Hindi/English confirmation, and cleanup");
  } finally {
    if (!unmounted) await act(async () => root.unmount());
    testWindow.close();
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}
