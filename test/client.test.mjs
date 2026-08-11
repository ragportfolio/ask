import assert from "node:assert/strict";
import {afterEach, test} from "node:test";

import {askQuestion} from "../dist/ragportfolio-ask.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("asks a public portfolio by slug and normalizes the public response", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = {url, init};
    return Response.json({answer: {text: "A grounded answer", mode: "llm", citations: [{path: "README.md", startLine: 4, endLine: 9}]}});
  };

  const result = await askQuestion({portfolioSlug: " sample-portfolio ", question: "What did you build?"});

  assert.equal(captured.url, "https://ragportfolio.com/api/public/portfolios/sample-portfolio/ask");
  assert.equal(captured.init.method, "POST");
  assert.deepEqual(JSON.parse(captured.init.body), {question: "What did you build?"});
  assert.equal(result.answer, "A grounded answer");
  assert.deepEqual(result.citations, [{path: "README.md", startLine: 4, endLine: 9}]);
  assert.deepEqual(result.hits, []);
  assert.deepEqual(result.staleRepos, []);
});

test("asks a semi-private portfolio by token against an overridden origin", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = {url, init};
    return Response.json({answer: {text: "Token answer", mode: "extractive", citations: []}});
  };

  await askQuestion({backendUrl: "http://localhost:8787/", portfolioToken: "00000000-0000-0000-0000-000000000000", question: "Hello"});

  assert.equal(captured.url, "http://localhost:8787/api/public/portfolios/by-token/00000000-0000-0000-0000-000000000000/ask");
  assert.deepEqual(JSON.parse(captured.init.body), {question: "Hello"});
});

test("rejects ambiguous portfolio targeting before sending a request", async () => {
  globalThis.fetch = async () => {
    throw new Error("fetch should not run");
  };

  await assert.rejects(askQuestion({portfolioSlug: "public", portfolioToken: "unlisted", question: "Hello"}), /either portfolioSlug or portfolioToken/);
});

test("surfaces the bounded message from the Worker error envelope", async () => {
  globalThis.fetch = async () => Response.json({error: {code: "rate_limited", message: "Too many attempts. Please try again later."}}, {status: 429});

  await assert.rejects(askQuestion({portfolioSlug: "public", question: "Hello"}), /Too many attempts/);
});
