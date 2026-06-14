import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { askQuestion, fetchAppConfig } from "./client";
import type { AskResult, AskTurn, AskWidgetProps, Citation } from "./types";
import { useTurnstile } from "./useTurnstile";

export function AskWidget({
  adminToken,
  backendUrl,
  className,
  fetchAppConfig: shouldFetchAppConfig = true,
  initialQuestion = "",
  inputClassName,
  inputStyle,
  labels,
  onError,
  onResult,
  repoId,
  showCitations = false,
  showStaleWarnings = true,
  sourceId,
  targetId,
  topK,
  turnstileAction,
  turnstileSiteKey
}: AskWidgetProps) {
  const [question, setQuestion] = useState(initialQuestion);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [resolvedTurnstileSiteKey, setResolvedTurnstileSiteKey] = useState<string | null>(turnstileSiteKey ?? null);
  const [resolvedTurnstileAction, setResolvedTurnstileAction] = useState(turnstileAction ?? "ask");
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adminBypassEnabled = Boolean(adminToken?.trim());

  useEffect(() => {
    if (turnstileSiteKey !== undefined) {
      setResolvedTurnstileSiteKey(turnstileSiteKey);
    }
  }, [turnstileSiteKey]);

  useEffect(() => {
    if (turnstileAction) {
      setResolvedTurnstileAction(turnstileAction);
    }
  }, [turnstileAction]);

  useEffect(() => {
    if (!shouldFetchAppConfig || turnstileSiteKey !== undefined || adminBypassEnabled) {
      return;
    }

    let isCancelled = false;
    fetchAppConfig(backendUrl)
      .then((config) => {
        if (isCancelled) return;
        setResolvedTurnstileSiteKey(config.turnstileSiteKey);
        setResolvedTurnstileAction(turnstileAction ?? config.turnstileExpectedAction ?? "ask");
        setConfigError(null);
      })
      .catch((error) => {
        if (!isCancelled) setConfigError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      isCancelled = true;
    };
  }, [adminBypassEnabled, backendUrl, shouldFetchAppConfig, turnstileAction, turnstileSiteKey]);

  const turnstile = useTurnstile(adminBypassEnabled ? null : resolvedTurnstileSiteKey, resolvedTurnstileAction);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => {
    if (!question && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [question]);

  const rootClassName = useMemo(() => {
    return ["torency-ask", className].filter(Boolean).join(" ");
  }, [className]);

  const canSubmit = !isSubmitting && question.trim().length > 0 && (adminBypassEnabled || Boolean(turnstile.token));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) return;
    if (!adminBypassEnabled && !turnstile.token) {
      setFormError("Complete the Turnstile challenge before asking a question.");
      return;
    }

    const id = createTurnId();
    setTurns((prev) => [...prev, {id, question: normalizedQuestion, result: null, error: null}]);
    setQuestion("");
    setIsSubmitting(true);

    try {
      const result = await askQuestion({
        adminToken,
        backendUrl,
        question: normalizedQuestion,
        repoId,
        sourceId,
        targetId,
        topK,
        turnstileToken: adminBypassEnabled ? undefined : turnstile.token ?? undefined
      });
      setTurns((prev) => prev.map((turn) => turn.id === id ? {...turn, result} : turn));
      onResult?.(result);
      if (!adminBypassEnabled) turnstile.reset();
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      setTurns((prev) => prev.map((turn) => turn.id === id ? {...turn, error: normalized.message} : turn));
      onError?.(normalized, normalizedQuestion);
      if (!adminBypassEnabled) turnstile.reset();
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleTextareaChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setQuestion(event.target.value);
    const el = event.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  return (
    <section className={rootClassName}>
      {labels?.title ? <header className="torency-ask__header">{labels.title}</header> : null}

      <div className="torency-ask__thread" ref={threadRef}>
        {turns.length === 0 ? (
          <div className="torency-ask__empty">{labels?.empty ?? "Ask a question to get started."}</div>
        ) : null}

        {turns.map((turn) => (
          <article key={turn.id} className="torency-ask__exchange">
            <div className="torency-ask__bubble torency-ask__bubble--user">{turn.question}</div>
            {turn.result === null && !turn.error ? (
              <div className="torency-ask__bubble torency-ask__bubble--assistant torency-ask__bubble--loading">
                <span className="torency-ask__dots"><span /><span /><span /></span>
              </div>
            ) : turn.error ? (
              <p className="torency-ask__error">{turn.error}</p>
            ) : turn.result ? (
              <AnswerBubble result={turn.result} showCitations={showCitations} showStaleWarnings={showStaleWarnings} />
            ) : null}
          </article>
        ))}
      </div>

      <div className="torency-ask__composer">
        {!adminBypassEnabled ? (
          <div className={`torency-ask__turnstile${turnstile.token ? " torency-ask__turnstile--verified" : ""}`}>
            <div className="torency-ask__turnstile-label">{labels?.turnstileLabel ?? "Turnstile"}</div>
            {configError ? <p className="torency-ask__error">{configError}</p> : null}
            {resolvedTurnstileSiteKey ? (
              <div className="torency-ask__turnstile-widget">
                <div ref={turnstile.containerRef} />
                {turnstile.error ? <p className="torency-ask__error">{turnstile.error}</p> : null}
              </div>
            ) : !configError ? (
              <p className="torency-ask__error">Turnstile is not configured.</p>
            ) : null}
          </div>
        ) : null}

        {formError ? <p className="torency-ask__error">{formError}</p> : null}

        <form className="torency-ask__form" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            className={["torency-ask__input", inputClassName].filter(Boolean).join(" ")}
            style={inputStyle}
            value={question}
            onChange={handleTextareaChange}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSubmit) event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={labels?.inputPlaceholder ?? "Ask a question"}
            rows={1}
          />
          <button type="submit" className="torency-ask__send" disabled={!canSubmit} aria-label={labels?.sendLabel ?? "Send"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
      </div>
    </section>
  );
}

function AnswerBubble({result, showCitations, showStaleWarnings}: {result: AskResult; showCitations: boolean; showStaleWarnings: boolean}) {
  return (
    <div className="torency-ask__bubble torency-ask__bubble--assistant">
      {showStaleWarnings && result.staleRepos.length > 0 ? (
        <div className="torency-ask__warning">
          Code embeddings may be outdated for {result.staleRepos.map((repo) => repo.name).join(", ")}.
        </div>
      ) : null}
      <div className="torency-ask__answer">{renderAnswerMarkdown(result.answer)}</div>
      {showCitations && result.citations.length > 0 ? (
        <details className="torency-ask__citations">
          <summary>Citations <span>{result.citations.length}</span></summary>
          <ul>
            {result.citations.map((citation) => (
              <li key={citationKey(citation)}>
                <code>{citation.path}:{citation.startLine}-{citation.endLine}</code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

interface AnswerBlock {
  lines: string[];
  type: "paragraph" | "list";
}

function renderAnswerMarkdown(answer: string): ReactNode {
  return parseAnswerBlocks(answer).map((block, blockIndex) => {
    if (block.type === "list") {
      return (
        <ul key={`list-${blockIndex}`} className="torency-ask__answer-list">
          {block.lines.map((line, lineIndex) => <li key={`item-${blockIndex}-${lineIndex}`}>{renderInlineMarkdown(line)}</li>)}
        </ul>
      );
    }

    return (
      <p key={`paragraph-${blockIndex}`}>
        {block.lines.map((line, lineIndex) => (
          <span key={`line-${blockIndex}-${lineIndex}`}>
            {lineIndex > 0 ? <br /> : null}
            {renderInlineMarkdown(line)}
          </span>
        ))}
      </p>
    );
  });
}

function parseAnswerBlocks(answer: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let current: string[] = [];
  let currentType: AnswerBlock["type"] | null = null;

  for (const rawLine of answer.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      flushAnswerBlock(blocks, current, currentType);
      current = [];
      currentType = null;
      continue;
    }

    const isListLine = /^\s*[-*]\s+/.test(rawLine);
    const type: AnswerBlock["type"] = isListLine ? "list" : "paragraph";
    if (currentType && currentType !== type) {
      flushAnswerBlock(blocks, current, currentType);
      current = [];
    }

    current.push(stripInlineCitation(isListLine ? rawLine.replace(/^\s*[-*]\s+/, "") : rawLine));
    currentType = type;
  }

  flushAnswerBlock(blocks, current, currentType);
  return blocks;
}

function flushAnswerBlock(blocks: AnswerBlock[], lines: string[], type: AnswerBlock["type"] | null): void {
  if (!type || lines.length === 0) return;
  blocks.push({lines, type});
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(<strong key={`strong-${match.index}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function stripInlineCitation(value: string): string {
  return value.replace(/\s*\[\s*[^\]\n]+?:\d+\s*[-–]\s*\d+\s*\]/g, "").trimEnd();
}

function citationKey(citation: Citation): string {
  return `${citation.path}:${citation.startLine}-${citation.endLine}`;
}

function createTurnId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
