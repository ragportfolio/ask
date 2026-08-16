# @ragportfolio/ask

Embeddable React Ask widget for a Ragportfolio portfolio or legacy `memory` backend.

Status on 2026-08-14: portfolio targeting, citations, code-controlled visual customization,
portfolio-bound Turnstile/origin protection, and dual browser-direct/server-proxy transport are
merged. The server-only `@ragportfolio/ask/server` helper and the backend API-token lifecycle are
implemented. Version `0.3.1` is published publicly on npm, renders direct-browser Turnstile with interaction-only appearance, and
keeps any exceptional interactive challenge out of the widget's document flow. Ragportfolio's
homepage consumes the package against its verified, public `ragportfolio` portfolio.
The framework-independent custom element and owner-facing embed builder are planned in
[`../docs/todo/feature/ASK_WIDGET.MD`](../docs/todo/feature/ASK_WIDGET.MD).

## Install

```bash
npm install @ragportfolio/ask
```

## Ask a public portfolio

```tsx
import { RagportfolioAsk } from "@ragportfolio/ask";
import "@ragportfolio/ask/styles.css";

export function PortfolioAsk() {
  return (
    <RagportfolioAsk
      portfolioSlug="ragportfolio"
      className="portfolio-ask"
      labels={{
        title: "Ask about my work",
        inputPlaceholder: "What would you like to know?"
      }}
      appearance={{
        accentColor: "#f59e0b",
        borderRadius: "12px",
        fontFamily: "ui-monospace, monospace",
        maxWidth: "680px"
      }}
    />
  );
}
```

`backendUrl` defaults to `https://ragportfolio.com` in portfolio mode and can be overridden for a
local or preview environment.

`AskWidget` remains an exported compatibility alias for existing React integrations. New code
should use `RagportfolioAsk`; its props type is exported as `RagportfolioAskProps`.

## Ask a semi-private portfolio

Use the unlisted share token, not the portfolio slug:

```tsx
<RagportfolioAsk portfolioToken="00000000-0000-0000-0000-000000000000" />
```

The token is included in browser source and network requests. Treat it as an observable share link,
not as an authentication credential. Private and unpublished portfolios cannot be embedded for
anonymous visitors.

## Transports

There are two ways to reach a portfolio, and they have deliberately different trust models.

**Browser direct** (default) needs no backend from you. The page calls Ragportfolio and proves itself
with a portfolio-bound Turnstile token; the request is accepted only from a verified origin.

```tsx
<RagportfolioAsk transport={{mode: "direct", portfolioSlug: "ragportfolio"}} />
```

**Server proxy** is for sites that already run a backend. The page calls *your* endpoint, and your
backend adds a Ragportfolio API token. No Turnstile is involved, because your backend is the
authenticated party rather than the visitor.

```tsx
<RagportfolioAsk transport={{mode: "proxy", endpoint: "/api/portfolio-ask"}} />
```

In proxy mode the component sends only `{"question":"..."}`. It loads no embed config, renders no
challenge, and sends no portfolio address — the address lives in your backend, so a visitor cannot
rewrite it to point somewhere else.

`portfolioSlug` and `portfolioToken` remain supported as shorthand for direct mode.

### The API token is a server credential

**Never put a Ragportfolio API token in the browser.** It resolves one portfolio scope and spends
that portfolio's allowance with no origin check and no challenge, so a token in page source lets any
visitor spend your allowance from anywhere.

There is no `apiToken`, `token`, or `secret` prop, and proxy mode refuses an `Authorization`,
`Proxy-Authorization`, `Cookie`, or `X-Api-Key` header supplied from the page rather than forwarding
it. A cross-origin proxy endpoint requires `allowAbsoluteEndpoint: true` and https, because a
relative path cannot send your visitors' questions to a third party and an absolute one can.

**Your proxy still needs its own abuse controls.** Ragportfolio authenticates your integration, not
the visitor behind it, so an unprotected endpoint is an open door to your portfolio's allowance no
matter how well the token is stored. Apply a rate limit or bot check of your own.

## Server helper

`@ragportfolio/ask/server` is a separate entry point, built as its own bundle and never re-exported
by the package root, so it cannot be pulled into a browser build.

### Next.js route handler

```ts
// app/api/portfolio-ask/route.ts
import { handlePortfolioAskRequest } from "@ragportfolio/ask/server";

export async function POST(request: Request) {
  // Apply your own visitor rate limit or bot check here.
  const result = await handlePortfolioAskRequest(await request.json().catch(() => null), {apiToken: process.env.RAGPORTFOLIO_API_TOKEN!});
  return Response.json(result.body, {status: result.status});
}
```

### Cloudflare Worker or Pages Function

```ts
// functions/api/portfolio-ask.ts
import { handlePortfolioAskRequest } from "@ragportfolio/ask/server";

export const onRequestPost: PagesFunction<{RAGPORTFOLIO_API_TOKEN: string}> = async (context) => {
  const result = await handlePortfolioAskRequest(await context.request.json().catch(() => null), {apiToken: context.env.RAGPORTFOLIO_API_TOKEN});
  return Response.json(result.body, {status: result.status});
};
```

