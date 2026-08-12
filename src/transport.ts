import type { AskTransport, ResolvedTransport } from "./types";

/**
 * Transport resolution and validation.
 *
 * The widget can reach a portfolio two ways, and they have deliberately different trust models:
 *
 * - `direct` talks to Ragportfolio from the browser. The request is anonymous, so it carries a
 *   portfolio-bound Turnstile proof and is accepted only from a verified origin.
 * - `proxy` talks to an endpoint the embedding site owns. That site's backend holds the API token
 *   and adds it server-side, so nothing secret exists in the page.
 *
 * The one rule that matters more than the others: **no Ragportfolio API token may ever reach the
 * browser.** A token is a server credential that resolves a portfolio scope and spends an allowance
 * without any origin or challenge check, so shipping one to a page would hand every visitor the
 * ability to spend the owner's allowance from anywhere. There is therefore no `apiToken`, `token`,
 * or `secret` prop, and proxy mode refuses caller-supplied credential headers rather than forwarding
 * them.
 */
const CREDENTIAL_HEADERS = ["authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "x-auth-token", "api-key"];

const RAGPORTFOLIO_DEFAULT_ORIGIN = "https://ragportfolio.com";

export class TransportConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportConfigurationError";
  }
}

function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Header names are checked case-insensitively against an explicit list rather than by looking for
 * "token"-ish substrings: a site legitimately needs to pass things like a CSRF header, and guessing
 * would either block those or miss a real credential.
 */
function assertNoCredentialHeaders(headers: Record<string, string> | undefined): void {
  if (!headers) return;
  for (const name of Object.keys(headers)) {
    if (CREDENTIAL_HEADERS.includes(name.trim().toLowerCase())) throw new TransportConfigurationError(`The ${name} header cannot be set from the browser. Add credentials in your own backend, never in the page.`);
  }
}

/**
 * A relative endpoint is same-origin by construction and cannot leak the visitor's request to a
 * third party. An absolute one can, so it requires the site to say so explicitly rather than being
 * accepted because it happened to parse.
 */
function resolveProxyEndpoint(endpoint: string, allowAbsoluteEndpoint: boolean): string {
  if (!endpoint) throw new TransportConfigurationError("Proxy transport requires an endpoint, for example \"/api/portfolio-ask\".");
  const absolute = /^[a-z][a-z0-9+.-]*:/iu.test(endpoint) || endpoint.startsWith("//");
  if (!absolute) {
    if (!endpoint.startsWith("/")) throw new TransportConfigurationError("A proxy endpoint must be an absolute path such as \"/api/portfolio-ask\".");
    return endpoint;
  }
  if (!allowAbsoluteEndpoint) throw new TransportConfigurationError("A cross-origin proxy endpoint must be opted into with allowAbsoluteEndpoint. Prefer a same-origin path.");
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new TransportConfigurationError("The proxy endpoint is not a valid URL.");
  }
  if (parsed.protocol !== "https:") throw new TransportConfigurationError("A cross-origin proxy endpoint must use https.");
  return parsed.toString();
}

export interface TransportInput {
  transport?: AskTransport;
  backendUrl?: string;
  portfolioSlug?: string;
  portfolioToken?: string;
}

/**
 * Accepts either the explicit `transport` object or the original `portfolioSlug`/`portfolioToken`
 * shorthand, which stays supported so existing integrations keep working. Returning one resolved
 * shape means every caller downstream stops re-deciding which mode it is in.
 */
export function resolveTransport(input: TransportInput): ResolvedTransport | null {
  const shorthandSlug = trimmed(input.portfolioSlug);
  const shorthandToken = trimmed(input.portfolioToken);
  if (input.transport && (shorthandSlug || shorthandToken)) throw new TransportConfigurationError("Use either transport or portfolioSlug/portfolioToken, not both.");

  if (!input.transport) {
    if (shorthandSlug && shorthandToken) throw new TransportConfigurationError("Choose either portfolioSlug or portfolioToken, not both.");
    if (shorthandSlug) return {mode: "direct", address: {kind: "slug", value: shorthandSlug}, backendUrl: trimmed(input.backendUrl) || RAGPORTFOLIO_DEFAULT_ORIGIN};
    if (shorthandToken) return {mode: "direct", address: {kind: "token", value: shorthandToken}, backendUrl: trimmed(input.backendUrl) || RAGPORTFOLIO_DEFAULT_ORIGIN};
    return null;
  }

  const transport = input.transport;
  if (transport.mode === "proxy") {
    assertNoCredentialHeaders(transport.headers);
    return {mode: "proxy", endpoint: resolveProxyEndpoint(trimmed(transport.endpoint), transport.allowAbsoluteEndpoint === true), headers: transport.headers ? {...transport.headers} : undefined};
  }

  if (transport.mode !== "direct") throw new TransportConfigurationError("Transport mode must be either \"direct\" or \"proxy\".");
  const slug = trimmed(transport.portfolioSlug);
  const token = trimmed(transport.portfolioToken);
  if (slug && token) throw new TransportConfigurationError("Choose either portfolioSlug or portfolioToken, not both.");
  if (!slug && !token) throw new TransportConfigurationError("Direct transport requires a portfolioSlug or a portfolioToken.");
  return {mode: "direct", address: slug ? {kind: "slug", value: slug} : {kind: "token", value: token}, backendUrl: trimmed(transport.backendUrl) || RAGPORTFOLIO_DEFAULT_ORIGIN};
}

/** Direct mode addresses a public portfolio by slug and an unlisted one by its share token. */
export function portfolioPath(transport: Extract<ResolvedTransport, {mode: "direct"}>, suffix: string): string {
  const address = encodeURIComponent(transport.address.value);
  return transport.address.kind === "token" ? `/api/public/portfolios/by-token/${address}${suffix}` : `/api/public/portfolios/${address}${suffix}`;
}
