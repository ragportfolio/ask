import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";

import { askQuestion, fetchAppConfig } from "./client";
import type { AskResult, AskTurn, AskWidgetAppearance, AskWidgetClassNames, AskWidgetProps, AskWidgetStyles, Citation } from "./types";
import { useTurnstile } from "./useTurnstile";

export function AskWidget({
  adminToken,
  appearance,
  backendUrl,
  className,
  classNames,
  fetchAppConfig: shouldFetchAppConfig = true,
  id,
  initialQuestion = "",
  inputClassName,
  inputStyle,
  labels,
  onError,
  onResult,
  portfolioSlug,
  portfolioToken,
  repoId,
  showCitations,
  showStaleWarnings = true,
  sourceId,
  style,
  styles,
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

  const portfolioMode = Boolean(portfolioSlug?.trim() || portfolioToken?.trim());
  const resolvedBackendUrl = backendUrl ?? "https://ragportfolio.com";
  const adminBypassEnabled = !portfolioMode && Boolean(adminToken?.trim());
  const challengeRequired = !portfolioMode && !adminBypassEnabled;
  const citationsVisible = showCitations ?? portfolioMode;

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
    if (!shouldFetchAppConfig || turnstileSiteKey !== undefined || !challengeRequired) {
      return;
    }

    let isCancelled = false;
    fetchAppConfig(resolvedBackendUrl)
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
  }, [challengeRequired, resolvedBackendUrl, shouldFetchAppConfig, turnstileAction, turnstileSiteKey]);

  const turnstile = useTurnstile(challengeRequired ? resolvedTurnstileSiteKey : null, resolvedTurnstileAction);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => {
    if (!question && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [question]);

  const rootClassName = useMemo(() => slotClass("torency-ask", classNames?.root, className), [className, classNames?.root]);
  const rootStyle = useMemo(() => ({...appearanceStyle(appearance), ...styles?.root, ...style}), [appearance, style, styles?.root]);

  const canSubmit = !isSubmitting && question.trim().length > 0 && (!challengeRequired || Boolean(turnstile.token));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) return;
    if (challengeRequired && !turnstile.token) {
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
        backendUrl: resolvedBackendUrl,
        portfolioSlug,
        portfolioToken,
        question: normalizedQuestion,
        repoId,
        sourceId,
        targetId,
        topK,
        turnstileToken: adminBypassEnabled ? undefined : turnstile.token ?? undefined
      });
      setTurns((prev) => prev.map((turn) => turn.id === id ? {...turn, result} : turn));
      onResult?.(result);
      if (challengeRequired) turnstile.reset();
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      setTurns((prev) => prev.map((turn) => turn.id === id ? {...turn, error: normalized.message} : turn));
      onError?.(normalized, normalizedQuestion);
      if (challengeRequired) turnstile.reset();
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
    <section id={widgetId} className={rootClassName} data-theme={theme} style={rootStyle}>
      {labels?.title ? <header id={`${widgetId}-header`} className={slotClass("torency-ask__header", classNames?.header)} style={styles?.header}>{labels.title}</header> : null}

      <div id={`${widgetId}-thread`} className={slotClass("torency-ask__thread", classNames?.thread)} style={styles?.thread} ref={threadRef}>
        {turns.length === 0 ? (
          <div id={`${widgetId}-empty`} className={slotClass("torency-ask__empty", classNames?.empty)} style={styles?.empty}>{labels?.empty ?? "Ask a question to get started."}</div>
        ) : null}

        {turns.map((turn, turnIndex) => {
          const turnId = `${widgetId}-turn-${turnIndex + 1}`;
          return (
            <article id={turnId} key={turn.id} className={slotClass("torency-ask__exchange", classNames?.exchange)} style={styles?.exchange}>
              <div id={`${turnId}-question`} className={slotClass("torency-ask__bubble torency-ask__bubble--user", classNames?.question)} style={styles?.question}>{turn.question}</div>
              {turn.result === null && !turn.error ? (
                <div id={`${turnId}-loading`} className={slotClass("torency-ask__bubble torency-ask__bubble--assistant torency-ask__bubble--loading", classNames?.loading)} style={styles?.loading}>
                  {labels?.loading ?? <span id={`${turnId}-loading-dots`} className="torency-ask__dots">
                    <span id={`${turnId}-loading-dot-1`} />
                    <span id={`${turnId}-loading-dot-2`} />
                    <span id={`${turnId}-loading-dot-3`} />
                  </span>}
                </div>
              ) : turn.error ? (
                <p id={`${turnId}-error`} className={slotClass("torency-ask__error", classNames?.error)} style={styles?.error}>{turn.error}</p>
              ) : turn.result ? (
                <AnswerBubble classNames={classNames} idPrefix={turnId} labels={labels} result={turn.result} showCitations={citationsVisible} showStaleWarnings={showStaleWarnings} styles={styles} />
              ) : null}
            </article>
          );
        })}
      </div>

      <div id={`${widgetId}-composer`} className={slotClass("torency-ask__composer", classNames?.composer)} style={styles?.composer}>
        {challengeRequired ? (
          <div
            id={`${widgetId}-turnstile`}
            className={slotClass(`torency-ask__turnstile${turnstile.token ? " torency-ask__turnstile--verified" : ""}`, classNames?.turnstile)}
            style={styles?.turnstile}
            hidden={Boolean(turnstile.token)}
          >
            <div id={`${widgetId}-turnstile-label`} className="torency-ask__turnstile-label">{labels?.turnstileLabel ?? "Turnstile"}</div>
            {configError ? <p id={`${widgetId}-config-error`} className={slotClass("torency-ask__error", classNames?.error)} style={styles?.error}>{configError}</p> : null}
            {resolvedTurnstileSiteKey ? (
              <div id={`${widgetId}-turnstile-widget`} className="torency-ask__turnstile-widget">
                <div id={`${widgetId}-turnstile-container`} ref={turnstile.containerRef} />
                {turnstile.error ? <p id={`${widgetId}-turnstile-error`} className={slotClass("torency-ask__error", classNames?.error)} style={styles?.error}>{turnstile.error}</p> : null}
              </div>
            ) : !configError ? (
              <p id={`${widgetId}-turnstile-missing`} className={slotClass("torency-ask__error", classNames?.error)} style={styles?.error}>Turnstile is not configured.</p>
            ) : null}
          </div>
        ) : null}

        {formError ? <p id={`${widgetId}-form-error`} className={slotClass("torency-ask__error", classNames?.error)} style={styles?.error}>{formError}</p> : null}

        <form id={`${widgetId}-form`} className={slotClass("torency-ask__form", classNames?.form)} style={styles?.form} onSubmit={handleSubmit}>
          <textarea
            id={`${widgetId}-input`}
            ref={textareaRef}
            className={slotClass("torency-ask__input", classNames?.input, inputClassName)}
            style={{...styles?.input, ...inputStyle}}
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
          <button id={`${widgetId}-send`} type="submit" className={slotClass("torency-ask__send", classNames?.send)} style={styles?.send} disabled={!canSubmit} aria-label={labels?.sendLabel ?? "Send"}>
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

