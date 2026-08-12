import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";

import { askQuestion, askViaProxy, fetchPortfolioEmbedConfig } from "../dist/ragportfolio-ask.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function captureFetch(response) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({url: String(url), init});
    return typeof response === "function" ? response(url, init) : response;
  };
  return calls;
}

const ANSWER = {answer: {text: "A grounded answer", mode: "llm", citations: [{path: "README.md", startLine: 4, endLine: 9}]}};

test("direct transport posts the single-use turnstile proof to the public endpoint", async () => {
  const calls = captureFetch(Response.json(ANSWER));
  const result = await askQuestion({transport: {mode: "direct", portfolioSlug: "sample-portfolio"}, question: "What did you build?", turnstileToken: "verified-token"});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://ragportfolio.com/api/public/portfolios/sample-portfolio/ask");
  assert.deepEqual(JSON.parse(calls[0].init.body), {question: "What did you build?", turnstileToken: "verified-token"});
  assert.equal(result.answer, "A grounded answer");
});

test("direct transport addresses an unlisted portfolio by token", async () => {
  const calls = captureFetch(Response.json(ANSWER));
  await askQuestion({transport: {mode: "direct", portfolioToken: "00000000-0000-0000-0000-000000000000"}, question: "What did you build?"});
  assert.equal(calls[0].url, "https://ragportfolio.com/api/public/portfolios/by-token/00000000-0000-0000-0000-000000000000/ask");
});

/*
 * The whole point of proxy mode is that the page holds nothing secret and proves nothing. Sending a
 * portfolio address would let a visitor rewrite it, and sending a Turnstile token would imply the
 * browser is the authenticated party when the site's backend is.
 */
test("proxy transport posts only the question and never a portfolio address or challenge", async () => {
  const calls = captureFetch(Response.json(ANSWER));
  const result = await askQuestion({transport: {mode: "proxy", endpoint: "/api/portfolio-ask"}, question: "What did you build?", turnstileToken: "should-not-be-sent"});
  assert.equal(calls.length, 1, "proxy mode must not load embed config");
  assert.equal(calls[0].url, "/api/portfolio-ask");
  assert.deepEqual(JSON.parse(calls[0].init.body), {question: "What did you build?"});
  const headerNames = [...new Headers(calls[0].init.headers).keys()];
  assert.equal(headerNames.includes("authorization"), false);
  assert.equal(result.answer, "A grounded answer");
  assert.deepEqual(result.citations, [{path: "README.md", startLine: 4, endLine: 9}]);
});

test("proxy transport rejects credential headers supplied from the browser", async () => {
  for (const header of ["Authorization", "authorization", "Proxy-Authorization", "Cookie", "X-Api-Key"]) {
    await assert.rejects(
      () => askQuestion({transport: {mode: "proxy", endpoint: "/api/portfolio-ask", headers: {[header]: "Bearer rpask_leaked"}}, question: "hi"}),
      /cannot be set from the browser/u,
      `${header} must be refused`
    );
  }
});

/* A relative endpoint cannot send the visitor's question to a third party; an absolute one can. */
test("proxy transport requires an explicit opt-in for a cross-origin endpoint", async () => {
  await assert.rejects(() => askQuestion({transport: {mode: "proxy", endpoint: "https://example.com/ask"}, question: "hi"}), /allowAbsoluteEndpoint/u);
  await assert.rejects(() => askQuestion({transport: {mode: "proxy", endpoint: "http://example.com/ask", allowAbsoluteEndpoint: true}, question: "hi"}), /must use https/u);
  await assert.rejects(() => askQuestion({transport: {mode: "proxy", endpoint: "api/portfolio-ask"}, question: "hi"}), /absolute path/u);
  const calls = captureFetch(Response.json(ANSWER));
  await askQuestion({transport: {mode: "proxy", endpoint: "https://example.com/ask", allowAbsoluteEndpoint: true}, question: "hi"});
  assert.equal(calls[0].url, "https://example.com/ask");
});

test("mutually exclusive targets are refused", async () => {
  await assert.rejects(() => askQuestion({transport: {mode: "direct", portfolioSlug: "a", portfolioToken: "b"}, question: "hi"}), /not both/u);
  await assert.rejects(() => askQuestion({transport: {mode: "direct"}, question: "hi"}), /requires a portfolioSlug or a portfolioToken/u);
  await assert.rejects(() => askQuestion({transport: {mode: "proxy", endpoint: "/ask"}, portfolioSlug: "a", question: "hi"}), /not both/u);
});

/* An answer must be shaped and bounded identically however it arrived. */
test("both transports normalize the answer and drop malformed citations", async () => {
  // A fresh Response per call: a body can only be read once, and both transports read it.
  captureFetch(() => Response.json({answer: {text: "Answer", mode: "extractive", citations: [{path: "a.md", startLine: 1, endLine: 2}, {path: "bad"}, null]}}));
  const direct = await askQuestion({transport: {mode: "direct", portfolioSlug: "p"}, question: "q"});
  const proxy = await askViaProxy({endpoint: "/api/portfolio-ask", question: "q"});
  for (const result of [direct, proxy]) {
    assert.equal(result.mode, "extractive");
    assert.deepEqual(result.citations, [{path: "a.md", startLine: 1, endLine: 2}]);
  }
});

test("an unexpected proxy response is refused rather than rendered", async () => {
  captureFetch(Response.json({unexpected: true}));
  await assert.rejects(() => askViaProxy({endpoint: "/api/portfolio-ask", question: "q"}), /unexpected response/u);
});

/* A visitor must not be shown an upstream body, which can carry request ids and internal codes. */
test("proxy errors are bounded and do not expose arbitrary backend bodies", async () => {
  const longBody = "x".repeat(5000);
  captureFetch(new Response(JSON.stringify({error: {message: longBody}}), {status: 500, headers: {"content-type": "application/json"}}));
  await assert.rejects(() => askViaProxy({endpoint: "/api/portfolio-ask", question: "q"}), (error) => {
    assert.ok(error.message.length <= 284, `error message was ${error.message.length} characters`);
    return true;
  });
});

test("embed config is only ever requested for a direct address", async () => {
  const calls = captureFetch(Response.json({embed: {showCitations: true, turnstileAction: "portfolio_ask", turnstileCData: "slug_p", turnstileSiteKey: "site"}}));
  await fetchPortfolioEmbedConfig({portfolioSlug: "p"});
  assert.equal(calls[0].url, "https://ragportfolio.com/api/public/portfolios/p/embed-config");
  await assert.rejects(() => fetchPortfolioEmbedConfig({}), /portfolioSlug or portfolioToken/u);
});

/*
 * The acceptance gate: a copied component cannot reveal a customer's API token because no browser
 * artifact contains anything that accepts one.
 */
test("the browser bundle contains no server helper and no api token surface", () => {
  for (const file of ["dist/ragportfolio-ask.js", "dist/ragportfolio-ask.umd.cjs"]) {
    const bundle = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal(bundle.includes("askPortfolio"), false, `${file} must not contain the server helper`);
    assert.equal(bundle.includes("integrations/portfolio-ask"), false, `${file} must not reference the server-token endpoint`);
    assert.equal(/\bapiToken\b/u.test(bundle), false, `${file} must not contain an apiToken surface`);
  }
  const types = readFileSync(new URL("../dist/index.d.ts", import.meta.url), "utf8");
  assert.equal(/\bapiToken\b/u.test(types), false, "the browser types must not expose an apiToken prop");
});
