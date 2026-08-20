import type { CSSProperties, ReactNode } from "react";

export interface AppConfigPayload {
  hasAdminAuth: boolean;
  turnstileExpectedAction: string;
  turnstileSiteKey: string | null;
}

export interface PortfolioEmbedConfig {
  /** Owner-authored opening message, or `null` when the portfolio keeps the widget's default. */
  askEmptyMessage: string | null;
  showCitations: boolean;
  turnstileAction: string;
  turnstileCData: string;
  turnstileSiteKey: string | null;
}

export interface Citation {
  path: string;
  startLine: number;
  endLine: number;
}

export interface SearchHit {
  chunkId: string;
  repoId: string;
  path: string;
  language: string | null;
  symbol: string | null;
  kind: string;
  startLine: number;
  endLine: number;
  content: string;
  checksum: string;
  lexicalScore: number;
}

export interface StaleRepoWarning {
  repoId: string;
  name: string;
  indexedCommitSha: string;
  latestCommitSha: string;
}

export interface AskResult {
  repoId: string;
  question: string;
  answer: string;
  citations: Citation[];
  hits: SearchHit[];
  mode: "extractive" | "llm";
  staleRepos: StaleRepoWarning[];
}

export interface AskTurn {
  id: string;
  question: string;
  result: AskResult | null;
  error: string | null;
}

/**
 * How the widget reaches a portfolio.
 *
 * `direct` is the default and needs no backend from the embedding site: the browser calls
 * Ragportfolio and proves itself with a portfolio-bound Turnstile token. `proxy` is for sites that
 * already run a backend and would rather hold an API token there and apply their own bot defense.
 *
 * There is deliberately no way to supply a Ragportfolio API token here. It is a server credential,
 * and anything reachable from this type is reachable from the page source.
 */
export type AskTransport =
  | {mode: "direct"; portfolioSlug: string; portfolioToken?: never; backendUrl?: string}
  | {mode: "direct"; portfolioToken: string; portfolioSlug?: never; backendUrl?: string}
  | {mode: "proxy"; endpoint: string; headers?: Record<string, string>; allowAbsoluteEndpoint?: boolean};

export type ResolvedTransport =
  | {mode: "direct"; address: {kind: "slug" | "token"; value: string}; backendUrl: string}
  | {mode: "proxy"; endpoint: string; headers?: Record<string, string>};

export interface AskRequestInput {
  adminToken?: string;
  backendUrl?: string;
  portfolioSlug?: string;
  portfolioToken?: string;
  question: string;
  sourceId?: string;
  repoId?: string;
  targetId?: string;
  topK?: number;
  turnstileToken?: string;
}

export interface AskWidgetLabels {
  citations?: ReactNode;
  /** Overrides the portfolio owner's opening message; omit it to render whatever the owner saved. */
  empty?: ReactNode;
  inputPlaceholder?: string;
  loading?: ReactNode;
  /** Replaces the default brush icon inside the conversation reset button. */
  reset?: ReactNode;
  resetLabel?: string;
  sendLabel?: string;
  title?: ReactNode;
  turnstileLabel?: ReactNode;
}

export type AskWidgetSlot = "answer" | "citations" | "composer" | "empty" | "error" | "exchange" | "form" | "header" | "input" | "loading" | "question" | "reset" | "response" | "root" | "send" | "thread" | "turnstile" | "warning";

export type AskWidgetClassNames = Partial<Record<AskWidgetSlot, string>>;
export type AskWidgetStyles = Partial<Record<AskWidgetSlot, CSSProperties>>;

export interface AskWidgetAppearance {
  accentColor?: string;
  accentTextColor?: string;
  assistantBackground?: string;
  background?: string;
  borderColor?: string;
  borderRadius?: string;
  bubbleMaxWidth?: string;
  bubblePadding?: string;
  composerGap?: string;
  errorColor?: string;
  focusRing?: string;
  fontFamily?: string;
  fontSize?: string;
  gap?: string;
  inputBackground?: string;
  inputMaxHeight?: string;
  inputMinHeight?: string;
  maxWidth?: string;
  minHeight?: string;
  mutedColor?: string;
  padding?: string;
  resetButtonSize?: string;
  shadow?: string;
  sendButtonSize?: string;
  textColor?: string;
  threadMaxHeight?: string;
  threadMinHeight?: string;
  userBackground?: string;
  userTextColor?: string;
  warningBackground?: string;
  warningTextColor?: string;
}

export interface AskWidgetProps {
  adminToken?: string;
  /** Explicit transport. Mutually exclusive with the portfolioSlug/portfolioToken shorthand. */
  transport?: AskTransport;
  appearance?: AskWidgetAppearance;
  backendUrl?: string;
  className?: string;
  classNames?: AskWidgetClassNames;
  fetchAppConfig?: boolean;
  id?: string;
  initialQuestion?: string;
  inputClassName?: string;
  inputStyle?: CSSProperties;
  labels?: AskWidgetLabels;
  onError?: (error: Error, question: string) => void;
  onReset?: () => void;
  onResult?: (result: AskResult) => void;
  portfolioSlug?: string;
  portfolioToken?: string;
  repoId?: string;
  showCitations?: boolean;
  showStaleWarnings?: boolean;
  sourceId?: string;
  style?: CSSProperties;
  styles?: AskWidgetStyles;
  targetId?: string;
  theme?: "dark" | "light";
  topK?: number;
  turnstileAction?: string;
  turnstileSiteKey?: string | null;
}
