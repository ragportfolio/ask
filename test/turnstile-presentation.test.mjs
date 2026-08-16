import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("published widget keeps routine Turnstile verification out of the visible layout", async () => {
  const javascript = await readFile(new URL("../dist/ragportfolio-ask.js", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../dist/ragportfolio-ask.css", import.meta.url), "utf8");
  assert.match(javascript, /appearance:\s*["']interaction-only["']/u);
  assert.match(stylesheet, /\.ragportfolio-ask__turnstile\s*\{[^}]*position:\s*absolute/isu);
  assert.match(stylesheet, /\.ragportfolio-ask__turnstile-label\s*\{[^}]*clip:\s*rect\(0 0 0 0\)/isu);
});
