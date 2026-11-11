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
  let signedIn = false, backendAvailable = true;
  const accounts = [];
  let vouchers = [{ _id: "000000000000000000000002", voucherNumber: "EIV-HISTORY-TEST", billing: { name: "History Guest", visitingCardNo: "H-1" }, journey: { from: "Delhi", fromAddress: "Airport" }, stops: [{ name: "Jaipur", address: "Hotel", distanceKm: 280, duration: "2 nights", arrivalDate: "2026-11-01", departureDate: "2026-11-03", meals: [], hotel: { name: "Test Hotel", starRating: "3-Star", gst: 12, amount: 2000 } }], message: "Happy travels", createdAt: "2026-11-01T00:00:00Z" }];
  const entry = { _id: "000000000000000000000001", name: "Admin UI Guest", email: "guest@example.com", phone: "+91 9000000000", destination: "Jaipur", travellers: 2, date: "", message: "Family holiday\nHeritage and local food", voiceLanguage: "hi", reference: "EI-TEST-UI", status: "new", createdAt: "2026-11-05T08:00:00Z" };
  const response = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === `/api${basePath}/login`) {
      if (!backendAvailable) throw new TypeError("fetch failed");
      const body = JSON.parse(options.body);
      assert.equal(body.email, "admin@example.com");
      signedIn = body.password === "correct-password";
      return signedIn ? response({ admin: { id: "admin", email: body.email, canManageAccounts: true } }) : response({ message: "Email or password is incorrect." }, 401);
    }
    if (url === `/api${basePath}/register`) {
      const { email, password } = JSON.parse(options.body);
      const role = technical ? "technical" : "admin";
      accounts.push({ _id: `created-${accounts.length}`, email, roles: [role], status: "active", emailVerified: false, password });
      return response({ message: "Account created successfully. You can now sign in." }, 201);
    }
    if (url === `/api${basePath}/forgot-password`) return response({ message: "Password reset link sent." });
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
    if (technical) {
      assert.equal([...container.querySelectorAll("a")].some((link) => link.textContent === "Create account"), false, "Technical Panel has no self-registration option");
    } else {
      await act(async () => [...container.querySelectorAll("a")].find((link) => link.textContent === "Create account").click());
      assert.equal(container.querySelector(".gmail-verification"), null, "registration does not request Gmail OTP");
      assert.equal(container.querySelector(".admin-login-form button[type='submit']").disabled, false, "registration is available without OTP");
      await act(async () => { type(container.querySelector("#admin-email"), "admin.registration@gmail.com"); type(container.querySelector("#admin-password"), "RegistrationPassword9"); type(container.querySelector("#admin-confirm-password"), "RegistrationPassword9"); });
      await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
      await waitFor(() => container.querySelector(".admin-success")?.textContent.includes("Account created successfully"));
      const registrationCall = calls.find((call) => call.url === `/api${basePath}/register`);
      assert.ok(registrationCall, "Admin registration is submitted to its panel API");
      assert.equal(JSON.parse(registrationCall.options.body).password, "RegistrationPassword9");
      assert.equal(calls.some((call) => call.url.includes("/send-otp")), false, "registration does not call the OTP endpoint");
      assert.equal(accounts.at(-1).roles[0], "admin");
      await act(async () => [...container.querySelectorAll("a")].find((link) => link.textContent === "Back to sign in").click());
    }
    await act(async () => { type(container.querySelector("#admin-email"), "admin@example.com"); type(container.querySelector("#admin-password"), "incorrect"); });
    await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    assert.ok(container.querySelector('[role="alert"]').textContent.includes("incorrect"));
    await act(async () => type(container.querySelector("#admin-password"), "correct-password"));
    backendAvailable = false;
    await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => container.querySelector('[role="alert"]')?.textContent.includes("couldn't connect"));
    assert.equal(signedIn, false, "backend failure does not authenticate the user");
    assert.equal(container.querySelector(".dashboard-table"), null, "backend failure does not open a protected panel");
    backendAvailable = true;
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
      const securityLink = [...container.querySelectorAll(".dashboard-status-navigation button")].find((button) => button.textContent === "Profile & security");
      assert.ok(securityLink, "Technical Panel has profile and security settings");
      await act(async () => securityLink.click());
      await waitFor(() => container.querySelector('[name="securityEmail"]'));
      for (const field of ["currentPassword", "newPassword", "confirmNewPassword"]) assert.ok(container.querySelector(`[name="${field}"]`), `${field} is present in change-password form`);
      await act(async () => [...container.querySelectorAll(".dashboard-status-navigation button")].find((button) => button.textContent === "All enquiries").click());
      await waitFor(() => container.querySelector(".dashboard-table"));
      for (const [label, heading] of [["Tour amounts & offers", "Tour amounts & offers"], ["Add hotel", "Hotel inventory"], ["Journey Voucher", "Journey Voucher"]]) {
        const tool = [...container.querySelectorAll(".dashboard-status-navigation button")].find((button) => button.textContent === label);
        assert.ok(tool, `${label} is present in the technical panel`);
        await act(async () => tool.click());
        assert.ok(container.querySelector("h1").textContent.includes(heading), `${label} opens its complete editor`);
        await act(async () => container.querySelector(".admin-tools-heading button").click());
        assert.ok(container.querySelector(".dashboard-table"), "returning from a technical tool restores enquiries");
      }
    }
    const accountsLink = [...container.querySelectorAll(".dashboard-status-navigation button")].find((button) => button.textContent === "Panel accounts");
    if (technical) {
      assert.equal(accountsLink, undefined, "panel account administration is hidden from the Technical Panel");
    } else {
      assert.ok(accountsLink, "panel account administration is available in the Admin Panel");
      await act(async () => accountsLink.click());
      await waitFor(() => container.querySelector('[name="accountName"]'));
      await act(async () => { type(container.querySelector('[name="accountName"]'), "Technical User"); type(container.querySelector('[name="accountEmail"]'), 'technical.account@gmail.com'); type(container.querySelector('[name="accountUsername"]'), 'technical.user'); type(container.querySelector('[name="accountPassword"]'), 'TechnicalPassword9'); type(container.querySelector('[name="accountConfirmPassword"]'), 'TechnicalPassword9'); });
      assert.equal(container.querySelector('.admin-tool-form button[type="submit"]').disabled, false, 'admin-created Technical accounts do not require OTP');
      assert.equal(container.querySelector('.gmail-verification'), null);
    }
    testWindow.confirm = () => true;
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
