"""OpenAI SDK integration for OrchestraAI.

Patches ``openai.resources.chat.Completions.create`` to automatically
capture LLM calls with token usage, model info, and latency.

Usage::

    from orchestra_ai import OrchestraAI
    from orchestra_ai.integrations import openai_agents_tracer

    oa = OrchestraAI(api_key="...")
    openai_agents_tracer.auto_instrument(oa)

    # All OpenAI chat completions are now traced
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
    """Patch OpenAI SDK to send LLM call traces to OrchestraAI."""
    global _client, _original_create, _original_acreate
    _client = client

    try:
        from openai.resources.chat import Completions
    except ImportError:
        raise ImportError("OpenAI is not installed. Install with: pip install openai")

    # Patch sync create
    _original_create = Completions.create

    @functools.wraps(_original_create)
    def patched_create(self: Any, *args: Any, **kwargs: Any) -> Any:
        start = time.time()
        result = _original_create(self, *args, **kwargs)
        _record_call(result, kwargs, start)
        return result

    Completions.create = patched_create

    # Patch async create if available
    try:
        from openai.resources.chat import AsyncCompletions
        _original_acreate = AsyncCompletions.create

        @functools.wraps(_original_acreate)
        async def patched_acreate(self: Any, *args: Any, **kwargs: Any) -> Any:
            start = time.time()
            result = await _original_acreate(self, *args, **kwargs)
            _record_call(result, kwargs, start)
            return result

        AsyncCompletions.create = patched_acreate
    except (ImportError, AttributeError):
        pass


def _record_call(result: Any, kwargs: dict, start: float) -> None:
    """Extract usage from the response and send an event."""
    if not _client or not _client.enabled:
        return

    latency_ms = int((time.time() - start) * 1000)
    usage = extract_token_usage(result)
    model = usage.model or kwargs.get("model", "unknown")

    # Extract output preview
    output_preview = None
    if hasattr(result, "choices") and result.choices:
        message = result.choices[0].message
        content = getattr(message, "content", None)
        if content:
            output_preview = content[:500]

    # Extract input preview from messages
    input_preview = None
    messages = kwargs.get("messages")
    if messages and len(messages) > 0:
        last = messages[-1]
        content = last.get("content", "") if isinstance(last, dict) else str(last)
        input_preview = str(content)[:500] if content else None

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    trace_id = str(uuid.uuid4())
    span_id = str(uuid.uuid4())

    event = IngestEvent(
        type="llm_call",
        traceId=trace_id,
        spanId=span_id,
        name=f"llm:{model}",
        startTime=now_ms - latency_ms,
        endTime=now_ms,
        status="completed",
        model=model,
        promptTokens=usage.input_tokens,
        completionTokens=usage.output_tokens,
        input=input_preview,
        output=output_preview,
        metadata={"framework": "openai", "auto_instrumented": True},
    )

    try:
        _client.send_event(event)
    except Exception:
        pass  # Don't break the app if tracing fails


def remove_instrumentation() -> None:
    """Restore original OpenAI SDK methods."""
    global _client, _original_create, _original_acreate

    if _original_create:
        try:
            from openai.resources.chat import Completions
            Completions.create = _original_create
        except ImportError:
            pass

    if _original_acreate:
        try:
            from openai.resources.chat import AsyncCompletions
            AsyncCompletions.create = _original_acreate
        except ImportError:
            pass

    _client = None
    _original_create = None
    _original_acreate = None