Keep the token in the Worker's secret bindings. Do not put it in Vite values or any generated static
asset: anything the build inlines ends up readable in the page.

### Express

```ts
import express from "express";
import { handlePortfolioAskRequest } from "@ragportfolio/ask/server";

const app = express();
app.use(express.json({limit: "8kb"}));

app.post("/api/portfolio-ask", async (request, response) => {
  // Apply your own visitor rate limit or bot check here.
  const result = await handlePortfolioAskRequest(request.body, {apiToken: process.env.RAGPORTFOLIO_API_TOKEN!});
  response.status(result.status).json(result.body);
});
```

The helper caps a question at 500 characters, returns only an allowlisted `{answer}` or
`{error: {code, message}}` shape, and never forwards an upstream body or logs the Authorization
header. A rejected network call is reported as a bounded message, because the failure object can
carry the request that held the token.

### Token lifecycle

Create tokens from the portfolio's Publishing settings. The full token is shown **once** at creation;
afterwards only a hint is listed. To rotate: create a new token, update your website secret, then
revoke the old one.

## Opening message

The line shown in an empty thread, before the first question, has three sources. In order of
precedence:

1. `labels.empty` in the embedding site's code;
2. the portfolio owner's **Opening message**, saved in the Ragportfolio dashboard under Website Ask
   and delivered with the embed config in direct mode;
3. the component's own `DEFAULT_EMPTY_MESSAGE` ("Ask a question to get started.").

So an owner can rewrite the opening line for every embed of their portfolio without touching the
website's code, and a site that passes `labels.empty` keeps full control of what it renders.

```tsx
// Renders whatever the owner saved, or the default when they saved nothing.
<RagportfolioAsk portfolioSlug="ragportfolio" />

// Always renders this line, whatever the owner saved.
<RagportfolioAsk portfolioSlug="ragportfolio" labels={{empty: <p>Ask me about the Helios migration.</p>}} />
```

The owner's message is plain text, capped at 200 characters, and rendered as a React text child, so
it cannot inject markup into the host page. Proxy mode loads no embed config, so it uses
`labels.empty` or the default.

## Props

