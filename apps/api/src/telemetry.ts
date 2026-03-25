/**
 * OpenTelemetry self-instrumentation for the OrchestraAI API.
 *
 * MUST be imported before any other module in main.ts — OTEL needs to
 * monkey-patch Node.js built-ins (http, pg) before they are required.
 *
 * Controlled by env vars:
 *   OTEL_ENABLED=true                         — enable telemetry (default: false)
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://...    — OTLP HTTP exporter endpoint
 *   OTEL_SERVICE_NAME=orchestra-ai-api        — service name (default)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

let sdk: NodeSDK | null = null;

export function initTelemetry(): void {
  const enabled = process.env.OTEL_ENABLED === 'true';
  if (!enabled) return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    console.log('[OTEL] OTEL_ENABLED=true but OTEL_EXPORTER_OTLP_ENDPOINT not set, skipping');
    return;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME || 'orchestra-ai-api';

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      new HttpInstrumentation(),
      new PgInstrumentation(),
    ],
  });

  sdk.start();
  console.log(`[OTEL] Telemetry enabled → exporting to ${endpoint}`);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk?.shutdown().catch(console.error);
  });
}
