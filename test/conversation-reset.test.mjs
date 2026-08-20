import assert from "node:assert/strict";
import test from "node:test";
import {JSDOM} from "jsdom";
import {act, createElement} from "react";

import {RagportfolioAsk} from "../dist/ragportfolio-ask.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("reset clears the local transcript and starts another context-free request", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {url: "https://customer.example"});
  const originalFetch = globalThis.fetch;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const requests = [];
  let resetCount = 0;
  Object.defineProperty(globalThis, "document", {configurable: true, value: dom.window.document, writable: true});
  Object.defineProperty(globalThis, "navigator", {configurable: true, value: dom.window.navigator, writable: true});
  Object.defineProperty(globalThis, "window", {configurable: true, value: dom.window, writable: true});
  const {createRoot} = await import("react-dom/client");
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({answer: {text: `Answer ${requests.length}`, mode: "llm", citations: []}});
  };

  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(createElement(RagportfolioAsk, {id: "reset-fixture", initialQuestion: "First question", labels: {empty: "Opening message", resetLabel: "Clear this conversation"}, onReset: () => { resetCount += 1; }, transport: {mode: "proxy", endpoint: "/api/ask"}}));
    });

    await act(async () => {
      document.getElementById("reset-fixture-form")?.dispatchEvent(new dom.window.Event("submit", {bubbles: true, cancelable: true}));
      await Promise.resolve();
    });

    assert.equal(document.querySelectorAll("#reset-fixture article").length, 1);
    const reset = document.getElementById("reset-fixture-reset");
    assert.ok(reset instanceof dom.window.HTMLButtonElement);
    assert.equal(reset.getAttribute("aria-label"), "Clear this conversation");
    assert.equal(reset.type, "button");

    await act(async () => {
      reset.click();
    });

    assert.equal(document.querySelectorAll("#reset-fixture article").length, 0);
    assert.equal(document.getElementById("reset-fixture-empty")?.textContent, "Opening message");
    assert.equal(document.getElementById("reset-fixture-input")?.value, "");
    assert.equal(document.activeElement?.id, "reset-fixture-input");
    assert.equal(document.getElementById("reset-fixture-reset"), null);
    assert.equal(resetCount, 1);

    const input = document.getElementById("reset-fixture-input");
    assert.ok(input instanceof dom.window.HTMLTextAreaElement);
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")?.set;
      assert.ok(setValue);
      setValue.call(input, "Second question");
      input.dispatchEvent(new dom.window.Event("input", {bubbles: true}));
    });
    await act(async () => {
      document.getElementById("reset-fixture-form")?.dispatchEvent(new dom.window.Event("submit", {bubbles: true, cancelable: true}));
      await Promise.resolve();
    });

    assert.deepEqual(requests, [{question: "First question"}, {question: "Second question"}]);
    assert.equal(document.querySelectorAll("#reset-fixture article").length, 1);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    restoreGlobal("document", originalDocument);
    restoreGlobal("navigator", originalNavigator);
    restoreGlobal("window", originalWindow);
    dom.window.close();
  }
});

function restoreGlobal(name, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete globalThis[name];
}
