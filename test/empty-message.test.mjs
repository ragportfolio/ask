import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";

import {DEFAULT_EMPTY_MESSAGE, RagportfolioAsk} from "../dist/ragportfolio-ask.js";

/*
 * The owner's saved message arrives from `/embed-config` in an effect, which does not run during
 * server rendering, so these cases pin the two code-controlled ends of the precedence chain:
 * `labels.empty` wins over everything, and the built-in default renders when nothing else applies.
 * The owner message itself is covered by the embed-config normalization test and the Worker suite.
 */
test("an empty thread falls back to the widget's own opening message", () => {
  const markup = renderToStaticMarkup(createElement(RagportfolioAsk, {portfolioSlug: "sample-portfolio"}));
  assert.equal(markup.includes(DEFAULT_EMPTY_MESSAGE), true);
});

test("the host's labels.empty overrides whatever the portfolio owner saved", () => {
  const markup = renderToStaticMarkup(createElement(RagportfolioAsk, {portfolioSlug: "sample-portfolio", labels: {empty: "Ask me about the Helios migration."}}));
  assert.equal(markup.includes("Ask me about the Helios migration."), true);
  assert.equal(markup.includes(DEFAULT_EMPTY_MESSAGE), false);
});
