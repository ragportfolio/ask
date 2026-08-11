import type { AppConfigPayload, AskRequestInput, AskResult, Citation, PortfolioEmbedConfig } from "./types";

const MAX_ERROR_MESSAGE_LENGTH = 280;

export async function fetchAppConfig(backendUrl: string): Promise<AppConfigPayload> {
  return requestJson<AppConfigPayload>(backendUrl, "/app-config");
}

export async function fetchPortfolioEmbedConfig(input: {backendUrl?: string; portfolioSlug?: string; portfolioToken?: string}): Promise<PortfolioEmbedConfig> {
  const portfolioSlug = input.portfolioSlug?.trim();
  const portfolioToken = input.portfolioToken?.trim();
  if (portfolioSlug && portfolioToken) throw new Error("Choose either portfolioSlug or portfolioToken, not both.");
  const address = portfolioToken ?? portfolioSlug;
  if (!address) throw new Error("Choose a portfolioSlug or portfolioToken.");
  const path = portfolioToken ? `/api/public/portfolios/by-token/${encodeURIComponent(address)}/embed-config` : `/api/public/portfolios/${encodeURIComponent(address)}/embed-config`;
  const payload = await requestJson<{embed: PortfolioEmbedConfig}>(input.backendUrl ?? "https://ragportfolio.com", path);
  return payload.embed;
}

export async function askQuestion(input: AskRequestInput): Promise<AskResult> {
  const headers = new Headers();
  headers.set("X-Transaction-Id", uuidv7());

  const body: Record<string, string | number> = {
    question: input.question
  };

  const portfolioSlug = input.portfolioSlug?.trim();
  const portfolioToken = input.portfolioToken?.trim();
  if (portfolioSlug && portfolioToken) throw new Error("Choose either portfolioSlug or portfolioToken, not both.");
  if (portfolioSlug || portfolioToken) {
    const address = portfolioToken ?? portfolioSlug;
    if (!address) throw new Error("Choose a portfolioSlug or portfolioToken.");
    const path = portfolioToken ? `/api/public/portfolios/by-token/${encodeURIComponent(address)}/ask` : `/api/public/portfolios/${encodeURIComponent(address)}/ask`;
    if (input.turnstileToken?.trim()) body.turnstileToken = input.turnstileToken.trim();
    const payload = await requestJson<{answer: {text: string; mode: "extractive" | "llm"; citations: Citation[]}}>(input.backendUrl ?? "https://ragportfolio.com", path, {method: "POST", headers, body: JSON.stringify(body)});
    return {repoId: "", question: input.question, answer: payload.answer.text, citations: payload.answer.citations, hits: [], mode: payload.answer.mode, staleRepos: []};
  }

  if (input.sourceId) body.sourceId = input.sourceId;
  if (input.repoId) {
    body.repoId = input.repoId;
    body.sourceId = input.sourceId ?? input.repoId;
  }
  if (input.targetId) body.targetId = input.targetId;
  if (typeof input.topK === "number") body.topK = input.topK;

  if (input.adminToken?.trim()) {
    headers.set("authorization", `Bearer ${input.adminToken.trim()}`);
  } else if (input.turnstileToken?.trim()) {
    body.turnstileToken = input.turnstileToken.trim();
  }

  const payload = await requestJson<{result: AskResult}>(requiredLegacyBackendUrl(input.backendUrl), "/ask", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  return payload.result;
}

function requiredLegacyBackendUrl(value: string | undefined): string {
  if (!value?.trim()) throw new Error("AskWidget requires backendUrl in legacy mode or a portfolioSlug/portfolioToken for Ragportfolio mode.");
  return value;
}

async function requestJson<T>(backendUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${normalizeBackendUrl(backendUrl)}${path}`, {
    ...init,
    headers
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(normalizeErrorMessage(payload, response.status));
  }

  return payload as T;
}

function normalizeBackendUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("AskWidget requires a backendUrl.");
  }
  return trimmed.replace(/\/+$/, "");
}

function normalizeErrorMessage(payload: unknown, status: number): string {
  let message = `Request failed with ${status}`;
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as {error?: unknown}).error;
    if (typeof error === "string" && error.trim()) {
      message = error.trim();
    } else if (error && typeof error === "object" && "message" in error && typeof (error as {message?: unknown}).message === "string" && (error as {message: string}).message.trim()) {
      message = (error as {message: string}).message.trim();
    }
  } else if (typeof payload === "string" && payload.trim()) {
    message = payload.trim();
  }

  return message.length > MAX_ERROR_MESSAGE_LENGTH ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...` : message;
}

function uuidv7(): string {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }

  const now = BigInt(Date.now());
  const rand = crypto.getRandomValues(new Uint8Array(10));
  const tsHigh32 = Number((now >> 16n) & 0xFFFFFFFFn);
  const tsLow16 = Number(now & 0xFFFFn);
  const ver = 0x7000 | ((rand[0]! & 0x0F) << 8) | rand[1]!;
  const variant = 0x8000 | ((rand[2]! & 0x3F) << 8) | rand[3]!;
  const tail = Array.from(rand.subarray(4)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return [
    tsHigh32.toString(16).padStart(8, "0"),
    tsLow16.toString(16).padStart(4, "0"),
    ver.toString(16).padStart(4, "0"),
    variant.toString(16).padStart(4, "0"),
    tail
  ].join("-");
}
