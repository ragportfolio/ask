# @torency/ask-widget

Embeddable React Ask widget for an Archeo / `memory` backend.

## Install

```bash
npm install @torency/ask-widget
```

## Use

```tsx
import { AskWidget } from "@torency/ask-widget";
import "@torency/ask-widget/styles.css";

export function CasciiAsk() {
  return (
    <AskWidget
      backendUrl="https://chat.hjoncour.com"
      sourceId="project:cascii"
      labels={{
        title: "Ask about Cascii",
        inputPlaceholder: "Ask how Cascii works"
      }}
      inputStyle={{
        background: "#111827",
        borderColor: "#475569",
        color: "#ffffff"
      }}
    />
  );
}
```

## Props

- `backendUrl`: origin that exposes `/app-config` and `/ask`.
- `sourceId`, `repoId`, `targetId`: optional backend retrieval target.
- `topK`: optional retrieval size.
- `inputStyle`: React inline styles applied directly to the textarea.
- `inputClassName`: an additional class applied to the textarea for stylesheet-based customization.
- `turnstileSiteKey`: optional explicit public Cloudflare Turnstile site key. If omitted, the widget fetches it from `/app-config`.
- `turnstileAction`: defaults to the action from `/app-config`, then `ask`.
- `adminToken`: optional admin bypass for private/internal usage.
- `showCitations`: default `false`.
- `showStaleWarnings`: default `true`.
- `labels`: title, placeholder, empty state, send label, Turnstile label.
- `onResult`: callback after a successful response.
- `onError`: callback after a failed response.

## Backend Requirements

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
