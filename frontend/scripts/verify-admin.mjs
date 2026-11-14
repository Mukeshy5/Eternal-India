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
  let gstRates = [];
  let vouchers = [{ _id: "000000000000000000000002", invoiceNumber: "10001", voucherDate: "2026-11-01", guestName: "History Guest", hotelId: "000000000000000000000012", gstId: "000000000000000000000013", hotel: { name: "Test Hotel", address: "Test address", amount: 2000 }, gst: { name: "Company GST", gstNumber: "07ABCDE1234F1Z5", rate: 18 }, pricing: { basePaise: 200000, gstPaise: 36000, totalPaise: 236000, gstRate: 18 }, checkInDate: "2026-12-01", checkOutDate: "2026-12-03", arrivalDate: "2026-12-01", arrivalPlace: "Delhi", departureDate: "2026-12-03", departurePlace: "Jaipur", requirement: "Saved requirement", status: "confirmed", revision: 1 }];
  const entry = { _id: "000000000000000000000001", name: "Admin UI Guest", email: "guest@example.com", phone: "+91 9000000000", destination: "Jaipur", travellers: 2, date: "", message: "Family holiday\nHeritage and local food", voiceLanguage: "hi", reference: "EI-TEST-UI", source: "WEBSITE", subject: "Trip enquiry ? Jaipur", status: "NEW", createdAt: "2026-11-05T08:00:00Z" };
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
    if (url === `/api${basePath}/gst`) {
      if (options.method === "POST") {
        const gstRate = { _id: `gst-${gstRates.length + 1}`, ...JSON.parse(options.body), version: 1 };
        gstRates.push(gstRate);
        return response({ gstRate }, 201);
      }
      return response({ gstRates });
    }
    if (url.startsWith(`/api${basePath}/gst/`)) {
      const id = url.split("/").at(-1);
      if (options.method === "PATCH") {
        gstRates = gstRates.map((gstRate) => gstRate._id === id ? { ...gstRate, ...JSON.parse(options.body) } : gstRate);
        return response({ gstRate: gstRates.find((gstRate) => gstRate._id === id) });
      }
      if (options.method === "DELETE") {
        gstRates = gstRates.filter((gstRate) => gstRate._id !== id);
        return response(null, 204);
      }
    }
    if (url === `/api${basePath}/vouchers/options`) return response({ hotels: [], gstRates: [], usedHotels: [], usedGst: [] });
    if (url === `/api${basePath}/vouchers/invoice`) return response({ invoice: { reservationId: "000000000000000000000002", invoiceNumber: "10002" } });
    if (url.startsWith(`/api${basePath}/vouchers?`)) return response({ vouchers, total: vouchers.length, page: 1, pages: 1, totalBillingPaise: vouchers.reduce((sum, v) => sum + v.pricing.totalPaise, 0) });
    if (url.startsWith(`/api${basePath}/vouchers/`) && options.method === "DELETE") { vouchers = []; return response(null, 204); }
    if (url.startsWith(`/api${basePath}/vouchers/`)) return response({ voucher: vouchers[0] });
    if (url === "/api/technical/promotions") return response({ targets: [], promotions: [] });
    if (url === "/api/technical/hotels") return response({ hotels: [{ _id: "hotel-1", name: "Test Hotel", address: "1 Test Road", starRating: "3-Star", amount: 2000 }] });
    if (url === `/api${basePath}/enquiry-notification-settings`) return response({ popup: true, sound: false, unread: 1 });
    if (url === `/api${basePath}/enquiry-summary`) return response({ unread: 1 });
    if (url === `/api${basePath}/enquiry-assignees`) return response({ assignees: [] });
    if (url === `/api${basePath}/enquiries/${entry._id}` && !options.method) return response({ enquiry: entry });
    if (options.method === "PATCH") { entry.status = JSON.parse(options.body).status; return response({ message: "Updated" }); }
    if (url.startsWith(`/api${basePath}/enquiries?`)) return response({ enquiries: [entry], total: 1, page: 1, pages: 1, stats: { total: 1, new: entry.status === "NEW" ? 1 : 0, contacted: entry.status === "IN_PROGRESS" ? 1 : 0, closed: 0 } });
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
    await waitFor(() => container.querySelector('[role="status"]')?.textContent.includes("reset link"));
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
    const gstLink = [...container.querySelectorAll(".dashboard-status-navigation button")].find((button) => button.textContent === "Add GST");
    assert.ok(gstLink, "GST management is available in both panels");
    await act(async () => gstLink.click());
    await waitFor(() => container.querySelector('input[name="gstNumber"]'));
    await act(async () => {
      type(container.querySelector('input[name="gstNumber"]'), "07ABCDE1234F1Z5");
    });
    await act(async () => container.querySelector(".admin-tool-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => container.querySelector(".admin-tool-table tbody tr"));
    assert.equal(container.querySelector('input[name="rate"]'), null); assert.equal(container.querySelector('input[name="name"]'), null);
    assert.ok(container.querySelector('.admin-success[role="status"]')?.textContent.includes("GST number added"), "successful GST creation is acknowledged");
    assert.ok(calls.some((call) => call.url === `/api${basePath}/gst` && call.options.method === "POST"), "GST rates can be added");
    await act(async () => [...container.querySelectorAll(".admin-tool-table button")].find((button) => button.textContent === "Edit").click());
    await act(async () => type(container.querySelector('input[name="gstNumber"]'), "29ABCDE1234F1Z5"));
    await act(async () => container.querySelector(".admin-tool-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => container.querySelector(".admin-tool-table tbody tr")?.textContent.includes("29ABCDE1234F1Z5"));
    assert.ok(container.querySelector('.admin-success[role="status"]')?.textContent.includes("GST number updated"), "successful GST edits are acknowledged");
    assert.ok(calls.some((call) => call.url.startsWith(`/api${basePath}/gst/`) && call.options.method === "PATCH"), "GST rates can be updated");
    testWindow.confirm = () => true;
    await act(async () => [...container.querySelectorAll(".admin-tool-table button")].find((button) => button.textContent === "Delete").click());
    await waitFor(() => container.querySelector(".admin-tool-empty"));
    assert.ok(calls.some((call) => call.url.startsWith(`/api${basePath}/gst/`) && call.options.method === "DELETE"), "GST rates can be deleted");
    await act(async () => [...container.querySelectorAll(".dashboard-status-navigation button")].find((button) => button.textContent === "All enquiries").click());
    await waitFor(() => container.querySelector(".dashboard-table"));
    await act(async () => container.querySelector(".dashboard-view").click());
    assert.ok(container.querySelector(".dashboard-drawer").textContent.includes(entry.message));
    assert.ok(container.querySelector(".dashboard-drawer").textContent.includes("Hindi"));
    await act(async () => container.querySelector('[aria-label="Close enquiry details"]').click());
    const status = container.querySelector(`#status-${entry._id}`);
    await act(async () => { status.value = "IN_PROGRESS"; status.dispatchEvent(new testWindow.Event("change", { bubbles: true })); });
    assert.ok(calls.some((call) => call.options.method === "PATCH" && JSON.parse(call.options.body).status === "IN_PROGRESS"));
    assert.equal(container.querySelector(`#status-${entry._id}`).value, "IN_PROGRESS");
    await act(async () => type(container.querySelector("#enquiry-search"), "Jaipur"));
    await act(async () => container.querySelector(".dashboard-search").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    assert.ok(calls.some((call) => call.url.includes("search=Jaipur")));
    const sort = container.querySelector('#enquiry-sort');
    await act(async () => { sort.value = 'oldest'; sort.dispatchEvent(new testWindow.Event('change', { bubbles: true })); });
    assert.ok(calls.some((call) => call.url.includes('sort=oldest') && call.url.includes('search=Jaipur')), 'sorting is requested from the shared backend and preserves the search');
    assert.equal(container.querySelector('#enquiry-sort').value, 'oldest');
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
        if (label === "Add hotel") {
          assert.equal(container.querySelector('.admin-tool-form input[name="address"]')?.required, true, "hotel address is required");
          assert.equal(container.querySelector('.admin-tool-form input[name="gst"]'), null, "hotel form no longer asks for GST");
          assert.ok(container.querySelector(".hotel-inventory-table td[data-label='Address']"), "saved hotel addresses have a mobile label");
          assert.ok(container.querySelector(".hotel-inventory-table td[data-label='Actions']"), "hotel actions remain labeled on mobile");
        }
        await act(async () => (label === "Journey Voucher" ? [...container.querySelectorAll(".dashboard-status-navigation button")].find((button) => button.textContent === "All enquiries") : container.querySelector(".admin-tools-heading button")).click());
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
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "View").click());
    assert.ok(container.querySelector(".billing-document").textContent.includes("10001"));
    testWindow.confirm = () => true;
    await act(async () => [...container.querySelectorAll(".billing-table button")].find((button) => button.textContent === "Delete").click());
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
