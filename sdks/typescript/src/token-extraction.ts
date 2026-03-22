/**
 * Auto-extract token usage, model name from LLM responses.
 *
 * Supports: OpenAI, Anthropic, Google/Gemini, LiteLLM, and plain objects.
 * Uses duck-typing — no provider SDKs imported.
 */

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
}

/**
 * Extract token usage from an LLM response object.
 *
 * Supported shapes:
 *  - OpenAI ChatCompletion: response.usage.prompt_tokens / completion_tokens
 *  - Anthropic Message: response.usage.input_tokens / output_tokens
 *  - Google Gemini: response.usageMetadata.promptTokenCount / candidatesTokenCount
 *  - Any dict/object with a "usage" key containing the above
 */
export function extractTokenUsage(response: unknown): TokenUsage {
  if (response == null || typeof response !== 'object') {
    return {};
  }

  const obj = response as Record<string, unknown>;
  const model = toStr(obj.model);

  // Standard usage object (OpenAI, Anthropic, LiteLLM)
  const usage = obj.usage;
  if (usage != null && typeof usage === 'object') {
    return parseUsageObject(usage as Record<string, unknown>, model);
  }

  // Google/Gemini format
  const usageMetadata = obj.usageMetadata ?? obj.usage_metadata;
  if (usageMetadata != null && typeof usageMetadata === 'object') {
    const meta = usageMetadata as Record<string, unknown>;
    return {
      inputTokens: toInt(meta.promptTokenCount ?? meta.prompt_token_count),
      outputTokens: toInt(meta.candidatesTokenCount ?? meta.candidates_token_count),
      totalTokens: toInt(meta.totalTokenCount ?? meta.total_token_count),
      model,
    };
  }

  return { model };
}

function parseUsageObject(
  usage: Record<string, unknown>,
  model?: string,
): TokenUsage {
  // OpenAI: prompt_tokens / completion_tokens
  // Anthropic: input_tokens / output_tokens
  const inputTokens = toInt(usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.inputTokens);
  const outputTokens = toInt(usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? usage.outputTokens);
  const totalTokens = toInt(usage.total_tokens ?? usage.totalTokens)
    ?? (inputTokens != null || outputTokens != null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined);

  return { inputTokens, outputTokens, totalTokens, model };
}

function toInt(val: unknown): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? Math.floor(n) : undefined;
}

function toStr(val: unknown): string | undefined {
  if (typeof val === 'string' && val.length > 0) return val;
  return undefined;
}
