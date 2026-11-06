import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { readConfig } from "../../Backend/config/env.js";
import { connectDatabase } from "../../Backend/config/database.js";
import { ensureAdmin } from "../../Backend/lib/passwords.js";
import { createApp } from "../../Backend/app.js";
import { animationDefaults, decorationEffects, globalDecorationDefaults } from "../../shared/decorationCatalog.js";

export async function verifyFestivals(vite) {
  const config = { ...readConfig(), databaseName: `eternal_india_test_${randomUUID().replaceAll("-", "")}`, adminEmail: "festival-ui@example.com", adminPassword: "UIFestivalTestPassword9", technicalEmail: "" };
  const { client, db } = await connectDatabase(config); await ensureAdmin(db, config);
  const backend = createApp({ client, db, config, schedulerOptions: { clock: () => new Date("2026-12-24T18:30:00Z"), intervalMs: 0 } });
  await backend.decorationsReady;
  const server = backend.app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const testWindow = new Window({ url: "http://localhost/technical/login" });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const originalFetch = globalThis.fetch;
  let cookie = "";
  let activeResponses = 0;
  // Use real HTTP APIs and MongoDB. This adapter supplies the browser cookie jar Node fetch lacks.
  globalThis.fetch = async (url, options = {}) => {
    if (typeof url !== "string" || !url.startsWith("/api/")) return originalFetch(url, options);
    const reply = await originalFetch(base + url, { ...options, headers: { ...options.headers, Origin: "http://localhost:5173", ...(cookie ? { Cookie: cookie } : {}) } });
    if (reply.headers.get("set-cookie")) cookie = reply.headers.get("set-cookie").split(";")[0];
    if (url === "/api/public/festival-decorations/active") activeResponses++;
    return reply;
  };
  testWindow.confirm = () => true;
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div"); testWindow.document.body.append(container);
  const root = createRoot(container);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(check, label) {
    for (let attempt = 0; attempt < 150; attempt++) { let matched; await act(async () => { matched = await check(); if (!matched) await delay(20); }); if (matched) return; }
    assert.fail(`Timed out: ${label}. UI: ${container.textContent.slice(-1400)}`);
  }
  const type = (selector, value) => {
    const input = container.querySelector(selector); assert.ok(input, selector);
    Object.getOwnPropertyDescriptor(testWindow.HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new testWindow.Event("input", { bubbles: true })); input.dispatchEvent(new testWindow.Event("change", { bubbles: true }));
  };
  const button = (text, scope = container) => [...scope.querySelectorAll("button")].find((item) => item.textContent.trim() === text);
  async function click(text, scope) { let target; await waitFor(() => { target = button(text, scope); return target && !target.disabled && !target.closest("fieldset")?.disabled; }, `enabled button ${text}`); await act(async () => target.click()); }
  async function section(label) { let target; await waitFor(() => { target = [...container.querySelectorAll(".festival-navigation button")].find((item) => item.textContent.endsWith(label)); return target && !target.disabled; }, `enabled section ${label}`); await act(async () => target.click()); await waitFor(() => container.querySelector(".festival-section-top h2")?.textContent === label, `${label} selected`); }
  const decimalWorkaround = (form) => {
    // Happy DOM incorrectly tests decimal steps using raw floating-point remainder.
    for (const input of form.querySelectorAll('input[type="number"]')) if (Number(input.step) < 1) input.step = "any";
  };
  async function publicState() { let result; await act(async () => { result = await (await globalThis.fetch("/api/public/festival-decorations/active")).json(); }); return result; }
  async function configurePublic(patch) {
    await act(async () => {
      const current = await db.collection("festival_decorations").findOne({ _id: festival._id });
      const reply = await globalThis.fetch(`/api/technical/festivals/${festival._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...current, ...patch }) }); assert.equal(reply.status, 200);
      const publication = await globalThis.fetch(`/api/technical/festival-decorations/${festival._id}/publish`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: true }) }); assert.equal(publication.status, 200);
    });
  }
  let festival;
  try {
    const css = readFileSync(new URL("../src/Common/festivals/effects/effects.css", import.meta.url), "utf8");
    const general = await vite.ssrLoadModule("/src/Common/festivals/effects/GeneralEffects.jsx");
    const indian = await vite.ssrLoadModule("/src/Common/festivals/effects/IndianEffects.jsx");
    const occasions = await vite.ssrLoadModule("/src/Common/festivals/effects/OccasionEffects.jsx");
    const seen = new Set();
    for (const Component of Object.values({ ...general, ...indian, ...occasions })) {
      await act(async () => root.render(createElement(Component, { config: animationDefaults, density: 4 })));
      const field = container.querySelector(".fx-field"); assert.ok(field, "each independent effect renders");
      assert.equal(field.querySelectorAll(".fx-particle").length, 4);
      const effect = decorationEffects.find((item) => item.id === field.dataset.effect); assert.ok(effect);
      assert.ok(css.includes(`[data-motion=${effect.motion}]`), `${effect.id} has its own animation styles`); seen.add(effect.id);
    }
    assert.equal(seen.size, 36);
    const { default: Admin } = await vite.ssrLoadModule("/src/Pages/Admin.jsx");
    await act(async () => root.render(createElement(MemoryRouter, { key: "technical", initialEntries: ["/technical/login"] }, createElement(Admin, { technical: true }))));
    await waitFor(() => container.querySelector(".admin-login-form"), "technical login");
    await act(async () => { type("#admin-email", config.adminEmail); type("#admin-password", config.adminPassword); });
    await act(async () => container.querySelector(".admin-login-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => container.querySelector(".dashboard-table"), "real authenticated inbox");
    await click("Special Days & Festival Management");
    await waitFor(() => container.querySelector(".festival-stat-grid"), "festival dashboard from real APIs");
    assert.equal(container.querySelectorAll(".festival-navigation button").length, 8);
    assert.equal(container.querySelector(".festival-stat-totalEffects strong").textContent, "36");
    assert.equal(container.querySelector(".festival-stat-totalFestivals strong").textContent, "0");
    await section("Effects Library"); assert.equal(container.querySelectorAll(".festival-effect-card").length, 36);
    await click("Preview effect", container.querySelector(".festival-effect-card"));
    await waitFor(() => container.querySelector(".fx-field"), "lazy-loaded live effect preview");
    await click("Mobile"); assert.ok(container.querySelector(".festival-device-mobile"));
    await click("Stop preview"); assert.equal(container.querySelector(".decoration-layer"), null);
    await click("Start preview"); await waitFor(() => container.querySelector(".decoration-layer"), "preview restart");
    await act(async () => assert.equal(await db.collection("festival_decorations").countDocuments(), 0, "preview does not create or publish records"));
    await click("Cancel");
    await section("Festival Management");
    await act(async () => { type('[name="name"]', "UI Winter Celebration"); type('[name="greetingMessage"]', "A joyful winter journey"); });
    decimalWorkaround(container.querySelector(".festival-form"));
    await act(async () => container.querySelector(".festival-form").dispatchEvent(new testWindow.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(async () => { festival = await db.collection("festival_decorations").findOne({ name: "UI Winter Celebration" }); return festival && container.querySelector(".festival-record h3"); }, "festival creation and MongoDB persistence");
    assert.equal(festival.published, false);
    await click("Preview", container.querySelector(".festival-record"));
    await waitFor(() => container.querySelector(".festival-preview-controls"), "saved festival preview");
    decimalWorkaround(container.querySelector(".festival-preview-controls"));
    await click("Publish & activate");
    await waitFor(async () => (await db.collection("festival_decorations").findOne({ _id: festival._id }))?.published && !!container.querySelector(".admin-success"), "publish and activate real APIs");
    let publicResult = await publicState(); assert.equal(publicResult.decorations[0].name, festival.name);
    await section("Active Decorations"); await waitFor(() => container.querySelector(".festival-active-card"), "active decoration UI");
    await click("Deactivate immediately"); await waitFor(() => !container.querySelector(".festival-active-card"), "manual OFF");
    await section("Schedule Management");
    await act(async () => { type('[name="startDate"]', "2026-12-25"); type('[name="endDate"]', "2026-12-26"); container.querySelector('[name="recurringYearly"]').click(); });
    await click("Save schedule");
    await waitFor(async () => await db.collection("festival_schedules").countDocuments() === 1, "schedule saved through UI");
    publicResult = await publicState(); assert.equal(publicResult.decorations[0].source, "schedule");
    await section("Decoration History"); await waitFor(() => container.querySelector(".festival-history-list article"), "audit history");
    assert.ok(container.querySelector(".festival-history-list").textContent.includes(config.adminEmail));
    await section("Global Settings"); assert.ok(container.querySelector('[name="masterEnabled"]').checked);
    await click("Master OFF");
    await waitFor(async () => (await db.collection("decoration_settings").findOne({ _id: "global" }))?.enabled === false, "master OFF stored in MongoDB");
    assert.equal((await publicState()).decorations.length, 0);
    await waitFor(() => button("Turn decorations ON"), "master toggle refresh"); await click("Turn decorations ON");
    await waitFor(async () => (await db.collection("decoration_settings").findOne({ _id: "global" }))?.enabled === true, "master ON");
    const { default: App } = await vite.ssrLoadModule("/src/App.jsx");
    await act(async () => root.render(createElement(MemoryRouter, { key: "public-home", initialEntries: ["/"] }, createElement(App))));
    await waitFor(() => testWindow.document.querySelector('.public-decoration-host .fx-field'), "public active decoration fetched from backend");
    assert.ok(testWindow.document.querySelector(".decoration-greeting").textContent.includes("A joyful winter journey"));
    assert.equal(testWindow.document.querySelector(".public-decoration-host audio"), null, "music is not played or loaded without enabling it");
    await act(async () => button("Hide decoration", testWindow.document).click());
    assert.equal(testWindow.document.querySelector(".public-decoration-host .decoration-layer"), null);
    assert.ok(button("Show decoration", testWindow.document));
    assert.equal((await publicState()).decorations.length, 1, "visitor hide does not change permanent configuration");
    await configurePublic({ displayPosition: "homepage" });
    const responsesBeforeNavigation = activeResponses;
    await act(async () => root.render(createElement(MemoryRouter, { key: "public-contact", initialEntries: ["/contact"] }, createElement(App))));
    await waitFor(() => activeResponses > responsesBeforeNavigation, "homepage-only configuration fetched");
    assert.equal(testWindow.document.querySelector(".public-decoration-host"), null, "homepage-only decorations stay off other pages");
    for (const position of ["header", "footer"]) {
      await configurePublic({ displayPosition: position });
      await act(async () => root.render(createElement(MemoryRouter, { key: `public-${position}`, initialEntries: ["/contact"] }, createElement(App))));
      await waitFor(() => testWindow.document.querySelector(".public-decoration-host"), `${position} decoration portal`);
      assert.ok(testWindow.document.querySelector(".public-decoration-host").parentElement.classList.contains(`site-${position}`));
    }
    await configurePublic({ displayPosition: "website", musicEnabled: true, musicUrl: "https://example.com/festival-test.mp3" });
    await act(async () => { const reply = await globalThis.fetch("/api/technical/decoration-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...globalDecorationDefaults, musicEnabled: true }) }); assert.equal(reply.status, 200); });
    await act(async () => root.render(createElement(MemoryRouter, { key: "public-consent", initialEntries: ["/contact"] }, createElement(App))));
    await waitFor(() => testWindow.document.querySelector(".public-decoration-host audio"), "optional music control");
    const player = testWindow.document.querySelector(".public-decoration-host audio");
    assert.equal(player.autoplay, false); assert.equal(player.preload, "none"); assert.equal(player.paused, true);
    let playCount = 0; player.play = async () => { playCount++; };
    assert.equal(playCount, 0, "no playback before consent");
    await act(async () => button("Play festival music", testWindow.document).click()); assert.equal(playCount, 1, "music starts only after an explicit visitor click");
    const { default: Renderer } = await vite.ssrLoadModule("/src/Common/festivals/DecorationRenderer.jsx");
    const matchMedia = testWindow.matchMedia.bind(testWindow);
    testWindow.matchMedia = (query) => { const media = matchMedia(query); if (query === "(prefers-reduced-motion: reduce)") Object.defineProperty(media, "matches", { configurable: true, value: true }); return media; };
    await act(async () => root.render(createElement(Renderer, { decoration: { ...animationDefaults, selectedEffects: ["snowfall"], name: "Motion test" } })));
    assert.ok(container.querySelector(".decoration-reduced-motion"), "reduced motion is respected");
    // Hidden tabs pause all effect classes and timers; components clean up listeners on unmount.
    Object.defineProperty(testWindow.document, "hidden", { configurable: true, value: true });
    await act(async () => testWindow.document.dispatchEvent(new testWindow.Event("visibilitychange")));
    assert.ok(container.querySelector(".decoration-motion-paused"));
    const persisted = await db.collection("decoration_settings").findOne({ _id: "global" }); assert.equal(persisted.timezone, globalDecorationDefaults.timezone);
    console.log("PASS all 36 reusable effects, eight technical sections, real MongoDB/API login/create/publish/activate/schedule/history/settings, isolated device preview, public visitor hide, and hidden-tab pause");
  } finally {
    await act(async () => { root.unmount(); await delay(40); }); globalThis.fetch = originalFetch; testWindow.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    await backend.decorationScheduler.stop(); await new Promise((resolve) => server.close(resolve));
    if (!db.databaseName.startsWith("eternal_india_test_")) throw new Error("Refusing to remove a non-test database.");
    await db.dropDatabase(); await client.close();
  }
}