function AnswerBubble({classNames, idPrefix, labels, result, showCitations, showStaleWarnings, styles}: {classNames?: AskWidgetClassNames; idPrefix: string; labels?: AskWidgetProps["labels"]; result: AskResult; showCitations: boolean; showStaleWarnings: boolean; styles?: AskWidgetStyles}) {
  return (
    <div id={`${idPrefix}-response`} className={slotClass("torency-ask__bubble torency-ask__bubble--assistant", classNames?.response)} style={styles?.response}>
      {showStaleWarnings && result.staleRepos.length > 0 ? (
        <div id={`${idPrefix}-warning`} className={slotClass("torency-ask__warning", classNames?.warning)} style={styles?.warning}>
          Code embeddings may be outdated for {result.staleRepos.map((repo) => repo.name).join(", ")}.
        </div>
      ) : null}
      <div id={`${idPrefix}-answer`} className={slotClass("torency-ask__answer", classNames?.answer)} style={styles?.answer}>{renderAnswerMarkdown(result.answer, `${idPrefix}-answer`)}</div>
      {showCitations && result.citations.length > 0 ? (
        <details id={`${idPrefix}-citations`} className={slotClass("torency-ask__citations", classNames?.citations)} style={styles?.citations}>
          <summary id={`${idPrefix}-citations-summary`}>{labels?.citations ?? "Citations"} <span id={`${idPrefix}-citations-count`}>{result.citations.length}</span></summary>
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

function slotClass(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

type AskWidgetVariableStyle = CSSProperties & {[name: `--torency-ask-${string}`]: string | undefined};

function appearanceStyle(appearance?: AskWidgetAppearance): AskWidgetVariableStyle {
  return {
    "--torency-ask-accent": appearance?.accentColor,
    "--torency-ask-accent-text": appearance?.accentTextColor,
    "--torency-ask-assistant-bg": appearance?.assistantBackground,
    "--torency-ask-bg": appearance?.background,
    "--torency-ask-border": appearance?.borderColor,
    "--torency-ask-bubble-max-width": appearance?.bubbleMaxWidth,
    "--torency-ask-bubble-padding": appearance?.bubblePadding,
    "--torency-ask-composer-gap": appearance?.composerGap,
    "--torency-ask-error": appearance?.errorColor,
    "--torency-ask-focus-ring": appearance?.focusRing,
    "--torency-ask-font-family": appearance?.fontFamily,
    "--torency-ask-font-size": appearance?.fontSize,
    "--torency-ask-gap": appearance?.gap,
    "--torency-ask-input-bg": appearance?.inputBackground,
    "--torency-ask-input-max-height": appearance?.inputMaxHeight,
    "--torency-ask-input-min-height": appearance?.inputMinHeight,
    "--torency-ask-max-width": appearance?.maxWidth,
    "--torency-ask-min-height": appearance?.minHeight,
    "--torency-ask-muted": appearance?.mutedColor,
    "--torency-ask-padding": appearance?.padding,
    "--torency-ask-radius": appearance?.borderRadius,
    "--torency-ask-shadow": appearance?.shadow,
    "--torency-ask-send-size": appearance?.sendButtonSize,
    "--torency-ask-text": appearance?.textColor,
    "--torency-ask-thread-max-height": appearance?.threadMaxHeight,
    "--torency-ask-thread-min-height": appearance?.threadMinHeight,
    "--torency-ask-user-bg": appearance?.userBackground,
    "--torency-ask-user-text": appearance?.userTextColor,
    "--torency-ask-warning-bg": appearance?.warningBackground,
    "--torency-ask-warning-text": appearance?.warningTextColor
  };
}
