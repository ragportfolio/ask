import "./styles.css";

export { AskWidget, AskWidget as RagportfolioAsk } from "./AskWidget";
export { askQuestion, fetchAppConfig } from "./client";
export type {
  AppConfigPayload,
  AskRequestInput,
  AskResult,
  AskTurn,
  AskWidgetAppearance,
  AskWidgetClassNames,
  AskWidgetLabels,
  AskWidgetProps,
  AskWidgetProps as RagportfolioAskProps,
  AskWidgetSlot,
  AskWidgetStyles,
  Citation,
  SearchHit,
  StaleRepoWarning
} from "./types";
