"""Type definitions for OrchestraAI SDK"""

from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class TraceType(str, Enum):
    """Type of trace/span"""
    AGENT_RUN = "agent_run"
    STEP = "step"
    TOOL_CALL = "tool_call"
    LLM_CALL = "llm_call"
    RETRIEVER = "retriever"
    AGENT_ACTION = "agent_action"
    ERROR = "error"


class SpanStatus(str, Enum):
    """Status of a span"""
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"


class SpanData(BaseModel):
    """Data for a span/trace"""
    trace_id: str = Field(alias="traceId")
    span_id: str = Field(alias="spanId")
    parent_span_id: Optional[str] = Field(None, alias="parentSpanId")
    type: TraceType
    name: str
    status: SpanStatus
    start_time: str = Field(alias="startTime")
    end_time: Optional[str] = Field(None, alias="endTime")
    duration_ms: Optional[int] = Field(None, alias="durationMs")
    agent_id: Optional[str] = Field(None, alias="agentId")
    agent_name: Optional[str] = Field(None, alias="agentName")
    model: Optional[str] = None
    input_tokens: Optional[int] = Field(None, alias="inputTokens")
    output_tokens: Optional[int] = Field(None, alias="outputTokens")
    total_tokens: Optional[int] = Field(None, alias="totalTokens")
    cost: Optional[float] = None
    latency_ms: Optional[int] = Field(None, alias="latencyMs")
    tool_name: Optional[str] = Field(None, alias="toolName")
    tool_input: Optional[Dict[str, Any]] = Field(None, alias="toolInput")
    tool_output: Optional[Any] = Field(None, alias="toolOutput")
    error_message: Optional[str] = Field(None, alias="errorMessage")
    error_type: Optional[str] = Field(None, alias="errorType")
    metadata: Optional[Dict[str, Any]] = None
    input_preview: Optional[str] = Field(None, alias="inputPreview")
    output_preview: Optional[str] = Field(None, alias="outputPreview")

    model_config = {"populate_by_name": True}


class IngestEvent(BaseModel):
    """Event to send to the ingest API.

    Field names use camelCase aliases to match the API's IngestEventDto.
    """
    type: str
    trace_id: Optional[str] = Field(None, alias="traceId")
    span_id: Optional[str] = Field(None, alias="spanId")
    parent_span_id: Optional[str] = Field(None, alias="parentSpanId")
    name: Optional[str] = None
    start_time: Optional[int] = Field(None, alias="startTime")
    end_time: Optional[int] = Field(None, alias="endTime")
    status: Optional[str] = None
    agent_id: Optional[str] = Field(None, alias="agentId")
    agent_name: Optional[str] = Field(None, alias="agentName")
    session_id: Optional[str] = Field(None, alias="sessionId")
    model: Optional[str] = None
    prompt_tokens: Optional[int] = Field(None, alias="promptTokens")
    completion_tokens: Optional[int] = Field(None, alias="completionTokens")
    cost: Optional[float] = None
    tool_name: Optional[str] = Field(None, alias="toolName")
    tool_args: Optional[Dict[str, Any]] = Field(None, alias="toolArgs")
    tool_result: Optional[str] = Field(None, alias="toolResult")
    input: Optional[str] = None
    output: Optional[str] = None
    error_message: Optional[str] = Field(None, alias="errorMessage")
    error_type: Optional[str] = Field(None, alias="errorType")
    metadata: Optional[Dict[str, Any]] = None

    model_config = {"populate_by_name": True}


class PolicyResult(BaseModel):
    """Result from policy evaluation"""
    allowed: bool
    action: Optional[str] = None
    policy_name: Optional[str] = None
    message: Optional[str] = None
