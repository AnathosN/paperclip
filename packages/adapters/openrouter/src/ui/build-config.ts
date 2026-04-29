// ─────────────────────────────────────────────────────────────────
// @paperclipai/adapter-openrouter — UI Build Config
// Converts onboarding/settings form values → adapterConfig JSON
// ─────────────────────────────────────────────────────────────────

export interface OpenRouterFormValues {
  model?: string;
  apiKey?: string;
  systemPrompt?: string;
  temperature?: string;
  maxTokens?: string;
  topP?: string;
  stream?: string | boolean;
  reasoning?: string | boolean;
  transforms?: string;
  route?: string;
  httpReferer?: string;
  xTitle?: string;
}

/**
 * Convert UI form values into the adapterConfig object
 * stored in the Paperclip database for this agent.
 */
export function buildConfig(
  formValues: OpenRouterFormValues
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  // Required
  config.model = formValues.model || "openrouter/auto";

  // API key (stored as secret via Paperclip's secret provider)
  if (formValues.apiKey) {
    config.apiKey = formValues.apiKey;
  }

  // Optional text fields
  if (formValues.systemPrompt) {
    config.systemPrompt = formValues.systemPrompt;
  }

  // Numeric fields
  if (formValues.temperature !== undefined && formValues.temperature !== "") {
    config.temperature = parseFloat(formValues.temperature);
  }
  if (formValues.maxTokens !== undefined && formValues.maxTokens !== "") {
    config.maxTokens = parseInt(formValues.maxTokens, 10);
  }
  if (formValues.topP !== undefined && formValues.topP !== "") {
    config.topP = parseFloat(formValues.topP);
  }

  // Boolean fields
  config.stream = formValues.stream === true || formValues.stream === "true";
  if (formValues.reasoning === true || formValues.reasoning === "true") {
    config.reasoning = true;
  }

  // Transforms (comma-separated string → array)
  if (formValues.transforms) {
    config.transforms = formValues.transforms
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // Route
  if (formValues.route && ["fallback", "no-fallback"].includes(formValues.route)) {
    config.route = formValues.route;
  }

  // Leaderboard attribution
  if (formValues.httpReferer) config.httpReferer = formValues.httpReferer;
  if (formValues.xTitle) config.xTitle = formValues.xTitle;

  return config;
}

/**
 * Define the config form fields for Paperclip's UI.
 * Each field maps to a form input in the agent configuration panel.
 */
export const configFields = [
  {
    key: "model",
    label: "Model",
    type: "combobox" as const,
    required: true,
    default: "openai/gpt-4o-mini",
    hint: "OpenRouter model ID, for example openai/gpt-4o-mini or openrouter/auto. API key is read from OPENROUTER_API_KEY.",
  },
  {
    key: "systemPrompt",
    label: "System Prompt",
    type: "textarea" as const,
    required: false,
    hint: "Optional system prompt prepended to all runs.",
  },
  {
    key: "temperature",
    label: "Temperature",
    type: "number" as const,
    required: false,
    default: 0.2,
    hint: "Sampling temperature. Recommended 0.2 for management/automation tasks.",
  },
  {
    key: "maxTokens",
    label: "Max Tokens",
    type: "number" as const,
    required: false,
    default: 4096,
    hint: "Maximum output tokens.",
  },
  {
    key: "reasoning",
    label: "Enable Reasoning",
    type: "toggle" as const,
    default: false,
    hint: "Only enable for OpenRouter models that support extended reasoning.",
  },
  {
    key: "route",
    label: "Routing Strategy",
    type: "select" as const,
    options: [
      { value: "fallback", label: "Fallback" },
      { value: "no-fallback", label: "No Fallback" },
    ],
    default: "fallback",
    hint: "OpenRouter provider routing strategy.",
  },
];
