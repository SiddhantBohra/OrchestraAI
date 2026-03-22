"""Anthropic SDK integration for OrchestraAI.

Patches ``anthropic.Anthropic().messages.create`` to automatically capture
LLM calls with Claude-specific token usage (input_tokens, output_tokens).

Supports both regular and streaming responses. For streaming, the wrapper
transparently yields events while accumulating content and usage, then
records the trace on stream completion.

Usage::

    from orchestra_ai.integrations import anthropic_tracer
    anthropic_tracer.auto_instrument(oa)

    # All Anthropic messages.create calls are now traced (including stream=True)
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


class _AnthropicStreamWrapper:
    """Wraps an Anthropic streaming response to capture usage and content."""

    def __init__(self, stream: Any, kwargs: dict, start: float) -> None:
        self._stream = stream
        self._kwargs = kwargs
        self._start = start
        self._ttft: Optional[float] = None
        self._accumulated_content: list[str] = []
        self._input_tokens: Optional[int] = None
        self._output_tokens: Optional[int] = None
        self._model: Optional[str] = None

    def _process_event(self, event: Any) -> Any:
        event_type = getattr(event, "type", None)

        # message_start contains the message metadata and input_tokens
        if event_type == "message_start":
            message = getattr(event, "message", None)
            if message:
                if not self._model and hasattr(message, "model"):
                    self._model = message.model
                usage = getattr(message, "usage", None)
                if usage:
                    self._input_tokens = getattr(usage, "input_tokens", None)

        # content_block_delta contains streamed text
        elif event_type == "content_block_delta":
            delta = getattr(event, "delta", None)
            if delta:
                text = getattr(delta, "text", None)
                if text:
                    # Track time-to-first-token
                    if self._ttft is None:
                        self._ttft = time.time() - self._start
                    self._accumulated_content.append(text)

        # message_delta contains output_tokens usage
        elif event_type == "message_delta":
            usage = getattr(event, "usage", None)
            if usage:
                self._output_tokens = getattr(usage, "output_tokens", None)

        return event

    def _finalize(self) -> None:
        model = self._model or self._kwargs.get("model", "claude")
        output_text = "".join(self._accumulated_content)

        metadata: dict[str, Any] = {
            "framework": "anthropic",
            "auto_instrumented": True,
            "streaming": True,
        }
        if self._ttft is not None:
            metadata["time_to_first_token_ms"] = int(self._ttft * 1000)

        # Extract input preview
        input_preview = None
        messages = self._kwargs.get("messages")
        if messages and len(messages) > 0:
            last = messages[-1]
            content_val = last.get("content", "") if isinstance(last, dict) else str(last)
            input_preview = str(content_val)[:500] if content_val else None

        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        latency_ms = int((time.time() - self._start) * 1000)

        event = IngestEvent(
            type="llm_call",
            traceId=str(uuid.uuid4()),
            spanId=str(uuid.uuid4()),
            name=f"llm:{model}",
            startTime=now_ms - latency_ms,
            endTime=now_ms,
            status="completed",
            model=model,
            promptTokens=self._input_tokens,
            completionTokens=self._output_tokens,
            input=input_preview,
            output=output_text[:500] if output_text else None,
            metadata=metadata,
        )

        try:
            if _client and _client.enabled:
                _client.send_event(event)
        except Exception:
            pass

    def __iter__(self) -> "_AnthropicStreamWrapper":
        return self

    def __next__(self) -> Any:
        try:
            event = next(self._stream)
            return self._process_event(event)
        except StopIteration:
            self._finalize()
            raise

    async def __aiter__(self):
        try:
            async for event in self._stream:
                yield self._process_event(event)
        finally:
            self._finalize()

    def __enter__(self) -> "_AnthropicStreamWrapper":
        if hasattr(self._stream, "__enter__"):
            self._stream.__enter__()
        return self

    def __exit__(self, *args: Any) -> None:
        self._finalize()
        if hasattr(self._stream, "__exit__"):
            self._stream.__exit__(*args)

    async def __aenter__(self) -> "_AnthropicStreamWrapper":
        if hasattr(self._stream, "__aenter__"):
            await self._stream.__aenter__()
        return self

    async def __aexit__(self, *args: Any) -> None:
        self._finalize()
        if hasattr(self._stream, "__aexit__"):
            await self._stream.__aexit__(*args)

    # Proxy any other attributes to the underlying stream
    def __getattr__(self, name: str) -> Any:
        return getattr(self._stream, name)


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
        is_stream = kwargs.get("stream", False)
        if is_stream:
            result = _original_create(self, *args, **kwargs)
            return _AnthropicStreamWrapper(result, kwargs, start)
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
            is_stream = kwargs.get("stream", False)
            if is_stream:
                result = await _original_acreate(self, *args, **kwargs)
                return _AnthropicStreamWrapper(result, kwargs, start)
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
