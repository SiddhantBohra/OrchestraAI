"""OpenAI SDK integration for OrchestraAI.

Patches ``openai.resources.chat.Completions.create`` to automatically
capture LLM calls with token usage, model info, and latency.

Supports both regular and streaming responses. For streaming, the wrapper
transparently yields chunks while accumulating content and usage, then
records the trace on stream completion.

Usage::

    from orchestra_ai import OrchestraAI
    from orchestra_ai.integrations import openai_agents_tracer

    oa = OrchestraAI(api_key="...")
    openai_agents_tracer.auto_instrument(oa)

    # All OpenAI chat completions are now traced (including stream=True)
"""

from __future__ import annotations

import functools
import time
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Iterator, Optional

from ..token_extraction import extract_token_usage
from ..types import IngestEvent

if TYPE_CHECKING:
    from ..client import OrchestraAI

_client: Optional["OrchestraAI"] = None
_original_create: Any = None
_original_acreate: Any = None


class _OpenAIStreamWrapper:
    """Wraps an OpenAI streaming response to capture usage and content."""

    def __init__(self, stream: Any, kwargs: dict, start: float) -> None:
        self._stream = stream
        self._kwargs = kwargs
        self._start = start
        self._ttft: Optional[float] = None
        self._accumulated_content: list[str] = []
        self._tool_calls: list[Any] = []
        self._prompt_tokens: Optional[int] = None
        self._completion_tokens: Optional[int] = None
        self._model: Optional[str] = None

    def _process_chunk(self, chunk: Any) -> Any:
        # Track model
        if not self._model and hasattr(chunk, "model") and chunk.model:
            self._model = chunk.model

        # Track time-to-first-token
        if self._ttft is None:
            if (hasattr(chunk, "choices") and chunk.choices
                    and hasattr(chunk.choices[0], "delta")):
                delta = chunk.choices[0].delta
                if getattr(delta, "content", None):
                    self._ttft = time.time() - self._start

        # Accumulate content
        if hasattr(chunk, "choices") and chunk.choices:
            delta = chunk.choices[0].delta
            if hasattr(delta, "content") and delta.content:
                self._accumulated_content.append(delta.content)
            if hasattr(delta, "tool_calls") and delta.tool_calls:
                self._tool_calls.extend(delta.tool_calls)

        # Extract usage from the final chunk (when stream_options.include_usage is set)
        if hasattr(chunk, "usage") and chunk.usage is not None:
            self._prompt_tokens = getattr(chunk.usage, "prompt_tokens", None)
            self._completion_tokens = getattr(chunk.usage, "completion_tokens", None)

        return chunk

    def _finalize(self) -> None:
        model = self._model or self._kwargs.get("model", "unknown")
        output_text = "".join(self._accumulated_content)

        metadata: dict[str, Any] = {
            "framework": "openai",
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
            content = last.get("content", "") if isinstance(last, dict) else str(last)
            input_preview = str(content)[:500] if content else None

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
            promptTokens=self._prompt_tokens,
            completionTokens=self._completion_tokens,
            input=input_preview,
            output=output_text[:500] if output_text else None,
            metadata=metadata,
        )

        try:
            if _client and _client.enabled:
                _client.send_event(event)
        except Exception:
            pass

    def __iter__(self) -> "_OpenAIStreamWrapper":
        return self

    def __next__(self) -> Any:
        try:
            chunk = next(self._stream)
            return self._process_chunk(chunk)
        except StopIteration:
            self._finalize()
            raise

    async def __aiter__(self):
        try:
            async for chunk in self._stream:
                yield self._process_chunk(chunk)
        finally:
            self._finalize()

    def __enter__(self) -> "_OpenAIStreamWrapper":
        if hasattr(self._stream, "__enter__"):
            self._stream.__enter__()
        return self

    def __exit__(self, *args: Any) -> None:
        self._finalize()
        if hasattr(self._stream, "__exit__"):
            self._stream.__exit__(*args)

    async def __aenter__(self) -> "_OpenAIStreamWrapper":
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


def _ensure_stream_usage(kwargs: dict) -> None:
    """Auto-set stream_options.include_usage so usage is reported in the last chunk."""
    if kwargs.get("stream"):
        stream_options = kwargs.get("stream_options") or {}
        if not stream_options.get("include_usage"):
            stream_options["include_usage"] = True
            kwargs["stream_options"] = stream_options


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
        is_stream = kwargs.get("stream", False)
        if is_stream:
            _ensure_stream_usage(kwargs)
            result = _original_create(self, *args, **kwargs)
            return _OpenAIStreamWrapper(result, kwargs, start)
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
            is_stream = kwargs.get("stream", False)
            if is_stream:
                _ensure_stream_usage(kwargs)
                result = await _original_acreate(self, *args, **kwargs)
                return _OpenAIStreamWrapper(result, kwargs, start)
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
