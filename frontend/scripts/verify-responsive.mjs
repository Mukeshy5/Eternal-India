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
  const cssFiles = ["index.css", "Comopents/Navbar.css", "Common/FloatingWhatsApp.css", "Common/festivals/PublicDecorations.css", "Common/AdminDashboard.css", "Common/UnifiedEnquiries.css", "Common/AdminTools.css", "Common/GmailVerification.css", "Common/staff/staff.css", "Common/staff/calendar.css", "Common/festivals/FestivalManagement.css", "Common/PaymentManagement.css", "Common/panel/PanelLayout.css", "responsive.css"];
  const css = cssFiles.map((path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8").replace(/@import\s+[^;]+;/g, "")).join("\n");
  const entries = ["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((status, index) => ({ _id: String(index), name: "Responsive test guest", email: "guest@example.com", reference: `TEST-${index}`, message: "Message with a long address guest@example.com", source: ["WEBSITE", "WHATSAPP", "GMAIL"][index % 3], status, receivedAt: "2026-11-01T10:00:00Z" }));
  const data = { enquiries: entries, total: 4, pages: 1, stats: { total: 4, NEW: 1, IN_PROGRESS: 1, RESOLVED: 1, CLOSED: 1 } };
  const admin = { email: "admin@example.com", canManageAccounts: true };
  const panel = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Layout, { admin, section: "enquiries" }, createElement(Dashboard, { data, loaded: true, page: 1, searchInput: "", status: "" }))));
  const home = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Navbar), createElement(Home), createElement(FloatingContact)));
  const luminance = (rgb) => {
    const colour = { white: "#ffffff", black: "#000000" }[rgb] || rgb;
    const values = /^#[a-f\d]{6}$/i.test(colour) ? colour.slice(1).match(/../g).map((n) => Number.parseInt(n, 16)) : colour.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    assert.equal(values?.length, 3, `resolved badge colour: ${rgb}`);
    const channels = values.map((n) => { n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  for (const width of [1920, 1440, 1366, 1024, 768, 430, 390, 375, 320]) {
    const win = new Window({ url: "http://localhost/", settings: { disableCSSFileLoading: true } });
    win.happyDOM.setViewport({ width, height: 900 });
    try {
      win.document.body.innerHTML = `<div id="root">${home}${panel}<div class="quote-section"><form class="enquiry-form"><div class="form-grid"><input></div></form></div><div class="travel-grid"></div><div class="panel-app"><div class="payment-admin-table"><table><tbody><tr><td data-label="Customer">Guest</td></tr></tbody></table></div><div class="admin-tool-grid"></div><div class="panel-account-form-grid"></div><div class="attendance-calendar-grid"></div></div></div>`;
      const style = win.document.createElement("style"); style.textContent = css; win.document.head.append(style);
      const element = (selector) => { const node = win.document.querySelector(selector); assert.ok(node, selector); return node; };
      const computed = (selector) => win.getComputedStyle(element(selector));
      assert.equal(element(".nav-plan-trip").closest("nav"), null);
      assert.notEqual(computed(".nav-plan-trip").display, "none", `${width}: navbar trip button remains visible`);
      assert.equal(element(".nav-plan-trip").getAttribute("href"), "/request-quote");
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
      if (width <= 640) {
        for (const selector of [".form-grid", ".travel-grid", ".admin-tool-grid"]) assert.equal(computed(selector).gridTemplateColumns, "minmax(0, 1fr)", `${width}: ${selector} stacks`);
        assert.equal(computed(".enquiry-form input").fontSize, "16px", `${width}: mobile input text avoids automatic zoom`);
        assert.equal(Number.parseFloat(computed(".payment-admin-table table").minWidth), 0);
        assert.equal(computed(".panel-menu-button").minHeight, "44px");
      }
      const sourceColours = new Set(), statusColours = new Set();
      for (const selector of [".enquiry-source-website", ".enquiry-source-whatsapp", ".enquiry-source-gmail", ".dashboard-status-new", ".dashboard-status-in_progress", ".dashboard-status-resolved", ".dashboard-status-closed"]) {
        const badge = computed(selector), foreground = luminance(badge.color), background = luminance(badge.backgroundColor);
        assert.ok((Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) >= 4.5, `${width}: ${selector} meets normal text contrast`);
        (selector.includes("source") ? sourceColours : statusColours).add(badge.backgroundColor);
      }
      assert.equal(sourceColours.size, 3); assert.equal(statusColours.size, 4);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const { createServer } = await import("vite"); const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" }); try { await verifyResponsive(vite); } finally { await vite.close(); } }
