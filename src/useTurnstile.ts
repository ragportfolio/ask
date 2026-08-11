import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      remove: (widgetId: string) => void;
      render: (
        container: HTMLElement,
        options: {
          action?: string;
          callback: (token: string) => void;
          cData?: string;
          "error-callback"?: (errorCode?: string | number) => void;
          "expired-callback"?: () => void;
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          "timeout-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let turnstileScriptPromise: Promise<void> | null = null;

export function useTurnstile(siteKey: string | null, action: string, cData?: string) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!siteKey || !container) {
      setError(null);
      setIsReady(false);
      setToken(null);
      return;
    }

    let isCancelled = false;
    container.innerHTML = "";
    setError(null);
    setIsReady(false);
    setToken(null);

    ensureTurnstileScript()
      .then(() => {
        if (isCancelled || !containerRef.current || !window.turnstile) return;

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          action,
          callback: (nextToken) => {
            setToken(nextToken);
            setError(null);
          },
          cData,
          "error-callback": (errorCode?: string | number) => {
            setToken(null);
            const normalizedCode = typeof errorCode === "string" || typeof errorCode === "number" ? String(errorCode) : null;
            setError(normalizedCode ? `Turnstile failed (${normalizedCode}).` : "Turnstile failed.");
          },
          "expired-callback": () => setToken(null),
          sitekey: siteKey,
          theme: "light",
          "timeout-callback": () => setToken(null)
        });
        setIsReady(true);
      })
      .catch(() => {
        if (!isCancelled) setError("Turnstile could not load.");
      });

    return () => {
      isCancelled = true;
      setToken(null);
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Turnstile can already be detached during page lifecycle changes.
        }
        widgetIdRef.current = null;
      }
      container.innerHTML = "";
    };
  }, [action, cData, renderNonce, siteKey]);

  return {
    containerRef,
    error,
    isReady,
    reset() {
      setToken(null);
      if (widgetIdRef.current && window.turnstile?.reset) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          widgetIdRef.current = null;
          setIsReady(false);
          setRenderNonce((value) => value + 1);
        }
      }
    },
    token
  };
}

function ensureTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), {once: true});
      existing.addEventListener("error", () => reject(new Error("turnstile_load_failed")), {once: true});
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), {once: true});
    script.addEventListener("error", () => reject(new Error("turnstile_load_failed")), {once: true});
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}
