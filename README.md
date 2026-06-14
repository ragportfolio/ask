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
      className="portfolio-ask"
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
- `id`: optional stable ID prefix for the widget and all of its rendered elements.
- `sourceId`, `repoId`, `targetId`: optional backend retrieval target.
- `topK`: optional retrieval size.
- `inputClassName`: an additional class applied to the textarea for stylesheet-based customization.
- `turnstileSiteKey`: optional explicit public Cloudflare Turnstile site key. If omitted, the widget fetches it from `/app-config`.
- `turnstileAction`: defaults to the action from `/app-config`, then `ask`.
- `adminToken`: optional admin bypass for private/internal usage.
- `showCitations`: default `false`.
- `showStaleWarnings`: default `true`.
- `labels`: title, placeholder, empty state, send label, Turnstile label.
- `className`, `style`: customize the widget root.
- `inputClassName`: add a custom class to the question input.
- `inputStyle`: apply React inline styles to the question input.
- `theme`: explicitly select `"light"` or `"dark"`; otherwise the widget follows a `.dark` ancestor.
- `onResult`: callback after a successful response.
- `onError`: callback after a failed response.

## Styling

The widget inherits the host application's font and automatically uses its dark
palette when rendered below a `.dark` ancestor. Dark mode can also be selected
directly with `theme="dark"`.

Override the bundled theme with a class and CSS custom properties:

```css
.portfolio-ask {
  --torency-ask-bg: #ffffff;
  --torency-ask-border: #d1d5db;
  --torency-ask-text: #111827;
  --torency-ask-muted: #6b7280;
  --torency-ask-user-bg: #374151;
  --torency-ask-user-text: #ffffff;
  --torency-ask-assistant-bg: #f3f4f6;
  --torency-ask-input-bg: #ffffff;
  --torency-ask-accent: #4b5563;
  --torency-ask-accent-text: #ffffff;
  --torency-ask-focus-ring: rgb(75 85 99 / 0.18);
  --torency-ask-error: #b42318;
  --torency-ask-warning-bg: #fff7ed;
  --torency-ask-warning-text: #9a3412;
  --torency-ask-radius: 8px;
  --torency-ask-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
```

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
