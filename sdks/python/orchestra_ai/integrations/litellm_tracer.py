"""LiteLLM integration for OrchestraAI.

LiteLLM is an OpenAI-compatible proxy for 100+ LLM providers. Since it
returns OpenAI-format responses, the openai_agents_tracer auto-patch works.
This module provides a dedicated LiteLLM callback for deeper integration.

Usage::

    from orchestra_ai.integrations import litellm_tracer
    litellm_tracer.auto_instrument(oa)

    import litellm
    response = litellm.completion(model="gpt-4o", messages=[...])
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
_original_completion: Any = None
_original_acompletion: Any = None


def auto_instrument(client: "OrchestraAI") -> None:
    """Patch LiteLLM's completion/acompletion to trace all LLM calls."""
    global _client, _original_completion, _original_acompletion
    _client = client

    try:
        import litellm
    except ImportError:
        raise ImportError("LiteLLM is not installed. Install with: pip install litellm")

    _original_completion = litellm.completion

    @functools.wraps(_original_completion)
    def patched_completion(*args: Any, **kwargs: Any) -> Any:
        start = time.time()
        result = _original_completion(*args, **kwargs)
        _record_call(result, kwargs, start)
        return result

    litellm.completion = patched_completion

    _original_acompletion = getattr(litellm, "acompletion", None)
    if _original_acompletion:
        @functools.wraps(_original_acompletion)
        async def patched_acompletion(*args: Any, **kwargs: Any) -> Any:
            start = time.time()
            result = await _original_acompletion(*args, **kwargs)
            _record_call(result, kwargs, start)
            return result

        litellm.acompletion = patched_acompletion


def _record_call(result: Any, kwargs: dict, start: float) -> None:
    if not _client or not _client.enabled:
        return

    latency_ms = int((time.time() - start) * 1000)
    usage = extract_token_usage(result)
    model = usage.model or kwargs.get("model", "unknown")

    output_preview = None
    if hasattr(result, "choices") and result.choices:
        msg = result.choices[0].message
        content = getattr(msg, "content", None)
        if content:
            output_preview = content[:500]

    input_preview = None
    messages = kwargs.get("messages")
    if messages and len(messages) > 0:
        last = messages[-1]
        content = last.get("content", "") if isinstance(last, dict) else str(last)
        input_preview = str(content)[:500] if content else None

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
        metadata={"framework": "litellm", "auto_instrumented": True},
    )

    try:
        _client.send_event(event)
    except Exception:
        pass


def remove_instrumentation() -> None:
    """Restore original LiteLLM functions."""
    global _client, _original_completion, _original_acompletion

    if _original_completion:
        try:
            import litellm
            litellm.completion = _original_completion
            if _original_acompletion:
                litellm.acompletion = _original_acompletion
        except ImportError:
            pass

    _client = None
    _original_completion = None
    _original_acompletion = None
