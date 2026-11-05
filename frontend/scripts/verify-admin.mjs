import assert from "node:assert/strict";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";

export async function verifyAdminInteractions(server) {
  const testWindow = new Window({ url: "http://localhost/admin/login" });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const calls = [];
  let signedIn = false;
  const entry = { _id: "000000000000000000000001", name: "Admin UI Guest", email: "guest@example.com", phone: "+91 9000000000", destination: "Jaipur", travellers: 2, date: "", message: "Family holiday\nHeritage and local food", voiceLanguage: "hi", reference: "EI-TEST-UI", status: "new", createdAt: "2026-11-05T08:00:00Z" };
  const response = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/admin/login") {
      const body = JSON.parse(options.body);
      assert.equal(body.email, "admin@example.com");
      signedIn = body.password === "correct-password";
      return signedIn ? response({ admin: { id: "admin", email: body.email } }) : response({ message: "Email or password is incorrect." }, 401);
    }
    if (url === "/api/admin/me") return response({ message: "Please sign in." }, 401);
    if (url === "/api/admin/logout") { signedIn = false; return response(null, 204); }
    if (!signedIn) return response({ message: "Please sign in." }, 401);
    if (options.method === "PATCH") { entry.status = JSON.parse(options.body).status; return response({ message: "Updated" }); }
    if (url.startsWith("/api/admin/enquiries?")) return response({ enquiries: [entry], total: 1, page: 1, pages: 1, stats: { total: 1, new: entry.status === "new" ? 1 : 0, contacted: entry.status === "contacted" ? 1 : 0, closed: 0 } });
    throw new Error(`Unexpected API request: ${url}`);
  };
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div");
  testWindow.document.body.append(container);
  const root = createRoot(container);
  const type = (input, value) => {
    Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new testWindow.Event("input", { bubbles: true }));
    input.dispatchEvent(new testWindow.Event("change", { bubbles: true }));
  };
  try {
    const { default: Admin } = await server.ssrLoadModule("/src/Pages/Admin.jsx");
    await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/admin/login"] }, createElement(Admin))));
    assert.ok(container.querySelector(".admin-login-form"), "unauthenticated administrator sees login");
    await act(async () => { type(container.querySelector("#admin-email"), "admin@example.com"); type(container.querySelector("#admin-password"), "incorrect"); });
    await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    assert.ok(container.querySelector('[role="alert"]').textContent.includes("incorrect"));
    await act(async () => type(container.querySelector("#admin-password"), "correct-password"));
    await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    assert.ok(container.querySelector(".dashboard-table").textContent.includes(entry.name), "successful login shows saved enquiries");
    const menu = container.querySelector(".dashboard-mobile-menu");
    await act(async () => menu.click());
    assert.equal(menu.getAttribute("aria-expanded"), "true");
    await act(async () => container.querySelector(".dashboard-status-navigation button").click());
    assert.equal(menu.getAttribute("aria-expanded"), "false", "mobile menu closes after selection");
    await act(async () => container.querySelector(".dashboard-view").click());
    assert.ok(container.querySelector(".dashboard-drawer").textContent.includes(entry.message));
    assert.ok(container.querySelector(".dashboard-drawer").textContent.includes("Hindi"));
    await act(async () => container.querySelector('[aria-label="Close enquiry details"]').click());
    const status = container.querySelector(`#status-${entry._id}`);
    await act(async () => { status.value = "contacted"; status.dispatchEvent(new testWindow.Event("change", { bubbles: true })); });
    assert.ok(calls.some((call) => call.options.method === "PATCH" && JSON.parse(call.options.body).status === "contacted"));
    assert.equal(container.querySelector(`#status-${entry._id}`).value, "contacted");
    await act(async () => type(container.querySelector("#enquiry-search"), "Jaipur"));
    await act(async () => container.querySelector(".dashboard-search").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    assert.ok(calls.some((call) => call.url.includes("search=Jaipur")));
    await act(async () => container.querySelector(".dashboard-sign-out-button").click());
    assert.ok(container.querySelector(".admin-login-form"));
    assert.equal(container.querySelector(".dashboard-table"), null, "logout removes guest information from the screen");
    console.log("PASS admin login errors, authenticated inbox, full enquiry details, status update, search, and logout");
  } finally {
    await act(async () => root.unmount());
    testWindow.close();
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}
