import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { askPortfolio, handlePortfolioAskRequest, normalizeQuestion, PortfolioAskError } from "../dist/ragportfolio-ask-server.js";

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

const ANSWER = {answer: {text: "A grounded answer", mode: "llm", citations: [{path: "README.md", startLine: 1, endLine: 4}]}};

test("the server helper sends the api token to the integration endpoint", async () => {
  const calls = captureFetch(() => Response.json(ANSWER));
  const answer = await askPortfolio({apiToken: "rpask_abc_secret", question: "What did you build?"});
  assert.equal(calls[0].url, "https://ragportfolio.com/api/integrations/portfolio-ask");
  assert.equal(calls[0].init.headers.Authorization, "Bearer rpask_abc_secret");
  // The token resolves the portfolio scope, so no address may be sent alongside it.
  assert.deepEqual(JSON.parse(calls[0].init.body), {question: "What did you build?"});
  assert.equal(answer.text, "A grounded answer");
});

test("a question is validated before it can cost a network call", async () => {
  const calls = captureFetch(() => Response.json(ANSWER));
  assert.equal(normalizeQuestion("  spaced  "), "spaced");
  for (const invalid of ["", "   ", null, 42, "x".repeat(501)]) {
    assert.throws(() => normalizeQuestion(invalid), PortfolioAskError);
  }
  assert.equal(calls.length, 0);
});

test("a missing token fails without calling the endpoint", async () => {
  const calls = captureFetch(() => Response.json(ANSWER));
  await assert.rejects(() => askPortfolio({apiToken: "  ", question: "hi"}), /not configured/u);
  assert.equal(calls.length, 0);
});

/*
 * A visitor is shown a bounded message. The upstream body can carry request identifiers and internal
 * codes, and the failure object from a rejected fetch can carry the request — including its
 * Authorization header — so neither is ever forwarded.
 */
test("upstream failures map to bounded messages without forwarding the body", async () => {
  const cases = [[401, "unauthorized"], [402, "allowance_exhausted"], [404, "portfolio_unavailable"], [429, "rate_limited"], [500, "service_unavailable"]];
  for (const [status, code] of cases) {
    captureFetch(() => new Response(JSON.stringify({error: {message: "internal detail", requestId: "abc123"}}), {status, headers: {"content-type": "application/json"}}));
    await assert.rejects(() => askPortfolio({apiToken: "rpask_a_b", question: "hi"}), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.message.includes("internal detail"), false);
      assert.equal(error.message.includes("abc123"), false);
      return true;
    });
  }
});

test("a network failure never surfaces the request that carried the token", async () => {
  globalThis.fetch = async () => {
    throw new Error("connect ECONNREFUSED with Authorization: Bearer rpask_abc_secret");
  };
  await assert.rejects(() => askPortfolio({apiToken: "rpask_abc_secret", question: "hi"}), (error) => {
    assert.equal(error.message.includes("rpask_abc_secret"), false);
    assert.equal(error.code, "service_unavailable");
    return true;
  });
});

test("the request handler returns only the allowlisted answer or error shape", async () => {
  captureFetch(() => Response.json(ANSWER));
  const ok = await handlePortfolioAskRequest({question: "What did you build?"}, {apiToken: "rpask_a_b"});
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(ok.body), ["answer"]);
  assert.deepEqual(Object.keys(ok.body.answer).sort(), ["citations", "mode", "text"]);

  const invalid = await handlePortfolioAskRequest({question: ""}, {apiToken: "rpask_a_b"});
  assert.equal(invalid.status, 400);
  assert.deepEqual(Object.keys(invalid.body), ["error"]);
  assert.deepEqual(Object.keys(invalid.body.error).sort(), ["code", "message"]);

  const missingBody = await handlePortfolioAskRequest(null, {apiToken: "rpask_a_b"});
  assert.equal(missingBody.status, 400);
});

test("an unexpected upstream payload is refused rather than returned", async () => {
  captureFetch(() => Response.json({unexpected: true}));
  await assert.rejects(() => askPortfolio({apiToken: "rpask_a_b", question: "hi"}), /could not be answered/u);
});

/* The server entry must stay free of anything that would drag it toward a browser bundle. */
test("the server bundle pulls in no react or stylesheet", async () => {
  const { readFileSync } = await import("node:fs");
  const bundle = readFileSync(new URL("../dist/ragportfolio-ask-server.js", import.meta.url), "utf8");
  assert.equal(/from\s*["']react/u.test(bundle), false);
  assert.equal(bundle.includes("styles.css"), false);
});
