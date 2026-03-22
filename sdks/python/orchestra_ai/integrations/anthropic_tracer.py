"""Anthropic SDK integration for OrchestraAI.

Patches ``anthropic.Anthropic().messages.create`` to automatically capture
LLM calls with Claude-specific token usage (input_tokens, output_tokens).

Usage::

    from orchestra_ai.integrations import anthropic_tracer
    anthropic_tracer.auto_instrument(oa)

    # All Anthropic messages.create calls are now traced
    response = client.messages.create(model="claude-sonnet-4-20250514", ...)
"""

from __future__ import annotations

import functools
import time
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

from ..token_extraction import extract_token_usage
from ..types import IngestEvent

if TYPE_CHECKING:
    from ..client import OrchestraAI

_client: Optional["OrchestraAI"] = None
_original_create: Any = None
_original_acreate: Any = None


def auto_instrument(client: "OrchestraAI") -> None:
    """Patch Anthropic SDK to send LLM call traces to OrchestraAI."""
    global _client, _original_create, _original_acreate
    _client = client

    try:
        from anthropic.resources import Messages
    except ImportError:
        raise ImportError("Anthropic is not installed. Install with: pip install anthropic")

    _original_create = Messages.create

    @functools.wraps(_original_create)
    def patched_create(self: Any, *args: Any, **kwargs: Any) -> Any:
        start = time.time()
        result = _original_create(self, *args, **kwargs)
        _record_call(result, kwargs, start)
        return result

    Messages.create = patched_create

    # Patch async
    try:
        from anthropic.resources import AsyncMessages
        _original_acreate = AsyncMessages.create

        @functools.wraps(_original_acreate)
        async def patched_acreate(self: Any, *args: Any, **kwargs: Any) -> Any:
            start = time.time()
            result = await _original_acreate(self, *args, **kwargs)
            _record_call(result, kwargs, start)
            return result

        AsyncMessages.create = patched_acreate
    except (ImportError, AttributeError):
        pass


def _record_call(result: Any, kwargs: dict, start: float) -> None:
    if not _client or not _client.enabled:
        return

    latency_ms = int((time.time() - start) * 1000)
    usage = extract_token_usage(result)
    model = usage.model or kwargs.get("model", "claude")

    # Extract output
    output_preview = None
    content = getattr(result, "content", None)
    if content and isinstance(content, list) and len(content) > 0:
        first = content[0]
        text = getattr(first, "text", None)
        if text:
            output_preview = text[:500]

    # Extract input
    input_preview = None
    messages = kwargs.get("messages")
    if messages and len(messages) > 0:
        last = messages[-1]
        content_val = last.get("content", "") if isinstance(last, dict) else str(last)
        input_preview = str(content_val)[:500] if content_val else None

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    event = IngestEvent(
        type="llm_call",
        traceId=str(uuid.uuid4()),
        spanId=str(uuid.uuid4()),
        name=f"llm:{model}",
        startTime=now_ms - latency_ms,
        endTime=now_ms,
        status="completed",
        model=model,
        promptTokens=usage.input_tokens,
        completionTokens=usage.output_tokens,
        input=input_preview,
        output=output_preview,
        metadata={"framework": "anthropic", "auto_instrumented": True},
    )

    try:
        _client.send_event(event)
    except Exception:
        pass


def remove_instrumentation() -> None:
    """Restore original Anthropic SDK methods."""
    global _client, _original_create, _original_acreate

    if _original_create:
        try:
            from anthropic.resources import Messages
            Messages.create = _original_create
        except ImportError:
            pass

    if _original_acreate:
        try:
            from anthropic.resources import AsyncMessages
            AsyncMessages.create = _original_acreate
        except ImportError:
            pass

    _client = None
    _original_create = None
    _original_acreate = None
