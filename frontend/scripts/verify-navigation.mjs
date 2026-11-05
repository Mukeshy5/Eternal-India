import assert from "node:assert/strict";
import { act, createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import { destinations, tourPackages, indiaJourneys, indiaPath } from "../src/Common/travelCatalog.js";

export async function verifyNavigation(server) {
  const testWindow = new Window({ url: "http://localhost/" });
  const previous = new Map();
  for (const [key, value] of Object.entries({ window: testWindow, document: testWindow.document, navigator: testWindow.navigator, HTMLElement: testWindow.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const container = testWindow.document.createElement("div");
  testWindow.document.body.append(container);
  const root = createRoot(container);
  const pointer = (target, type, pointerType = "mouse", relatedTarget = null) => target.dispatchEvent(new testWindow.PointerEvent(type, { bubbles: true, pointerType, relatedTarget }));
  try {
    const { default: Navbar } = await server.ssrLoadModule("/src/Comopents/Navbar.jsx");
    await act(async () => root.render(createElement(MemoryRouter, null, createElement(Navbar))));
    const packages = container.querySelector('[aria-controls="package-navigation"]');
    const destinationMenu = container.querySelector('[aria-controls="destination-navigation"]');
    const indiaMenu = container.querySelector('[aria-controls="india-navigation"]');
    const indiaPanel = container.querySelector("#india-navigation");
    const indiaGroup = container.querySelector(".nav-group-india");
    const packagePanel = container.querySelector("#package-navigation");
    const destinationPanel = container.querySelector("#destination-navigation");
    const packageGroup = container.querySelector(".nav-group-packages");
    const destinationGroup = container.querySelector(".nav-group-destinations");
    assert.equal(packagePanel.hidden, true);
    assert.equal(destinationPanel.hidden, true);
    assert.equal(indiaPanel.hidden, true);

    await act(async () => packages.click());
    assert.equal(packagePanel.hidden, false);
    assert.equal(packages.getAttribute("aria-expanded"), "true");
    assert.equal(packagePanel.querySelectorAll("li a").length, tourPackages.length);
    await act(async () => packages.click());
    assert.equal(packagePanel.hidden, true);

    await act(async () => pointer(packageGroup, "pointerover"));
    assert.equal(packagePanel.hidden, false, "mouse hover opens the package menu");
    await act(async () => pointer(packageGroup, "pointerout", "mouse", testWindow.document.body));
    assert.equal(packagePanel.hidden, true, "mouse leave closes an unpinned menu");
    await act(async () => { pointer(packageGroup, "pointerover"); packages.click(); });
    assert.equal(packagePanel.hidden, false, "first click after hover keeps the menu open");
    await act(async () => pointer(packageGroup, "pointerout", "mouse", testWindow.document.body));
    assert.equal(packagePanel.hidden, false, "a clicked menu remains open");
    await act(async () => pointer(testWindow.document.body, "pointerdown"));
    assert.equal(packagePanel.hidden, true, "outside click closes the menu");

    await act(async () => pointer(destinationGroup, "pointerover"));
    assert.equal(destinationPanel.hidden, false);
    assert.equal(packagePanel.hidden, true);
    assert.equal(destinationPanel.querySelectorAll("li a").length, destinations.length);
    assert.equal(destinationPanel.querySelectorAll("section h2 a").length, 5);
    await act(async () => destinationMenu.click());
    await act(async () => destinationPanel.querySelector("li a").focus());
    await act(async () => testWindow.document.activeElement.dispatchEvent(new testWindow.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(destinationPanel.hidden, true);
    assert.equal(testWindow.document.activeElement, destinationMenu, "Escape restores trigger focus");

    await act(async () => destinationMenu.click());
    await act(async () => container.querySelector('nav > a[href="/contact"]').focus());
    assert.equal(destinationPanel.hidden, true, "moving focus out closes the disclosure");
    await act(async () => pointer(destinationGroup, "pointerover", "touch"));
    assert.equal(destinationPanel.hidden, true, "touch does not depend on hover");

    const mobileToggle = container.querySelector(".menu-button");
    await act(async () => mobileToggle.click());
    assert.equal(mobileToggle.getAttribute("aria-expanded"), "true");
    await act(async () => destinationMenu.click());
    assert.equal(destinationPanel.hidden, false, "tap opens destinations");
    await act(async () => destinationPanel.querySelector("li a").click());
    assert.equal(destinationPanel.hidden, true);
    assert.equal(mobileToggle.getAttribute("aria-expanded"), "false", "selecting a state closes mobile navigation");
    assert.ok(container.querySelector('a[href="/destinations-in-india/rajasthan"]').getAttribute("aria-current") === "page");
    await act(async () => pointer(indiaGroup, "pointerover"));
    assert.equal(indiaPanel.hidden, false, "India opens on mouse hover");
    assert.equal(indiaPanel.querySelectorAll("li a").length, 6);
    for (const item of indiaJourneys) assert.ok(indiaPanel.querySelector(`a[href="${indiaPath(item)}"]`), `${item.title}: India menu link`);
    await act(async () => indiaMenu.click());
    await act(async () => pointer(indiaGroup, "pointerout", "mouse", testWindow.document.body));
    assert.equal(indiaPanel.hidden, false, "India click after hover pins the menu");
    await act(async () => indiaMenu.click());
    assert.equal(indiaPanel.hidden, true, "second India click closes the menu");
    await act(async () => pointer(indiaGroup, "pointerover", "touch"));
    assert.equal(indiaPanel.hidden, true, "India touch does not rely on hover");
    await act(async () => mobileToggle.click());
    await act(async () => indiaMenu.click());
    await act(async () => indiaPanel.querySelector('a[href="/india/kathmandu-tour"]').click());
    assert.equal(indiaPanel.hidden, true);
    assert.equal(mobileToggle.getAttribute("aria-expanded"), "false", "India selection closes mobile navigation");
    assert.equal(container.querySelector('a[href="/india/kathmandu-tour"]').getAttribute("aria-current"), "page");
    await act(async () => {
      indiaMenu.focus();
      indiaMenu.dispatchEvent(new testWindow.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    await act(async () => { await new Promise((resolve) => testWindow.requestAnimationFrame(resolve)); });
    assert.equal(indiaPanel.hidden, false, "ArrowDown opens the India disclosure");
    assert.equal(testWindow.document.activeElement, indiaPanel.querySelector("a"), "ArrowDown focuses the first journey");
    await act(async () => testWindow.document.activeElement.dispatchEvent(new testWindow.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(indiaPanel.hidden, true);
    assert.equal(testWindow.document.activeElement, indiaMenu);
    console.log("PASS all three menus: hover, click/tap, click-after-hover, outside click, keyboard focus, Escape, and mobile selection");
  } finally {
    await act(async () => root.unmount());
    testWindow.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}
