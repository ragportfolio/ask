/**
 * Server-only helper for the proxy transport.
 *
 * This module is published under `@ragportfolio/ask/server` and is deliberately **not** re-exported
 * by the package root. It accepts a Ragportfolio API token, which is a server credential: it
 * resolves one portfolio scope in D1 and spends that portfolio's allowance with no origin check and
 * no challenge. Anything that can reach a browser bundle can be read by a visitor, so this file
 * imports no React, no styles, and nothing from the browser entry.
 *
 * The website's backend remains responsible for its own abuse controls. Ragportfolio authenticates
 * *the integration*, not the visitor behind it, so an unprotected proxy endpoint is an open door to
 * the portfolio's allowance no matter how well the token is stored.
 */
const RAGPORTFOLIO_DEFAULT_ORIGIN = "https://ragportfolio.com";
const INTEGRATION_ASK_PATH = "/api/integrations/portfolio-ask";

export const MAX_QUESTION_LENGTH = 500;

export interface PortfolioAskCitation {
  path: string;
  startLine: number;
  endLine: number;
}

export interface PortfolioAskAnswer {
  text: string;
  mode: "extractive" | "llm";
  citations: PortfolioAskCitation[];
}

export interface PortfolioAskOptions {
  /** Read this from a server secret. Never from a bundled constant or a public environment value. */
  apiToken: string;
  question: string;
  backendUrl?: string;
  signal?: AbortSignal;
}

export class PortfolioAskError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "PortfolioAskError";
  }
}

/**
 * Validates a question the way the public endpoint does, so an oversized or empty body is refused
 * before it costs a network call — and, more importantly, before it reaches an endpoint that spends
 * the portfolio's allowance.
 */
export function normalizeQuestion(value: unknown): string {
  if (typeof value !== "string") throw new PortfolioAskError(400, "invalid_question", "Ask a question.");
  const question = value.trim();
  if (!question) throw new PortfolioAskError(400, "invalid_question", "Ask a question.");
  if (question.length > MAX_QUESTION_LENGTH) throw new PortfolioAskError(400, "invalid_question", `Ask a question of up to ${MAX_QUESTION_LENGTH} characters.`);
  return question;
}

/*
 * Failures are mapped to a small, stable set. The upstream body is never forwarded verbatim: it can
 * carry request identifiers and internal codes that belong in the website's own logs, not in a
 * response rendered to an anonymous visitor.
 */
function messageForStatus(status: number): {code: string; message: string} {
  if (status === 401 || status === 403) return {code: "unauthorized", message: "This integration is not authorized to ask this portfolio."};
  if (status === 402) return {code: "allowance_exhausted", message: "This portfolio has paused answering questions."};
  if (status === 404) return {code: "portfolio_unavailable", message: "This portfolio is not available."};
  if (status === 429) return {code: "rate_limited", message: "This portfolio is answering a lot of questions right now. Try again shortly."};
  if (status >= 500) return {code: "service_unavailable", message: "The Ask service is temporarily unavailable."};
  return {code: "ask_failed", message: "That question could not be answered."};
}

/**
 * Asks the portfolio bound to the supplied API token.
 *
 * The token alone determines which portfolio answers: there is no slug, address, tenant, or funding
 * parameter, so a compromised website endpoint still cannot reach a different portfolio.
 */
export async function askPortfolio(options: PortfolioAskOptions): Promise<PortfolioAskAnswer> {
  const apiToken = options.apiToken?.trim();
  if (!apiToken) throw new PortfolioAskError(500, "missing_api_token", "The Ragportfolio API token is not configured.");
  const question = normalizeQuestion(options.question);
  const origin = (options.backendUrl?.trim() || RAGPORTFOLIO_DEFAULT_ORIGIN).replace(/\/+$/u, "");
  let response: Response;
  try {
    response = await fetch(`${origin}${INTEGRATION_ASK_PATH}`, {method: "POST", headers: {Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json"}, body: JSON.stringify({question}), signal: options.signal});
  } catch {
    // The rejection can contain the request, and the request carries the Authorization header.
    throw new PortfolioAskError(503, "service_unavailable", "The Ask service is temporarily unavailable.");
  }
  if (!response.ok) {
    const mapped = messageForStatus(response.status);
    throw new PortfolioAskError(response.status, mapped.code, mapped.message);
  }
  const payload = await response.json() as {answer?: PortfolioAskAnswer} | null;
  const answer = payload?.answer;
  if (!answer || typeof answer.text !== "string" || (answer.mode !== "extractive" && answer.mode !== "llm")) throw new PortfolioAskError(502, "invalid_response", "That question could not be answered.");
  return {text: answer.text, mode: answer.mode, citations: Array.isArray(answer.citations) ? answer.citations : []};
}

/**
 * Turns a request body into the exact response shape the widget's proxy transport expects, so a
 * route handler is a few lines and cannot accidentally forward an upstream body.
 */
export async function handlePortfolioAskRequest(body: unknown, options: {apiToken: string; backendUrl?: string; signal?: AbortSignal}): Promise<{status: number; body: {answer: PortfolioAskAnswer} | {error: {code: string; message: string}}}> {
  try {
    const question = normalizeQuestion((body as {question?: unknown} | null)?.question);
    const answer = await askPortfolio({apiToken: options.apiToken, question, backendUrl: options.backendUrl, signal: options.signal});
    return {status: 200, body: {answer}};
  } catch (error) {
    if (error instanceof PortfolioAskError) return {status: error.status >= 400 && error.status < 600 ? error.status : 500, body: {error: {code: error.code, message: error.message}}};
    return {status: 500, body: {error: {code: "ask_failed", message: "That question could not be answered."}}};
  }
}
