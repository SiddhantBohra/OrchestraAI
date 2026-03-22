"""Auto-extract token usage, model name, and cost from LLM responses.

Supports: OpenAI, Anthropic, Google/Gemini, LiteLLM, and dict-based responses.
"""

from __future__ import annotations

from typing import Any, Optional


class TokenUsage:
    """Extracted token usage from an LLM response."""

    __slots__ = (
        "input_tokens", "output_tokens", "total_tokens", "model",
        "cache_read_tokens", "cache_creation_tokens",
    )

    def __init__(
        self,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        total_tokens: Optional[int] = None,
        model: Optional[str] = None,
        cache_read_tokens: Optional[int] = None,
        cache_creation_tokens: Optional[int] = None,
    ):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.total_tokens = total_tokens or (
            (input_tokens or 0) + (output_tokens or 0)
            if input_tokens is not None or output_tokens is not None
            else None
        )
        self.model = model
        self.cache_read_tokens = cache_read_tokens
        self.cache_creation_tokens = cache_creation_tokens

    @property
    def has_tokens(self) -> bool:
        return self.input_tokens is not None or self.output_tokens is not None


def extract_token_usage(response: Any) -> TokenUsage:
    """Extract token usage from an LLM response object.

    Inspects the response using duck-typing to support multiple providers
    without importing their SDKs.

    Supported formats:
        - OpenAI ChatCompletion: response.usage.prompt_tokens / completion_tokens
        - Anthropic Message: response.usage.input_tokens / output_tokens
        - Google Gemini: response.usage_metadata.prompt_token_count / candidates_token_count
        - LiteLLM ModelResponse: response.usage (OpenAI-compatible)
        - Dict with "usage" key (any of the above shapes)
        - LangChain LLMResult: response.llm_output["token_usage"]
    """
    if response is None:
        return TokenUsage()

    # ── Try object attributes first ────────────────────────────
    usage = _get_attr_or_key(response, "usage")
    model = _get_attr_or_key(response, "model")

    if usage is not None:
        return _parse_usage_object(usage, model)

    # ── Google/Gemini format ───────────────────────────────────
    usage_metadata = _get_attr_or_key(response, "usage_metadata")
    if usage_metadata is not None:
        return TokenUsage(
            input_tokens=_get_attr_or_key(usage_metadata, "prompt_token_count"),
            output_tokens=_get_attr_or_key(usage_metadata, "candidates_token_count"),
            total_tokens=_get_attr_or_key(usage_metadata, "total_token_count"),
            model=model,
        )

    # ── LangChain LLMResult format ─────────────────────────────
    llm_output = _get_attr_or_key(response, "llm_output")
    if llm_output is not None:
        token_usage = _get_attr_or_key(llm_output, "token_usage")
        if token_usage is not None:
            return _parse_usage_object(token_usage, model or _get_attr_or_key(llm_output, "model_name"))

    return TokenUsage(model=model)


def _parse_usage_object(usage: Any, model: Optional[str] = None) -> TokenUsage:
    """Parse a usage object that could be OpenAI, Anthropic, Bedrock, Cohere, or dict format."""
    # OpenAI: prompt_tokens / completion_tokens
    # Anthropic: input_tokens / output_tokens
    # Bedrock: inputTokens / outputTokens
    # Cohere: billed_units.input_tokens / output_tokens
    input_t = (
        _get_attr_or_key(usage, "prompt_tokens")
        or _get_attr_or_key(usage, "input_tokens")
        or _get_attr_or_key(usage, "inputTokens")
    )
    output_t = (
        _get_attr_or_key(usage, "completion_tokens")
        or _get_attr_or_key(usage, "output_tokens")
        or _get_attr_or_key(usage, "outputTokens")
    )
    total_t = (
        _get_attr_or_key(usage, "total_tokens")
        or _get_attr_or_key(usage, "totalTokens")
    )

    # Anthropic cache metrics
    cache_read = _get_attr_or_key(usage, "cache_read_input_tokens")
    cache_creation = _get_attr_or_key(usage, "cache_creation_input_tokens")

    # Cohere billed_units fallback
    if input_t is None:
        billed = _get_attr_or_key(usage, "billed_units")
        if billed:
            input_t = _get_attr_or_key(billed, "input_tokens")
            output_t = output_t or _get_attr_or_key(billed, "output_tokens")

    return TokenUsage(
        input_tokens=_to_int(input_t),
        output_tokens=_to_int(output_t),
        total_tokens=_to_int(total_t),
        model=model,
        cache_read_tokens=_to_int(cache_read),
        cache_creation_tokens=_to_int(cache_creation),
    )


def _get_attr_or_key(obj: Any, key: str) -> Any:
    """Get a value by attribute or dict key, returning None if missing."""
    if obj is None:
        return None
    # Try attribute first (for SDK response objects)
    val = getattr(obj, key, None)
    if val is not None:
        return val
    # Try dict key
    if isinstance(obj, dict):
        return obj.get(key)
    return None


def _to_int(val: Any) -> Optional[int]:
    """Safely convert a value to int."""
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None
