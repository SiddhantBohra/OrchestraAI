"""Tracing functionality for OrchestraAI SDK"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, Optional

from .token_extraction import TokenUsage, extract_token_usage
from .types import IngestEvent, SpanStatus, TraceType

if TYPE_CHECKING:
    from .client import OrchestraAI


class Span:
    """
    Represents a single span within a trace.
    
    Spans can be nested to create a trace tree.
    """
    
    def __init__(
        self,
        trace: Trace,
        name: str,
        span_type: TraceType,
        parent_span_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.trace = trace
        self.span_id = str(uuid.uuid4())
        self.parent_span_id = parent_span_id or trace.root_span_id
        self.name = name
        self.span_type = span_type
        self.status = SpanStatus.RUNNING
        self.start_time = int(datetime.now(timezone.utc).timestamp() * 1000)
        self.end_time: Optional[int] = None
        self.metadata = metadata or {}
        self._data: Dict[str, Any] = {}
        self._streaming_tokens: list[str] = []

    def add_token(self, token: str) -> None:
        """Accumulate a streaming token. Called by on_llm_new_token."""
        self._streaming_tokens.append(token)

    def set_data(self, **kwargs: Any) -> Span:
        """Set additional data on the span."""
        self._data.update(kwargs)
        return self
    
    def set_error(self, error: Exception) -> Span:
        """Mark the span as failed with an error."""
        self.status = SpanStatus.ERROR
        self._data["error_message"] = str(error)
        self._data["error_type"] = type(error).__name__
        return self
    
    def end(self, status: SpanStatus = SpanStatus.SUCCESS) -> None:
        """End the span and send it to the server."""
        self.end_time = int(datetime.now(timezone.utc).timestamp() * 1000)
        self.status = status if self.status != SpanStatus.ERROR else self.status

        # If streaming tokens were accumulated, join them as output_preview
        if self._streaming_tokens and not self._data.get("output_preview"):
            self._data["output_preview"] = "".join(self._streaming_tokens)[:2000]

        # Auto-extract tokens from response if not manually provided
        response = self._data.get("response")
        if response is not None and self._data.get("input_tokens") is None:
            usage = extract_token_usage(response)
            if usage.has_tokens:
                self._data.setdefault("input_tokens", usage.input_tokens)
                self._data.setdefault("output_tokens", usage.output_tokens)
            if usage.model and not self._data.get("model"):
                self._data["model"] = usage.model

        # Map SDK _data keys to API DTO field names
        event = IngestEvent(
            type=self.span_type.value,
            traceId=self.trace.trace_id,
            spanId=self.span_id,
            parentSpanId=self.parent_span_id,
            name=self.name,
            startTime=self.start_time,
            endTime=self.end_time,
            status=self._map_status(self.status),
            agentId=self.trace.agent_id,
            agentName=self.trace.agent_name,
            sessionId=self.trace.session_id,
            model=self._data.get("model"),
            promptTokens=self._data.get("input_tokens"),
            completionTokens=self._data.get("output_tokens"),
            cost=self._data.get("cost"),
            toolName=self._data.get("tool_name"),
            toolArgs=self._data.get("tool_input"),
            toolResult=str(self._data.get("tool_output", "")) if self._data.get("tool_output") else None,
            input=self._data.get("input_preview"),
            output=self._data.get("output_preview"),
            errorMessage=self._data.get("error_message"),
            errorType=self._data.get("error_type"),
            metadata=self.metadata,
        )
        
        self.trace._pending_events.append(event)
    
    @staticmethod
    def _map_status(status: SpanStatus) -> str:
        """Map SDK SpanStatus to API TraceStatus."""
        mapping = {
            SpanStatus.RUNNING: "started",
            SpanStatus.SUCCESS: "completed",
            SpanStatus.ERROR: "failed",
        }
        return mapping.get(status, "started")
    
    def __enter__(self) -> Span:
        return self
    
    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if exc_val:
            self.set_error(exc_val)
        self.end()


class Trace:
    """
    Represents a complete trace for an agent run.
    
    Usage:
        with oa.trace("my-agent") as trace:
            trace.step("processing")
            result = trace.llm_call(model="gpt-4o", ...)
    """
    
    def __init__(
        self,
        client: OrchestraAI,
        agent_name: str,
        agent_id: Optional[str] = None,
        session_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        enabled: bool = True,
    ):
        self._client = client
        self.agent_name = agent_name
        self.agent_id = agent_id or str(uuid.uuid4())
        self.session_id = session_id or (metadata.get("session_id") if metadata else None)
        self.trace_id = str(uuid.uuid4())
        self.root_span_id = str(uuid.uuid4())
        self.metadata = metadata or {}
        self.enabled = enabled
        self.status = SpanStatus.RUNNING
        self.start_time = int(datetime.now(timezone.utc).timestamp() * 1000)
        self.end_time: Optional[int] = None
        self._pending_events: list[IngestEvent] = []
        self._current_span_id = self.root_span_id
    
    def step(
        self,
        name: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Span:
        """
        Create a new step span.
        
        Args:
            name: Name of the step.
            metadata: Additional metadata.
        
        Returns:
            A Span context manager.
        """
        return Span(
            trace=self,
            name=name,
            span_type=TraceType.STEP,
            parent_span_id=self._current_span_id,
            metadata=metadata,
        )
    
    def tool_call(
        self,
        tool_name: str,
        tool_input: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Span:
        """
        Create a tool call span.
        
        Args:
            tool_name: Name of the tool being called.
            tool_input: Input parameters to the tool.
            metadata: Additional metadata.
        
        Returns:
            A Span context manager.
        """
        span = Span(
            trace=self,
            name=f"tool:{tool_name}",
            span_type=TraceType.TOOL_CALL,
            parent_span_id=self._current_span_id,
            metadata=metadata,
        )
        span.set_data(tool_name=tool_name, tool_input=tool_input)
        return span

    def retriever_call(
        self,
        query: str,
        retriever_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Span:
        """Create a retriever/search span (e.g. vector search, RAG retrieval)."""
        name = f"retriever:{retriever_name}" if retriever_name else "retriever"
        span = Span(
            trace=self,
            name=name,
            span_type=TraceType.RETRIEVER,
            parent_span_id=self._current_span_id,
            metadata=metadata,
        )
        span.set_data(input_preview=query[:500] if query else None)
        return span

    def agent_action(
        self,
        action: str,
        tool_name: Optional[str] = None,
        tool_input: Optional[str] = None,
        thought: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Span:
        """Create an agent reasoning/action span (thought + action decision)."""
        span = Span(
            trace=self,
            name=f"action:{action}",
            span_type=TraceType.AGENT_ACTION,
            parent_span_id=self._current_span_id,
            metadata=metadata,
        )
        span.set_data(
            tool_name=tool_name,
            tool_input={"input": tool_input} if tool_input else None,
            input_preview=thought[:500] if thought else None,
        )
        return span

    def llm_call(
        self,
        model: Optional[str] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        cost: Optional[float] = None,
        latency_ms: Optional[int] = None,
        input_preview: Optional[str] = None,
        output_preview: Optional[str] = None,
        response: Optional[Any] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Span:
        """
        Create an LLM call span.

        Token counts and model name are auto-extracted from ``response``
        when not provided explicitly.

        Args:
            model: Model name. Auto-detected from response when omitted.
            input_tokens: Input token count. Auto-detected from response.
            output_tokens: Output token count. Auto-detected from response.
            latency_ms: Latency in milliseconds.
            input_preview: Preview of the input prompt.
            output_preview: Preview of the output response.
            response: Raw LLM response object (OpenAI, Anthropic, etc.).
                      Tokens and model are auto-extracted from this.
            metadata: Additional metadata.

        Returns:
            A Span context manager.
        """
        # Auto-extract from response when explicit values not given
        if response is not None:
            usage = extract_token_usage(response)
            if input_tokens is None and usage.input_tokens is not None:
                input_tokens = usage.input_tokens
            if output_tokens is None and usage.output_tokens is not None:
                output_tokens = usage.output_tokens
            if model is None and usage.model is not None:
                model = usage.model

        model = model or "unknown"

        span = Span(
            trace=self,
            name=f"llm:{model}",
            span_type=TraceType.LLM_CALL,
            parent_span_id=self._current_span_id,
            metadata=metadata,
        )
        span.set_data(
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost=cost,
            latency_ms=latency_ms,
            input_preview=input_preview,
            output_preview=output_preview,
            response=response,
        )
        return span
    
    def record_llm_call(
        self,
        model: Optional[str] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        latency_ms: int = 0,
        input_preview: Optional[str] = None,
        output_preview: Optional[str] = None,
        response: Optional[Any] = None,
    ) -> None:
        """
        Record an LLM call without using context manager.

        Pass ``response`` to auto-extract tokens and model name.
        """
        with self.llm_call(
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            input_preview=input_preview,
            output_preview=output_preview,
            response=response,
        ):
            pass
    
    def record_tool_call(
        self,
        tool_name: str,
        tool_input: Optional[Dict[str, Any]] = None,
        tool_output: Optional[Any] = None,
        latency_ms: int = 0,
    ) -> None:
        """
        Record a tool call without using context manager.
        
        Useful when you want to record a completed tool call.
        """
        with self.tool_call(tool_name=tool_name, tool_input=tool_input) as span:
            span.set_data(tool_output=tool_output, latency_ms=latency_ms)
    
    def error(
        self,
        error: Exception,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Record an error event."""
        event = IngestEvent(
            type=TraceType.ERROR.value,
            traceId=self.trace_id,
            spanId=str(uuid.uuid4()),
            parentSpanId=self._current_span_id,
            name=f"error:{type(error).__name__}",
            startTime=int(datetime.now(timezone.utc).timestamp() * 1000),
            status="failed",
            agentId=self.agent_id,
            agentName=self.agent_name,
            errorMessage=str(error),
            errorType=type(error).__name__,
            metadata=metadata,
        )
        self._pending_events.append(event)
        self.status = SpanStatus.ERROR
    
    def _flush(self) -> None:
        """Flush all pending events to the server."""
        if not self.enabled or not self._pending_events:
            return
        
        try:
            self._client.send_events_batch(self._pending_events)
        except Exception as e:
            # Log but don't raise - we don't want tracing to break the app
            print(f"[OrchestraAI] Failed to send events: {e}")
        finally:
            self._pending_events = []
    
    def __enter__(self) -> Trace:
        # Send agent_run start event
        event = IngestEvent(
            type=TraceType.AGENT_RUN.value,
            traceId=self.trace_id,
            spanId=self.root_span_id,
            name=f"agent:{self.agent_name}",
            startTime=self.start_time,
            status="started",
            agentId=self.agent_id,
            agentName=self.agent_name,
            metadata=self.metadata,
        )
        self._pending_events.append(event)
        return self
    
    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.end_time = int(datetime.now(timezone.utc).timestamp() * 1000)
        
        if exc_val:
            self.error(exc_val)
        
        # Send agent_run end event
        final_status = "failed" if exc_val else "completed"
        
        event = IngestEvent(
            type=TraceType.AGENT_RUN.value,
            traceId=self.trace_id,
            spanId=self.root_span_id,
            name=f"agent:{self.agent_name}",
            startTime=self.start_time,
            endTime=self.end_time,
            status=final_status,
            agentId=self.agent_id,
            agentName=self.agent_name,
            metadata=self.metadata,
        )
        self._pending_events.append(event)
        
        # Flush all events
        self._flush()
