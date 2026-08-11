# @ragportfolio/ask

Embeddable React Ask widget for a Ragportfolio portfolio or legacy `memory` backend.

Status on 2026-08-11: portfolio targeting, public transport, citations, and code-controlled visual
customization are merged. The `@ragportfolio/ask` package rename and pull-request build are local.
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

## Props

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
  Turnstile label.
- `className`, `style`: customize the widget root after `appearance` is applied.
- `inputClassName`, `inputStyle`: backwards-compatible input-only customization.
- `showCitations`: defaults to `true` for portfolio mode and `false` for legacy mode.
- `theme`: explicitly select `"light"` or `"dark"`; otherwise the widget follows a `.dark`
  ancestor.
- `onResult`: callback after a successful response.
- `onError`: callback after a failed response.

Legacy-only props:

- `sourceId`, `repoId`, `targetId`: optional legacy backend retrieval target.
- `topK`: optional legacy retrieval size.
- `turnstileSiteKey`: optional explicit public Cloudflare Turnstile site key. If omitted, the widget fetches it from `/app-config`.
- `turnstileAction`: defaults to the action from `/app-config`, then `ask`.
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

The production Worker allows anonymous cross-origin requests only for
`/api/public/portfolios/...`. It never enables credentialed wildcard CORS and does not permit a
third-party origin to turn an owner cookie into private portfolio access. The widget sends only the
question and the slug or unlisted token encoded in the URL; portfolio scope, publication version,
funding, limits, and retrieval settings remain server-authoritative.

Public portfolio request:

```http
POST /api/public/portfolios/ragportfolio/ask
Content-Type: application/json
X-Transaction-Id: <uuid>

{"question":"What did you build?"}
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
