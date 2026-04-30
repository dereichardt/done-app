/**
 * Shared LLM client for AI features.
 *
 * This module is the single seam where we pick the model + provider used by
 * every AI-powered feature in the app. To switch providers (Anthropic, Gemini,
 * a local model, etc.) change the exports here and every feature updates at once.
 *
 * Current default: OpenAI `gpt-4o-mini` via `@ai-sdk/openai`. Good price/quality
 * for summarization, tagging, and short-form generation. Reasoning-heavy
 * features should import a different model (e.g. `gpt-4o`) explicitly rather
 * than changing this default.
 *
 * Secrets: reads `process.env.OPENAI_API_KEY` at runtime. Never import this
 * module into client components.
 */

import { openai } from "@ai-sdk/openai";

/** Model id string we persist alongside generated content so rows are auditable. */
export const DEFAULT_SUMMARIZATION_MODEL_ID = "openai:gpt-4o-mini" as const;

/** Default model for short-form summarization tasks. */
export const defaultSummarizationModel = openai("gpt-4o-mini");

/** Cap for summary-style outputs (by-integration sections need headroom). */
export const DEFAULT_MAX_OUTPUT_TOKENS = 1200;

/**
 * Whether AI features are configured in this environment. UI can render a
 * graceful "not configured" state instead of firing requests that will fail.
 */
export function isAiConfigured(): boolean {
  return typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.length > 0;
}
