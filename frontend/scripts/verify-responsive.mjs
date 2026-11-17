import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createElement, act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";

// CSS/DOM regression checks, not a replacement for browser layout or device QA.
export async function verifyResponsive(vite) {
  const { default: Navbar } = await vite.ssrLoadModule("/src/Comopents/Navbar.jsx");
  const { default: Home } = await vite.ssrLoadModule("/src/Comopents/Home.jsx");
  const { default: FloatingContact } = await vite.ssrLoadModule("/src/Common/FloatingWhatsApp.jsx");
  const { default: Dashboard } = await vite.ssrLoadModule("/src/Common/AdminDashboard.jsx");
  const { default: Layout } = await vite.ssrLoadModule("/src/Common/panel/PanelLayout.jsx");
  const cssFiles = ["index.css", "Comopents/Navbar.css", "Common/FloatingWhatsApp.css", "Common/festivals/PublicDecorations.css", "Common/AdminDashboard.css", "Common/UnifiedEnquiries.css", "Common/AdminTools.css", "Common/GmailVerification.css", "Common/staff/staff.css", "Common/staff/calendar.css", "Common/staff-portal/portal.css", "Common/invoices/Invoices.css", "Common/JourneyBilling.css", "Common/ActivityHistory.css", "Common/festivals/FestivalManagement.css", "Common/PaymentManagement.css", "Common/panel/PanelLayout.css", "responsive.css", "Common/panel/PanelTheme.css"];
  const css = cssFiles.map((path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8").replace(/@import\s+[^;]+;/g, "")).join("\n");
  const entries = ["NEW", "PENDING", "IN_PROGRESS", "FOLLOW_UP", "RESOLVED", "CANCELLED", "CLOSED"].map((status, index) => ({ _id: String(index), name: "Responsive test guest", email: "guest@example.com", reference: `TEST-${index}`, message: "Message with a long address guest@example.com", source: index < 3 ? ["WEBSITE", "WHATSAPP", "GMAIL"][index] : "WEBSITE", ...(index === 3 ? { contactChannel: "email" } : index === 4 ? { enquiryKind: "CONTACT" } : index === 5 ? { enquiryKind: "PLAN_TRIP" } : {}), status, receivedAt: "2026-11-01T10:00:00Z" }));
  const data = { enquiries: entries, total: entries.length, pages: 1, stats: { total: entries.length, NEW: 1, IN_PROGRESS: 1, RESOLVED: 1, CLOSED: 1 } };
  const admin = { email: "admin@example.com", canManageAccounts: true };
  const panel = renderToStaticMarkup(createElement(MemoryRouter, null, createElement("div", { className: "admin-shell" }, createElement(Layout, { admin, section: "enquiries" }, createElement(Dashboard, { data, loaded: true, page: 1, searchInput: "", status: "" })))));
  const home = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Navbar), createElement(Home), createElement(FloatingContact)));
  const luminance = (rgb) => {
    const named = { white: "#ffffff", black: "#000000" }[rgb] || rgb;
    const colour = /^#[a-f\d]{3,4}$/i.test(named) ? `#${[...named.slice(1)].map((digit) => digit + digit).join("")}` : named;
    const values = /^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(colour) ? colour.slice(1).match(/../g).map((n) => Number.parseInt(n, 16)) : colour.match(/[\d.]+/g)?.map(Number);
    assert.ok(values?.length >= 3, `resolved theme colour: ${rgb}`);
    // Translucent chrome sits above the light workspace surface.
    const alpha = values.length === 4 ? values[3] / (colour.startsWith("#") ? 255 : 1) : 1;
    const channels = values.slice(0, 3).map((n) => { n = (n * alpha + 255 * (1 - alpha)) / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  for (const width of [1920, 1440, 1366, 1024, 768, 430, 390, 375, 320]) {
    const win = new Window({ url: "http://localhost/", settings: { disableCSSFileLoading: true } });
    win.happyDOM.setViewport({ width, height: 900 });
    try {
      win.document.body.innerHTML = `<div id="root">${home}${panel}<div class="quote-section"><form class="enquiry-form"><div class="form-grid"><input></div></form></div><div class="travel-grid"></div><div class="panel-app"><div class="payment-admin-table"><table><tbody><tr><td data-label="Customer">Guest</td></tr></tbody></table></div><div class="admin-tool-grid"></div><div class="panel-account-form-grid"></div><div class="attendance-calendar-grid"></div></div><section class="admin-shell staff-shell"><section class="staff-portal"><header class="staff-page-heading"><h1>Staff workspace</h1></header><section class="staff-surface"><form class="staff-fields"><label>Search<input type="search"></label><label>Filter<select><option>All</option></select></label><button>Search</button></form><div class="staff-table-wrap"><table><thead><tr><th>Activity</th></tr></thead><tbody><tr><td data-label="Activity">Updated record</td></tr></tbody></table></div></section><section class="activity-history"><section class="activity-history-card"><div class="activity-history-data"><section><pre>Activity data</pre></section></div></section></section><div class="staff-notification-menu"><section class="staff-notification-dropdown">Notifications</section></div></section></section><div class="invoice-workspace"><div class="invoice-table-wrap"><table class="invoice-table"><thead><tr><th>Invoice</th></tr></thead><tbody><tr><th scope="row" data-label="Invoice number">INV-1</th><td data-label="Actions">Actions</td></tr></tbody></table></div></div><div class="billing-workspace"><div class="billing-table-wrap"><table class="billing-table"><thead><tr><th>Voucher</th></tr></thead><tbody><tr><th scope="row" data-label="Invoice number">#1</th><td data-label="Actions">Actions</td></tr></tbody></table></div></div></div>`;
      const style = win.document.createElement("style"); style.textContent = css; win.document.head.append(style);
      const specimens = win.document.createElement("section");
      specimens.className = "panel-theme-specimens";
      specimens.innerHTML = `<div class="admin-tools"><section class="admin-tool-card"><h2>Operations</h2><label class="admin-tool-field">Guest name<input value="Sample guest"></label><button class="dashboard-button dashboard-button-primary">Save changes</button><button class="dashboard-button dashboard-button-danger">Remove</button></section><div class="payment-statistics"><article><span>Payments</span><strong>₹24,000</strong></article></div><div class="payment-admin-table"><table><thead><tr><th>Amount</th></tr></thead><tbody><tr><td><span class="payment-status-badge payment-badge-paid">Paid</span></td></tr></tbody></table></div><section class="staff-person"><h2>Staff profile</h2><span class="staff-badge staff-badge-leave">Leave</span></section><button class="attendance-cell attendance-color-present">P</button><section class="attendance-calendar"><h2>Attendance</h2></section><article class="festival-effect-card"><div class="festival-effect-art"><strong>Celebration</strong></div></article><div class="promotion-toggle">Offer settings</div><section class="technical-profile-card admin-tool-card">Profile &amp; security</section></div><section class="notification-center"><h1>Notifications</h1><div class="notification-list"><article class="notification-card is-unread"><strong>New enquiry</strong></article></div></section><div class="enquiry-notification-dropdown"><strong class="notification-category">Workspace update</strong><button class="notification-enable-sound">Enable sound</button></div><div class="enquiry-toasts"><article><strong>Enquiry received</strong></article></div><p class="admin-error">Please check your details.</p><p class="admin-success">Saved successfully.</p>`;
      win.document.querySelector(".admin-shell .panel-page").append(specimens);
      const login = win.document.createElement("section");
      login.className = "admin-login-layout";
      login.innerHTML = '<div class="admin-login-story"><h1>One workspace.</h1><p>Welcome to your team.</p></div><form class="admin-login-form"><label>Email<input></label><button class="button">Sign in</button></form>';
      win.document.querySelector(".admin-shell").append(login);
      const staffLogin = win.document.createElement("section");
      staffLogin.className = "admin-page staff-login";
      staffLogin.innerHTML = '<header class="admin-header"><a><img width="183"></a><a>View website</a></header><div class="admin-login-layout"><div class="admin-login-story"><h1>Staff access</h1></div><form class="admin-login-form"><label>Username<input></label><button class="admin-login-button">Sign in</button></form></div>';
      win.document.body.append(staffLogin);
      const element = (selector) => { const node = win.document.querySelector(selector); assert.ok(node, selector); return node; };
      const computed = (selector) => win.getComputedStyle(element(selector));
      assert.equal(element(".nav-plan-trip").closest("nav"), null);
      assert.notEqual(computed(".nav-plan-trip").display, "none", `${width}: navbar trip button remains visible`);
      assert.equal(element(".nav-plan-trip").getAttribute("href"), "/request-quote");
      const availablePlaces = element(".available-places-section");
      assert.equal(win.document.querySelectorAll(".available-places-section").length, 1);
      assert.equal(availablePlaces.previousElementSibling.classList.contains("home-hero"), true, `${width}: available places follows the hero`);
      assert.ok(availablePlaces.textContent.includes("Available places"));
      assert.ok(availablePlaces.textContent.includes("Follow your curiosity."));
      assert.ok(availablePlaces.textContent.includes("Find your next journey."));
      const companyIntro = element(".home-company-intro");
      assert.equal(companyIntro.previousElementSibling, availablePlaces, `${width}: company introduction follows available places`);
      assert.ok(companyIntro.textContent.includes("a decade of dedicated services to tourism"));
      assert.equal(companyIntro.querySelector('a[href="/about"]').textContent.trim(), "More view", `${width}: More view opens About Us`);
      assert.equal(computed(".home-company-intro .container").flexDirection, width <= 900 ? "column" : "row", `${width}: company introduction adapts to mobile`);
      const directions = element(".home-regions");
      assert.equal(win.document.querySelectorAll(".home-regions").length, 1);
      assert.equal(directions.previousElementSibling, companyIntro, `${width}: direction choices follow the company introduction`);
      assert.ok(directions.textContent.includes("Choose your direction"));
      assert.ok(directions.textContent.includes("Start anywhere."));
      assert.ok(directions.textContent.includes("Go deeper."));
      assert.equal(win.document.querySelector(".home-plan-float"), null, `${width}: homepage has no floating Plan Your Trip button`);
      assert.equal(element(".whatsapp-float").getAttribute("href"), "https://wa.me/919319140846");
      assert.equal(computed(".floating-contact-links").position, "fixed");
      assert.equal(computed(".menu-button").display, width <= 1200 ? "block" : "none");
      element(".navigation").classList.add("navigation-open");
      assert.equal(win.document.querySelector(".home-plan-float"), null);
      element(".navigation").classList.remove("navigation-open");
      assert.equal(computed(".home-hero-photo").position, width <= 900 ? "relative" : "absolute");
      assert.equal(computed(".dashboard-desktop-list").display, width <= 800 ? "none" : "block");
      const scrolling = computed(".attendance-calendar-grid");
      assert.equal(scrolling.overflowX || scrolling.overflow, "auto", `${width}: report tables contain their own scrolling`);
      assert.equal(computed(".staff-table-wrap").overflow, width <= 1200 ? "visible" : "auto", `${width}: Staff tables fit the page on mobile`);
      assert.equal(width <= 1200 ? computed(".invoice-table-wrap").overflow : computed(".invoice-table-wrap").overflowX, width <= 1200 ? "visible" : "auto", `${width}: invoice history fits its panel`);
      assert.equal(width <= 1600 ? computed(".billing-table-wrap").overflow : computed(".billing-table-wrap").overflowX, width <= 1600 ? "visible" : "auto", `${width}: voucher history fits its panel`);
      if (width <= 1200) {
        assert.equal(computed(".staff-table-wrap tbody tr").display, "grid", `${width}: Staff tables become readable cards`);
        assert.equal(computed(".invoice-table tbody tr").display, "grid", `${width}: invoice rows become readable cards`);
        assert.equal(parseFloat(computed(".invoice-table").minWidth), 0);
      }
      if (width <= 1600) {
        assert.equal(computed(".billing-table tbody tr").display, "grid", `${width}: voucher rows become readable cards`);
        assert.equal(parseFloat(computed(".billing-table").minWidth), 0);
      }
      assert.equal(computed(".staff-notification-dropdown").position, "absolute", `${width}: Staff notification menu remains anchored`);
      if (width <= 760) {
        assert.equal(win.matchMedia("(max-width: 760px)").matches, true, `${width}: Staff login breakpoint matches`);
        assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.staff-login \.admin-login-layout\s*\{\s*grid-template-columns:\s*1fr;/, `${width}: Staff login stacks on small screens`);
      }
      if (width <= 640) {
        for (const selector of [".form-grid", ".travel-grid", ".admin-tool-grid"]) assert.equal(computed(selector).gridTemplateColumns, "minmax(0, 1fr)", `${width}: ${selector} stacks`);
        assert.equal(computed(".enquiry-form input").fontSize, "16px", `${width}: mobile input text avoids automatic zoom`);
        assert.equal(computed(".staff-portal input").fontSize, "16px", `${width}: Staff inputs avoid automatic zoom`);
        assert.equal(Number.parseFloat(computed(".payment-admin-table table").minWidth), 0);
        assert.equal(computed(".panel-menu-button").minHeight, "44px");
      }
      const sourceColours = new Set(), statusColours = new Set();
      for (const selector of [".enquiry-source-website", ".enquiry-source-whatsapp", ".enquiry-source-gmail", ".dashboard-status-new", ".dashboard-status-pending", ".dashboard-status-in_progress", ".dashboard-status-follow_up", ".dashboard-status-resolved", ".dashboard-status-cancelled", ".dashboard-status-closed"]) {
        const badge = computed(selector), foreground = luminance(badge.color), background = luminance(badge.backgroundColor);
        assert.ok((Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) >= 4.5, `${width}: ${selector} meets normal text contrast`);
        (selector.includes("source") ? sourceColours : statusColours).add(badge.backgroundColor);
      }
      assert.equal(sourceColours.size, 3); assert.equal(statusColours.size, 7);
      for (const selector of [".panel-sidebar", ".panel-topbar", ".dashboard-inbox", ".dashboard-stat-total", ".dashboard-button-primary", ".dashboard-button-danger", ".admin-tool-card", ".admin-tool-field input", ".payment-statistics article", ".payment-badge-paid", ".staff-person", ".staff-badge-leave", ".attendance-calendar", ".attendance-color-present", ".festival-effect-art", ".promotion-toggle", ".technical-profile-card", ".notification-center", ".notification-center > .notification-list", ".enquiry-notification-dropdown", ".notification-enable-sound", ".enquiry-toasts article", ".admin-error", ".admin-success", ".admin-login-story", ".admin-login-form", ".admin-login-form .button"]) {
        const view = computed(selector);
        assert.ok(!["initial", "transparent", ""].includes(view.backgroundColor), `${width}: ${selector} has a resolved light background, got ${view.backgroundColor}`);
        const background = luminance(view.backgroundColor), foreground = luminance(view.color);
        assert.ok(background >= .78, `${width}: ${selector} retains a pastel/light surface (${view.backgroundColor})`);
        assert.ok((Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) >= 4.5, `${width}: ${selector} readable dark text (${view.color} on ${view.backgroundColor})`);
      }
      assert.equal(computed(".notification-center").colorScheme, "light");
      assert.equal(computed(".enquiry-notification-dropdown").colorScheme, "light");
      if (width <= 680) assert.equal(computed('.enquiry-filter-row input[type="date"]').fontSize, "16px", "mobile date inputs avoid zoom");
    } finally { win.close(); }
  }

  // Exercise the same mobile drawer in both role-based workspaces.
  for (const technical of [false, true]) {
    const win = new Window({ url: "http://localhost/admin" }); win.happyDOM.setViewport({ width: 375, height: 812 });
    const previous = new Map();
    for (const [key, value] of Object.entries({ window: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
    const { createRoot } = await import("react-dom/client"); const host = win.document.createElement("div"); win.document.body.append(host); const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(MemoryRouter, null, createElement(Layout, { admin, technical, section: "enquiries", onNavigate: () => {} }))));
      const sidebar = host.querySelector("aside"), toggle = host.querySelector(".panel-menu-button");
      assert.ok(sidebar.hasAttribute("inert"), "closed offscreen drawer is excluded from keyboard navigation");
      await act(async () => toggle.click());
      assert.equal(win.document.body.style.overflow, "hidden");
      assert.equal(sidebar.getAttribute("aria-modal"), "true");
      assert.ok(host.querySelector(".panel-body").hasAttribute("inert"));
      const close = host.querySelector(".panel-drawer-close");
      assert.equal(win.document.activeElement, close);
      await act(async () => close.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
      assert.equal(win.document.activeElement, [...sidebar.querySelectorAll('a[href], button:not(:disabled)')].filter((node) => !node.classList.contains("panel-collapse-button")).at(-1));
      await act(async () => win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      assert.equal(toggle.getAttribute("aria-expanded"), "false");
      assert.equal(win.document.body.style.overflow, "");
      assert.equal(win.document.activeElement, toggle);
    } finally { await act(async () => root.unmount()); win.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
  }
  console.log("PASS CSS/DOM layouts at 1920/1440/1366/1024/768/430/390/375/320, visible trip shortcuts, badge contrast, contained tables, touch controls, and both mobile panel drawers");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const { createServer } = await import("vite"); const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" }); try { await verifyResponsive(vite); } finally { await vite.close(); } }