- `transport`: how the widget reaches the portfolio. Either `{mode: "direct", portfolioSlug}`,
  `{mode: "direct", portfolioToken}`, or `{mode: "proxy", endpoint}`. Mutually exclusive with the
  `portfolioSlug`/`portfolioToken` shorthand. See [Transports](#transports).
- `portfolioSlug`: public portfolio address. Mutually exclusive with `portfolioToken`.
- `portfolioToken`: semi-private share token. Mutually exclusive with `portfolioSlug`.
- `backendUrl`: optional Ragportfolio API origin; defaults to `https://ragportfolio.com` in
  portfolio mode. Required for the legacy `/app-config` and `/ask` mode.
- `id`: optional stable ID prefix for the widget and all of its rendered elements.
- `appearance`: typed high-level design tokens for colors, typography, dimensions, border, radius,
  spacing, and shadow.
- `classNames`: additional class names keyed by semantic slot.
- `styles`: React inline styles keyed by semantic slot.
- `labels`: title, placeholder, empty state, loading content, citations label, send label, and legacy
  Turnstile label. `labels.empty` overrides the owner's saved opening message; see
  [Opening message](#opening-message).
- `className`, `style`: customize the widget root after `appearance` is applied.
- `inputClassName`, `inputStyle`: backwards-compatible input-only customization.
- `showCitations`: may hide citations client-side. In portfolio mode the owner's server policy is
  authoritative and a host cannot reveal citations the public response omitted.
- `theme`: explicitly select `"light"` or `"dark"`; otherwise the widget follows a `.dark`
  ancestor.
- `onResult`: callback after a successful response.
- `onError`: callback after a failed response.
- `turnstileSiteKey`: optional explicit public Cloudflare Turnstile site key. Portfolio mode
  normally loads the correct key and portfolio-bound proof configuration automatically.
- `turnstileAction`: optional development/legacy override; portfolio production mode normally uses
  the server-provided `portfolio_ask` action.

Direct-browser mode requests `appearance: "interaction-only"`, so a Managed site key takes no
layout space during routine verification and may overlay a challenge only when Cloudflare requires
interaction. The first-party Ragportfolio production site key instead uses Cloudflare's Invisible
widget mode, which has no visual footprint at all. Widget mode belongs to the Cloudflare site key;
the component cannot turn a Managed key into an Invisible key.

Legacy-only props:

- `sourceId`, `repoId`, `targetId`: optional legacy backend retrieval target.
- `topK`: optional legacy retrieval size.
- `adminToken`: optional admin bypass for private/internal usage.
- `showStaleWarnings`: default `true`.

## Styling

The widget inherits the host application's font and automatically uses its dark
palette when rendered below a `.dark` ancestor. Dark mode can also be selected
directly with `theme="dark"`.

Override the bundled theme with a class and CSS custom properties:

```css
.portfolio-ask {
  --ragportfolio-ask-bg: #ffffff;
  --ragportfolio-ask-border: #d1d5db;
  --ragportfolio-ask-text: #111827;
  --ragportfolio-ask-muted: #6b7280;
  --ragportfolio-ask-user-bg: #374151;
  --ragportfolio-ask-user-text: #ffffff;
  --ragportfolio-ask-assistant-bg: #f3f4f6;
  --ragportfolio-ask-input-bg: #ffffff;
  --ragportfolio-ask-accent: #4b5563;
  --ragportfolio-ask-accent-text: #ffffff;
  --ragportfolio-ask-focus-ring: rgb(75 85 99 / 0.18);
  --ragportfolio-ask-error: #b42318;
  --ragportfolio-ask-warning-bg: #fff7ed;
  --ragportfolio-ask-warning-text: #9a3412;
  --ragportfolio-ask-radius: 8px;
  --ragportfolio-ask-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
```

The `appearance` prop is the typed equivalent for the main design tokens. Use `classNames` and
`styles` when an individual semantic slot needs a different treatment:

```tsx
<RagportfolioAsk
  portfolioSlug="ragportfolio"
  appearance={{background: "transparent", maxWidth: "100%", shadow: "none"}}
  classNames={{composer: "my-composer", response: "my-answer"}}
  styles={{send: {borderRadius: 999}, thread: {maxHeight: 480}}}
/>
```

Supported slot keys are `root`, `header`, `thread`, `empty`, `exchange`, `question`, `loading`,
`response`, `warning`, `answer`, `citations`, `composer`, `turnstile`, `error`, `form`, `input`, and
`send`. Bundled `ragportfolio-ask` BEM class names remain stable for stylesheet overrides.

## Backend Requirements

### Ragportfolio portfolio mode

The production contract allows anonymous browser access only from the Ragportfolio origin or an
exact website origin that the portfolio owner registered and verified. The Worker echoes that exact
origin, never `*`, never enables credentials for the embed route, and does not permit a third-party
origin to turn an owner cookie into private portfolio access.

Portfolio mode first loads `/embed-config`, renders Turnstile with the returned site key, action,
and portfolio-bound `cData`, then submits the resulting single-use token with the question. The
Worker verifies the token through Siteverify and checks the exact hostname, action, and `cData`
before creating query work or spending the portfolio allowance. The widget never receives the
Turnstile secret.

Public portfolio request:

```http
POST /api/public/portfolios/ragportfolio/ask
Content-Type: application/json
X-Transaction-Id: <uuid>

{"question":"What did you build?","turnstileToken":"<single-use-token>"}
```

The semi-private form is `/api/public/portfolios/by-token/{token}/ask`. Both return:

```json
{
  "answer": {
    "text": "...",
    "mode": "llm",
    "citations": [{"path": "README.md", "startLine": 10, "endLine": 18}]
  }
}
```

Owners configure this locally in the portfolio's **Website Ask** card:

1. Add the exact HTTPS website origin.
2. Serve the shown value at `/.well-known/ragportfolio-verification.txt` as `text/plain`.
3. Select **Verify**.
4. Install the component only after the domain is verified and the operator has provisioned that
   hostname on the production Turnstile widget.

App verification does not automatically edit Cloudflare's widget hostname list. The current global
site-key design needs Cloudflare's Enterprise-only Any Hostname mode plus the Worker's exact
Siteverify hostname check. A standard-plan alternative would need a separate widget-allocation and
secret-storage design because standard widgets have bounded hostname lists. See the
[hostname-management limits](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)
and [Any Hostname contract](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/any-hostname/).

### Legacy mode

The backend or auth worker must allow the embedding site origin in CORS. For `cascii.com`, add that origin to the worker/backend allowlist.

If public users are protected by Turnstile, the Turnstile site key must allow the embedding domain, for example `cascii.com`.

The site key is public and may be passed to the component. Never pass or expose the Turnstile secret key in browser code. The secret key remains on the worker/backend and is used for Siteverify.

```tsx
<AskWidget
  backendUrl="https://auth.torency.com"
  turnstileSiteKey="0x4..."
/>
```

Normally, passing `turnstileSiteKey` is unnecessary because the widget loads the public key and expected action from `GET /app-config`.

The widget sends:

```http
POST /ask
Content-Type: application/json
X-Transaction-Id: <uuid>
```

with a body like:

```json
{
  "question": "What is Cascii?",
  "sourceId": "project:cascii",
  "turnstileToken": "..."
}
```

and expects the current `memory` response shape:

```json
{
  "result": {
    "answer": "...",
    "citations": [],
    "hits": [],
    "mode": "llm",
    "question": "...",
    "repoId": "project:cascii",
    "staleRepos": []
  }
}
```
