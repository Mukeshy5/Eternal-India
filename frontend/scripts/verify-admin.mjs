import assert from "node:assert/strict";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { browserFormData } from "./browser-form-data.mjs";

export async function verifyAdminInteractions(server, technical = false) {
  const basePath = technical ? "/technical" : "/admin";
  const testWindow = new Window({ url: `http://localhost${basePath}/login` });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, FormData: browserFormData(testWindow), IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  const calls = [];
  let signedIn = false;
  const accounts = [];
  let vouchers = [{ _id: "000000000000000000000002", voucherNumber: "EIV-HISTORY-TEST", billing: { name: "History Guest", visitingCardNo: "H-1" }, journey: { from: "Delhi", fromAddress: "Airport" }, stops: [{ name: "Jaipur", address: "Hotel", distanceKm: 280, duration: "2 nights", arrivalDate: "2026-11-01", departureDate: "2026-11-03", meals: [], hotel: { name: "Test Hotel", starRating: "3-Star", gst: 12, amount: 2000 } }], message: "Happy travels", createdAt: "2026-11-01T00:00:00Z" }];
  const entry = { _id: "000000000000000000000001", name: "Admin UI Guest", email: "guest@example.com", phone: "+91 9000000000", destination: "Jaipur", travellers: 2, date: "", message: "Family holiday\nHeritage and local food", voiceLanguage: "hi", reference: "EI-TEST-UI", status: "new", createdAt: "2026-11-05T08:00:00Z" };
  const response = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === `/api${basePath}/login`) {
      const body = JSON.parse(options.body);
      assert.equal(body.email, "admin@example.com");
      signedIn = body.password === "correct-password";
      return signedIn ? response({ admin: { id: "admin", email: body.email, canManageAccounts: true } }) : response({ message: "Email or password is incorrect." }, 401);
    }
    if (url === `/api${basePath}/forgot-password`) return response({ message: "Password reset link sent." });
    if (url === `/api${basePath}/register`) return response({ message: "Account request received. Administrator approval required." }, 202);
    if (url === `/api${basePath}/reset-password`) return response({ message: "Password updated." });
    if (url === `/api${basePath}/me`) return response({ message: "Please sign in." }, 401);
    if (url === `/api${basePath}/logout`) { signedIn = false; return response(null, 204); }
    if (!signedIn) return response({ message: "Please sign in." }, 401);
    if (url === `/api${basePath}/accounts`) {
      if (options.method === "POST") { const { email, role } = JSON.parse(options.body); const account = { _id: "created", email, roles: [role], status: "active" }; accounts.push(account); return response({ account }, 201); }
      return response({ accounts });
    }
    if (url.startsWith(`/api${basePath}/vouchers?`)) return response({ vouchers, total: vouchers.length, page: 1, pages: 1 });
    if (url.startsWith(`/api${basePath}/vouchers/`) && options.method === "DELETE") { vouchers = []; return response(null, 204); }
    if (url === "/api/technical/promotions") return response({ targets: [], promotions: [] });
    if (url === "/api/technical/hotels") return response({ hotels: [] });
    if (options.method === "PATCH") { entry.status = JSON.parse(options.body).status; return response({ message: "Updated" }); }
    if (url.startsWith(`/api${basePath}/enquiries?`)) return response({ enquiries: [entry], total: 1, page: 1, pages: 1, stats: { total: 1, new: entry.status === "new" ? 1 : 0, contacted: entry.status === "contacted" ? 1 : 0, closed: 0 } });
    throw new Error(`Unexpected API request: ${url}`);
  };
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div");
  testWindow.document.body.append(container);
  const root = createRoot(container);
  async function waitFor(check) { for (let i = 0; i < 100; i++) { let found; await act(async () => { found = check(); if (!found) await new Promise((resolve) => setTimeout(resolve, 20)); }); if (found) return; } assert.fail(container.textContent.slice(-1600)); }
  const type = (input, value) => {
    Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new testWindow.Event("input", { bubbles: true }));
    input.dispatchEvent(new testWindow.Event("change", { bubbles: true }));
  };
  try {
    const { default: Admin } = await server.ssrLoadModule("/src/Pages/Admin.jsx");
    await act(async () => root.render(createElement(MemoryRouter, { initialEntries: [`${basePath}/login`] }, createElement(Admin, { technical }))));
    assert.ok(container.querySelector(".admin-login-form"), "unauthenticated administrator sees login");
    await act(async () => [...container.querySelectorAll("a")].find((link) => link.textContent === "Forgot password?").click());
    await act(async () => type(container.querySelector("#admin-email"), "admin@example.com"));
    await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    assert.ok(container.querySelector('[role="status"]').textContent.includes("reset link"));
    await act(async () => [...container.querySelectorAll("a")].find((link) => link.textContent === "Back to sign in").click());
    if (!technical) {
      await act(async () => [...container.querySelectorAll("a")].find((link) => link.textContent === "Create account").click());
      await act(async () => { type(container.querySelector("#admin-password"), "NewAdminPassword9"); type(container.querySelector("#admin-confirm-password"), "NewAdminPassword9"); });
      await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
      assert.ok(container.querySelector('[role="status"]').textContent.includes("approval"));
      await act(async () => [...container.querySelectorAll("a")].find((link) => link.textContent === "Back to sign in").click());
    }
    await act(async () => { type(container.querySelector("#admin-email"), "admin@example.com"); type(container.querySelector("#admin-password"), "incorrect"); });
    await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    assert.ok(container.querySelector('[role="alert"]').textContent.includes("incorrect"));
    await act(async () => type(container.querySelector("#admin-password"), "correct-password"));
    await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => container.querySelector(".dashboard-table")?.textContent.includes(entry.name));
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
    if (technical) {
      for (const [label, heading] of [["Tour amounts & offers", "Tour amounts & offers"], ["Add hotel", "Hotel inventory"], ["Journey Voucher", "Journey Voucher"]]) {
        const tool = [...container.querySelectorAll(".dashboard-status-navigation button")].find((button) => button.textContent === label);
        assert.ok(tool, `${label} is present in the technical panel`);
        await act(async () => tool.click());
        assert.ok(container.querySelector("h1").textContent.includes(heading), `${label} opens its complete editor`);
        await act(async () => container.querySelector(".admin-tools-heading button").click());
        assert.ok(container.querySelector(".dashboard-table"), "returning from a technical tool restores enquiries");
      }
    }
    await act(async () => [...container.querySelectorAll(".dashboard-status-navigation button")].find((button) => button.textContent === "Panel accounts").click());
    await waitFor(() => container.querySelector('[name="accountEmail"]'));
    await act(async () => { type(container.querySelector('[name="accountEmail"]'), "technical@example.com"); type(container.querySelector('[name="accountPassword"]'), "TechnicalPassword9"); });
    await act(async () => container.querySelector(".admin-tool-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    assert.ok(container.textContent.includes("technical@example.com"));
    assert.equal(accounts[0].roles[0], "technical");
    await act(async () => [...container.querySelectorAll(".dashboard-status-navigation button")].find((button) => button.textContent === "Journey Voucher History").click());
    await waitFor(() => container.textContent.includes("History Guest"));
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "View voucher").click());
    assert.ok(container.querySelector(".journey-voucher-print").textContent.includes("EIV-HISTORY-TEST"));
    testWindow.confirm = () => true;
    await act(async () => [...container.querySelectorAll(".panel-record-row button")].find((button) => button.textContent === "Delete").click());
    await waitFor(() => container.textContent.includes("0 saved vouchers"));
    await act(async () => container.querySelector(".dashboard-sign-out-button").click());
    assert.ok(container.querySelector(".admin-login-form"));
    assert.equal(container.querySelector(".dashboard-table"), null, "logout removes guest information from the screen");
    await act(async () => root.render(createElement(MemoryRouter, { key: "reset-link", initialEntries: [`${basePath}/reset-password?token=${"a".repeat(64)}`] }, createElement(Admin, { technical }))));
    await waitFor(() => container.querySelector("#admin-confirm-password"));
    await act(async () => { type(container.querySelector("#admin-password"), "ResetPassword9"); type(container.querySelector("#admin-confirm-password"), "ResetPassword9"); });
    await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(JSON.parse(calls.find((call) => call.url === `/api${basePath}/reset-password`).options.body).token, "a".repeat(64), "session check preserves the token from a reset deep link");
    assert.equal(container.querySelector("#admin-confirm-password"), null, "password reset returns to sign in");
    console.log(`PASS ${technical ? "technical" : "admin"} login errors, authenticated inbox, full enquiry details, status update, search, and logout`);
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
