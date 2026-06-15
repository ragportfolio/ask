import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { askQuestion, fetchAppConfig } from "./client";
import type { AskResult, AskTurn, AskWidgetProps, Citation } from "./types";
import { useTurnstile } from "./useTurnstile";

export function AskWidget({
  adminToken,
  backendUrl,
  className,
  fetchAppConfig: shouldFetchAppConfig = true,
  id,
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
  style,
  targetId,
  theme,
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
  const generatedId = useId();
  const widgetId = useMemo(() => id?.trim() || `torency-ask-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [generatedId, id]);

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
    <section id={widgetId} className={rootClassName} data-theme={theme} style={style}>
      {labels?.title ? <header id={`${widgetId}-header`} className="torency-ask__header">{labels.title}</header> : null}

      <div id={`${widgetId}-thread`} className="torency-ask__thread" ref={threadRef}>
        {turns.length === 0 ? (
          <div id={`${widgetId}-empty`} className="torency-ask__empty">{labels?.empty ?? "Ask a question to get started."}</div>
        ) : null}

        {turns.map((turn, turnIndex) => {
          const turnId = `${widgetId}-turn-${turnIndex + 1}`;
          return (
            <article id={turnId} key={turn.id} className="torency-ask__exchange">
              <div id={`${turnId}-question`} className="torency-ask__bubble torency-ask__bubble--user">{turn.question}</div>
              {turn.result === null && !turn.error ? (
                <div id={`${turnId}-loading`} className="torency-ask__bubble torency-ask__bubble--assistant torency-ask__bubble--loading">
                  <span id={`${turnId}-loading-dots`} className="torency-ask__dots">
                    <span id={`${turnId}-loading-dot-1`} />
                    <span id={`${turnId}-loading-dot-2`} />
                    <span id={`${turnId}-loading-dot-3`} />
                  </span>
                </div>
              ) : turn.error ? (
                <p id={`${turnId}-error`} className="torency-ask__error">{turn.error}</p>
              ) : turn.result ? (
                <AnswerBubble idPrefix={turnId} result={turn.result} showCitations={showCitations} showStaleWarnings={showStaleWarnings} />
              ) : null}
            </article>
          );
        })}
      </div>

      <div id={`${widgetId}-composer`} className="torency-ask__composer">
        {!adminBypassEnabled ? (
          <div
            id={`${widgetId}-turnstile`}
            className={`torency-ask__turnstile${turnstile.token ? " torency-ask__turnstile--verified" : ""}`}
            hidden={Boolean(turnstile.token)}
          >
            <div id={`${widgetId}-turnstile-label`} className="torency-ask__turnstile-label">{labels?.turnstileLabel ?? "Turnstile"}</div>
            {configError ? <p id={`${widgetId}-config-error`} className="torency-ask__error">{configError}</p> : null}
            {resolvedTurnstileSiteKey ? (
              <div id={`${widgetId}-turnstile-widget`} className="torency-ask__turnstile-widget">
                <div id={`${widgetId}-turnstile-container`} ref={turnstile.containerRef} />
                {turnstile.error ? <p id={`${widgetId}-turnstile-error`} className="torency-ask__error">{turnstile.error}</p> : null}
              </div>
            ) : !configError ? (
              <p id={`${widgetId}-turnstile-missing`} className="torency-ask__error">Turnstile is not configured.</p>
            ) : null}
          </div>
        ) : null}

        {formError ? <p id={`${widgetId}-form-error`} className="torency-ask__error">{formError}</p> : null}

        <form id={`${widgetId}-form`} className="torency-ask__form" onSubmit={handleSubmit}>
          <textarea
            id={`${widgetId}-input`}
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
          <button id={`${widgetId}-send`} type="submit" className="torency-ask__send" disabled={!canSubmit} aria-label={labels?.sendLabel ?? "Send"}>
            <svg id={`${widgetId}-send-icon`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path id={`${widgetId}-send-icon-shaft`} d="M12 19V5" />
              <path id={`${widgetId}-send-icon-head`} d="M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
      </div>
    </section>
  );
}

function AnswerBubble({idPrefix, result, showCitations, showStaleWarnings}: {idPrefix: string; result: AskResult; showCitations: boolean; showStaleWarnings: boolean}) {
  return (
    <div id={`${idPrefix}-response`} className="torency-ask__bubble torency-ask__bubble--assistant">
      {showStaleWarnings && result.staleRepos.length > 0 ? (
        <div id={`${idPrefix}-warning`} className="torency-ask__warning">
          Code embeddings may be outdated for {result.staleRepos.map((repo) => repo.name).join(", ")}.
        </div>
      ) : null}
      <div id={`${idPrefix}-answer`} className="torency-ask__answer">{renderAnswerMarkdown(result.answer, `${idPrefix}-answer`)}</div>
      {showCitations && result.citations.length > 0 ? (
        <details id={`${idPrefix}-citations`} className="torency-ask__citations">
          <summary id={`${idPrefix}-citations-summary`}>Citations <span id={`${idPrefix}-citations-count`}>{result.citations.length}</span></summary>
          <ul id={`${idPrefix}-citations-list`}>
            {result.citations.map((citation, citationIndex) => (
              <li id={`${idPrefix}-citation-${citationIndex + 1}`} key={citationKey(citation)}>
                <code id={`${idPrefix}-citation-${citationIndex + 1}-code`}>{citation.path}:{citation.startLine}-{citation.endLine}</code>
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

function renderAnswerMarkdown(answer: string, idPrefix: string): ReactNode {
  return parseAnswerBlocks(answer).map((block, blockIndex) => {
    const blockId = `${idPrefix}-block-${blockIndex + 1}`;
    if (block.type === "list") {
      return (
        <ul id={blockId} key={`list-${blockIndex}`} className="torency-ask__answer-list">
          {block.lines.map((line, lineIndex) => {
            const lineId = `${blockId}-item-${lineIndex + 1}`;
            return <li id={lineId} key={`item-${blockIndex}-${lineIndex}`}>{renderInlineMarkdown(line, lineId)}</li>;
          })}
        </ul>
      );
    }

    return (
      <p id={blockId} key={`paragraph-${blockIndex}`}>
        {block.lines.map((line, lineIndex) => (
          <span id={`${blockId}-line-${lineIndex + 1}`} key={`line-${blockIndex}-${lineIndex}`}>
            {lineIndex > 0 ? <br id={`${blockId}-break-${lineIndex}`} /> : null}
            {renderInlineMarkdown(line, `${blockId}-line-${lineIndex + 1}`)}
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

function renderInlineMarkdown(text: string, idPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(<strong id={`${idPrefix}-strong-${match.index}`} key={`strong-${match.index}`}>{match[1]}</strong>);
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
