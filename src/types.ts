import type { CSSProperties, ReactNode } from "react";

export interface AppConfigPayload {
  hasAdminAuth: boolean;
  turnstileExpectedAction: string;
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

export interface AskRequestInput {
  adminToken?: string;
  backendUrl: string;
  question: string;
  sourceId?: string;
  repoId?: string;
  targetId?: string;
  topK?: number;
  turnstileToken?: string;
}

export interface AskWidgetLabels {
  empty?: ReactNode;
  inputPlaceholder?: string;
  sendLabel?: string;
  title?: ReactNode;
  turnstileLabel?: ReactNode;
}

export interface AskWidgetProps {
  adminToken?: string;
  backendUrl: string;
  className?: string;
  fetchAppConfig?: boolean;
  initialQuestion?: string;
  inputClassName?: string;
  inputStyle?: CSSProperties;
  labels?: AskWidgetLabels;
  onError?: (error: Error, question: string) => void;
  onResult?: (result: AskResult) => void;
  repoId?: string;
  showCitations?: boolean;
  showStaleWarnings?: boolean;
  sourceId?: string;
  targetId?: string;
  topK?: number;
  turnstileAction?: string;
  turnstileSiteKey?: string | null;
}
