/**
 * Google ADK integration for OrchestraAI (TypeScript).
 *
 * Provides helpers for tracing Google ADK agent runs.
 * Since the ADK TS SDK (@google/adk) is event-stream based,
 * we provide a trace wrapper around Runner.run().
 *
 * @example
 * ```ts
 * import { traceADKRun } from '@orchestra-ai/sdk/integrations/google-adk';
 *
 * const events = await traceADKRun(oa, runner, {
 *   userId: 'user_123',
 *   sessionId: 'session_abc',
 *   message: 'Hello!',
 *   agentName: 'my-adk-agent',
 * });
 * ```
 */

import type { OrchestraAI } from '../client';

export interface ADKRunOptions {
  userId: string;
  sessionId: string;
  message: string;
  agentName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Wrap a Google ADK Runner.run() call with OrchestraAI tracing.
 *
 * Captures the full agent run as a trace, and iterates events
 * to extract LLM outputs and tool calls.
 */
export async function traceADKRun(
  oa: OrchestraAI,
  runner: { run: (options: any) => AsyncIterable<any> },
  options: ADKRunOptions,
): Promise<any[]> {
  const events: any[] = [];

  await oa.trace(options.agentName || 'google-adk-agent', async (trace) => {
    const eventStream = runner.run({
      userId: options.userId,
      sessionId: options.sessionId,
      newMessage: {
        role: 'user',
        parts: [{ text: options.message }],
      },
    });

    for await (const event of eventStream) {
      events.push(event);

      const content = event?.content;
      if (!content?.parts) continue;

      for (const part of content.parts) {
        // LLM text output
        if (part.text && event.author !== 'user') {
          const step = trace.step(`response:${event.author || 'agent'}`);
          step.setData({ outputPreview: part.text.slice(0, 500) });
          step.end();
        }

        // Function calls
        if (part.functionCall) {
          const toolSpan = trace.toolCall({
            toolName: part.functionCall.name || 'tool',
            toolInput: part.functionCall.args,
            metadata: { framework: 'google-adk' },
          });
          toolSpan.end();
        }

        // Function responses
        if (part.functionResponse) {
          const step = trace.step(`tool-result:${part.functionResponse.name || 'tool'}`);
          step.setData({
            outputPreview: JSON.stringify(part.functionResponse.response).slice(0, 500),
          });
          step.end();
        }
      }

      // Token usage from event metadata
      const usage = event?.usageMetadata;
      if (usage) {
        await trace.llmCall({
          model: 'gemini',
          inputTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          metadata: { framework: 'google-adk' },
        });
      }
    }
  }, {
    sessionId: options.sessionId,
    metadata: { ...options.metadata, framework: 'google-adk' },
  });

  return events;
}
