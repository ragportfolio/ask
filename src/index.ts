import "./styles.css";

export { AskWidget, DEFAULT_EMPTY_MESSAGE, AskWidget as RagportfolioAsk } from "./AskWidget";
export { askQuestion, askViaProxy, askWithTransport, fetchAppConfig, fetchPortfolioEmbedConfig } from "./client";
export { resolveTransport, TransportConfigurationError } from "./transport";
export type {
  AppConfigPayload,
  AskRequestInput,
  AskResult,
  AskTransport,
  AskTurn,
  AskWidgetAppearance,
  AskWidgetClassNames,
  AskWidgetLabels,
  AskWidgetProps,
  AskWidgetProps as RagportfolioAskProps,
  AskWidgetSlot,
  AskWidgetStyles,
  Citation,
  PortfolioEmbedConfig,
  ResolvedTransport,
  SearchHit,
  StaleRepoWarning
} from "./types";
