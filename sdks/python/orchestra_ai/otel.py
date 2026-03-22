"""OpenTelemetry integration for OrchestraAI.

Provides:
- ``OrchestraSpanExporter``: Exports OTEL spans to the OrchestraAI ingest API.
- ``setup_otel()``: One-liner to wire everything up.

Usage::

    from orchestra_ai import OrchestraAI
    from orchestra_ai.otel import setup_otel

    oa = OrchestraAI(api_key="...")
    provider = setup_otel(oa, service_name="my-agent-service")

    # All OTEL-instrumented libraries (openai, httpx, etc.) now send
    # spans to OrchestraAI automatically.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Optional, Sequence

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider, ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult, BatchSpanProcessor
from opentelemetry.sdk.resources import Resource, SERVICE_NAME

if TYPE_CHECKING:
    from .client import OrchestraAI


class OrchestraSpanExporter(SpanExporter):
    """Exports OpenTelemetry spans to OrchestraAI's OTLP-compatible endpoint."""

    def __init__(self, client: "OrchestraAI") -> None:
        self._client = client

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        if not self._client.enabled or not spans:
            return SpanExportResult.SUCCESS

        # Build OTLP JSON payload
        resource_spans = self._build_resource_spans(spans)
        payload = {"resourceSpans": resource_spans}

        try:
            response = self._client.client.post(
                "/api/ingest/v1/traces",
                json=payload,
            )
            response.raise_for_status()
            return SpanExportResult.SUCCESS
        except Exception as e:
            print(f"[OrchestraAI OTEL] Export failed: {e}")
            return SpanExportResult.FAILURE

    def shutdown(self) -> None:
        pass

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True

    def _build_resource_spans(self, spans: Sequence[ReadableSpan]) -> list:
        """Convert OTEL ReadableSpan objects to OTLP JSON format."""
        # Group spans by resource
        from collections import defaultdict
        by_resource: dict[int, list[ReadableSpan]] = defaultdict(list)
        for span in spans:
            key = id(span.resource) if span.resource else 0
            by_resource[key].append(span)

        resource_spans = []
        for _, group in by_resource.items():
            sample = group[0]
            resource_attrs = {}
            if sample.resource:
                resource_attrs = {
                    k: self._attr_value(v)
                    for k, v in sample.resource.attributes.items()
                }

            otlp_spans = []
            for span in group:
                attrs = {}
                if span.attributes:
                    attrs = {
                        k: self._attr_value(v)
                        for k, v in span.attributes.items()
                    }

                otlp_span = {
                    "traceId": format(span.context.trace_id, "032x"),
                    "spanId": format(span.context.span_id, "016x"),
                    "name": span.name,
                    "startTimeUnixNano": span.start_time,
                    "endTimeUnixNano": span.end_time,
                    "attributes": attrs,
                    "status": {"code": span.status.status_code.value if span.status else 0},
                }

                if span.parent and span.parent.span_id:
                    otlp_span["parentSpanId"] = format(span.parent.span_id, "016x")

                otlp_spans.append(otlp_span)

            resource_spans.append({
                "resource": {"attributes": resource_attrs},
                "scopeSpans": [{"spans": otlp_spans}],
            })

        return resource_spans

    @staticmethod
    def _attr_value(val):
        """Convert an OTEL attribute value to a JSON-safe value."""
        if isinstance(val, (str, int, float, bool)):
            return val
        if isinstance(val, (list, tuple)):
            return [OrchestraSpanExporter._attr_value(v) for v in val]
        return str(val)


def setup_otel(
    client: "OrchestraAI",
    service_name: str = "orchestra-ai-agent",
) -> TracerProvider:
    """Set up OpenTelemetry with OrchestraAI as the span exporter.

    This configures a global ``TracerProvider`` that exports all spans
    to OrchestraAI. Any OTEL-instrumented library (openai, httpx, etc.)
    will automatically send spans.

    Args:
        client: An initialized ``OrchestraAI`` client.
        service_name: Service name for the OTEL resource.

    Returns:
        The configured ``TracerProvider``. You can add additional exporters
        (Jaeger, Zipkin, etc.) to this provider if needed.
    """
    resource = Resource.create({SERVICE_NAME: service_name})
    provider = TracerProvider(resource=resource)

    exporter = OrchestraSpanExporter(client)
    provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)
    return provider
