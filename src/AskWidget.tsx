import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";

import { askQuestion, askWithTransport, fetchAppConfig, fetchPortfolioEmbedConfig } from "./client";
import { resolveTransport } from "./transport";
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
  transport,
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
  /*
   * Transport resolution can fail on misconfiguration (both addresses, a credential header, a
   * cross-origin endpoint without opt-in). That is a developer error, so it surfaces as a config
   * error in the widget rather than throwing during render and blanking the host page.
   */
  const resolvedTransport = useMemo(() => {
    try {
      return {value: resolveTransport({transport, backendUrl, portfolioSlug, portfolioToken}), error: null as string | null};
    } catch (error) {
      return {value: null, error: error instanceof Error ? error.message : String(error)};
    }
  }, [backendUrl, portfolioSlug, portfolioToken, transport]);
  const activeTransport = resolvedTransport.value;
  const proxyMode = activeTransport?.mode === "proxy";
  // Proxy mode never loads embed config and never renders a challenge: the embedding site's backend
  // is the authenticated party, so there is nothing for a visitor to prove here.
  const portfolioMode = activeTransport?.mode === "direct";
  const [question, setQuestion] = useState(initialQuestion);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [resolvedTurnstileSiteKey, setResolvedTurnstileSiteKey] = useState<string | null>(turnstileSiteKey ?? null);
  const [resolvedTurnstileAction, setResolvedTurnstileAction] = useState(turnstileAction ?? "ask");
  const [resolvedTurnstileCData, setResolvedTurnstileCData] = useState<string | undefined>();
  const [portfolioCitationsVisible, setPortfolioCitationsVisible] = useState(true);
  const [isPortfolioConfigLoading, setIsPortfolioConfigLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const generatedId = useId();
  const widgetId = useMemo(() => id?.trim() || `ragportfolio-ask-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [generatedId, id]);

  const resolvedBackendUrl = backendUrl ?? "https://ragportfolio.com";
  const adminBypassEnabled = !portfolioMode && !proxyMode && Boolean(adminToken?.trim());
  const challengeRequired = !adminBypassEnabled && !proxyMode;
  // A proxy forwards Ragportfolio's answer, which already honors the portfolio's citation policy, so
  // citations render unless the site turns them off.
  const citationsVisible = showCitations ?? (portfolioMode ? portfolioCitationsVisible : proxyMode);

  useEffect(() => {
    if (resolvedTransport.error) setConfigError(resolvedTransport.error);
  }, [resolvedTransport.error]);

  useEffect(() => {
    if (!portfolioMode) {
      setIsPortfolioConfigLoading(false);
      return;
    }
    let isCancelled = false;
    setIsPortfolioConfigLoading(true);
    setConfigError(null);
    setResolvedTurnstileCData(undefined);
    if (turnstileSiteKey === undefined) setResolvedTurnstileSiteKey(null);
    const address = activeTransport?.mode === "direct" ? activeTransport.address : null;
    fetchPortfolioEmbedConfig({backendUrl: activeTransport?.mode === "direct" ? activeTransport.backendUrl : resolvedBackendUrl, portfolioSlug: address?.kind === "slug" ? address.value : undefined, portfolioToken: address?.kind === "token" ? address.value : undefined})
      .then((config) => {
        if (isCancelled) return;
        if (turnstileSiteKey === undefined) setResolvedTurnstileSiteKey(config.turnstileSiteKey);
        setResolvedTurnstileAction(turnstileAction ?? config.turnstileAction);
        setResolvedTurnstileCData(config.turnstileCData);
        setPortfolioCitationsVisible(config.showCitations);
        setConfigError(null);
        setIsPortfolioConfigLoading(false);
      })
      .catch((error) => {
        if (!isCancelled) {
          setConfigError(error instanceof Error ? error.message : String(error));
          setIsPortfolioConfigLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [activeTransport, portfolioMode, resolvedBackendUrl, turnstileAction, turnstileSiteKey]);

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
    if (portfolioMode || !shouldFetchAppConfig || turnstileSiteKey !== undefined || !challengeRequired) {
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
  }, [challengeRequired, portfolioMode, resolvedBackendUrl, shouldFetchAppConfig, turnstileAction, turnstileSiteKey]);

  const turnstile = useTurnstile(challengeRequired ? resolvedTurnstileSiteKey : null, resolvedTurnstileAction, resolvedTurnstileCData);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => {
    if (!question && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [question]);

  const rootClassName = useMemo(() => slotClass("ragportfolio-ask", classNames?.root, className), [className, classNames?.root]);
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
      const result = activeTransport
        ? await askWithTransport(activeTransport, {question: normalizedQuestion, turnstileToken: challengeRequired ? turnstile.token ?? undefined : undefined})
        : await askQuestion({
          adminToken,
          backendUrl: resolvedBackendUrl,
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
      {labels?.title ? <header id={`${widgetId}-header`} className={slotClass("ragportfolio-ask__header", classNames?.header)} style={styles?.header}>{labels.title}</header> : null}

      <div id={`${widgetId}-thread`} className={slotClass("ragportfolio-ask__thread", classNames?.thread)} style={styles?.thread} ref={threadRef}>
        {turns.length === 0 ? (
          <div id={`${widgetId}-empty`} className={slotClass("ragportfolio-ask__empty", classNames?.empty)} style={styles?.empty}>{labels?.empty ?? "Ask a question to get started."}</div>
        ) : null}

        {turns.map((turn, turnIndex) => {
          const turnId = `${widgetId}-turn-${turnIndex + 1}`;
          return (
            <article id={turnId} key={turn.id} className={slotClass("ragportfolio-ask__exchange", classNames?.exchange)} style={styles?.exchange}>
              <div id={`${turnId}-question`} className={slotClass("ragportfolio-ask__bubble ragportfolio-ask__bubble--user", classNames?.question)} style={styles?.question}>{turn.question}</div>
              {turn.result === null && !turn.error ? (
                <div id={`${turnId}-loading`} className={slotClass("ragportfolio-ask__bubble ragportfolio-ask__bubble--assistant ragportfolio-ask__bubble--loading", classNames?.loading)} style={styles?.loading}>
                  {labels?.loading ?? <span id={`${turnId}-loading-dots`} className="ragportfolio-ask__dots">
                    <span id={`${turnId}-loading-dot-1`} />
                    <span id={`${turnId}-loading-dot-2`} />
                    <span id={`${turnId}-loading-dot-3`} />
                  </span>}
                </div>
              ) : turn.error ? (
                <p id={`${turnId}-error`} className={slotClass("ragportfolio-ask__error", classNames?.error)} style={styles?.error}>{turn.error}</p>
              ) : turn.result ? (
                <AnswerBubble classNames={classNames} idPrefix={turnId} labels={labels} result={turn.result} showCitations={citationsVisible} showStaleWarnings={showStaleWarnings} styles={styles} />
              ) : null}
            </article>
          );
        })}
      </div>

      <div id={`${widgetId}-composer`} className={slotClass("ragportfolio-ask__composer", classNames?.composer)} style={styles?.composer}>
        {challengeRequired ? (
          <div
            id={`${widgetId}-turnstile`}
            className={slotClass(`ragportfolio-ask__turnstile${turnstile.token ? " ragportfolio-ask__turnstile--verified" : ""}`, classNames?.turnstile)}
            style={styles?.turnstile}
            hidden={Boolean(turnstile.token)}
          >
            <div id={`${widgetId}-turnstile-label`} className="ragportfolio-ask__turnstile-label">{labels?.turnstileLabel ?? "Turnstile"}</div>
            {configError ? <p id={`${widgetId}-config-error`} className={slotClass("ragportfolio-ask__error", classNames?.error)} style={styles?.error}>{configError}</p> : null}
            {resolvedTurnstileSiteKey ? (
              <div id={`${widgetId}-turnstile-widget`} className="ragportfolio-ask__turnstile-widget">
                <div id={`${widgetId}-turnstile-container`} ref={turnstile.containerRef} />
                {turnstile.error ? <p id={`${widgetId}-turnstile-error`} className={slotClass("ragportfolio-ask__error", classNames?.error)} style={styles?.error}>{turnstile.error}</p> : null}
              </div>
            ) : isPortfolioConfigLoading ? (
              <p id={`${widgetId}-turnstile-loading`} className="ragportfolio-ask__turnstile-label">Loading verification…</p>
            ) : !configError ? (
              <p id={`${widgetId}-turnstile-missing`} className={slotClass("ragportfolio-ask__error", classNames?.error)} style={styles?.error}>Turnstile is not configured.</p>
            ) : null}
          </div>
        ) : null}

        {formError ? <p id={`${widgetId}-form-error`} className={slotClass("ragportfolio-ask__error", classNames?.error)} style={styles?.error}>{formError}</p> : null}

        <form id={`${widgetId}-form`} className={slotClass("ragportfolio-ask__form", classNames?.form)} style={styles?.form} onSubmit={handleSubmit}>
          <textarea
            id={`${widgetId}-input`}
            ref={textareaRef}
            className={slotClass("ragportfolio-ask__input", classNames?.input, inputClassName)}
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
          <button id={`${widgetId}-send`} type="submit" className={slotClass("ragportfolio-ask__send", classNames?.send)} style={styles?.send} disabled={!canSubmit} aria-label={labels?.sendLabel ?? "Send"}>
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
    <div id={`${idPrefix}-response`} className={slotClass("ragportfolio-ask__bubble ragportfolio-ask__bubble--assistant", classNames?.response)} style={styles?.response}>
      {showStaleWarnings && result.staleRepos.length > 0 ? (
        <div id={`${idPrefix}-warning`} className={slotClass("ragportfolio-ask__warning", classNames?.warning)} style={styles?.warning}>
          Code embeddings may be outdated for {result.staleRepos.map((repo) => repo.name).join(", ")}.
        </div>
      ) : null}
      <div id={`${idPrefix}-answer`} className={slotClass("ragportfolio-ask__answer", classNames?.answer)} style={styles?.answer}>{renderAnswerMarkdown(result.answer, `${idPrefix}-answer`)}</div>
      {showCitations && result.citations.length > 0 ? (
        <details id={`${idPrefix}-citations`} className={slotClass("ragportfolio-ask__citations", classNames?.citations)} style={styles?.citations}>
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
        <ul id={blockId} key={`list-${blockIndex}`} className="ragportfolio-ask__answer-list">
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

type AskWidgetVariableStyle = CSSProperties & {[name: `--ragportfolio-ask-${string}`]: string | undefined};

function appearanceStyle(appearance?: AskWidgetAppearance): AskWidgetVariableStyle {
  return {
    "--ragportfolio-ask-accent": appearance?.accentColor,
    "--ragportfolio-ask-accent-text": appearance?.accentTextColor,
    "--ragportfolio-ask-assistant-bg": appearance?.assistantBackground,
    "--ragportfolio-ask-bg": appearance?.background,
    "--ragportfolio-ask-border": appearance?.borderColor,
    "--ragportfolio-ask-bubble-max-width": appearance?.bubbleMaxWidth,
    "--ragportfolio-ask-bubble-padding": appearance?.bubblePadding,
    "--ragportfolio-ask-composer-gap": appearance?.composerGap,
    "--ragportfolio-ask-error": appearance?.errorColor,
    "--ragportfolio-ask-focus-ring": appearance?.focusRing,
    "--ragportfolio-ask-font-family": appearance?.fontFamily,
    "--ragportfolio-ask-font-size": appearance?.fontSize,
    "--ragportfolio-ask-gap": appearance?.gap,
    "--ragportfolio-ask-input-bg": appearance?.inputBackground,
    "--ragportfolio-ask-input-max-height": appearance?.inputMaxHeight,
    "--ragportfolio-ask-input-min-height": appearance?.inputMinHeight,
    "--ragportfolio-ask-max-width": appearance?.maxWidth,
    "--ragportfolio-ask-min-height": appearance?.minHeight,
    "--ragportfolio-ask-muted": appearance?.mutedColor,
    "--ragportfolio-ask-padding": appearance?.padding,
    "--ragportfolio-ask-radius": appearance?.borderRadius,
    "--ragportfolio-ask-shadow": appearance?.shadow,
    "--ragportfolio-ask-send-size": appearance?.sendButtonSize,
    "--ragportfolio-ask-text": appearance?.textColor,
    "--ragportfolio-ask-thread-max-height": appearance?.threadMaxHeight,
    "--ragportfolio-ask-thread-min-height": appearance?.threadMinHeight,
    "--ragportfolio-ask-user-bg": appearance?.userBackground,
    "--ragportfolio-ask-user-text": appearance?.userTextColor,
    "--ragportfolio-ask-warning-bg": appearance?.warningBackground,
    "--ragportfolio-ask-warning-text": appearance?.warningTextColor
  };
}
