/**
 * LangGraph.js integration for OrchestraAI SDK
 */

import type { OrchestraAI } from '../client';
import { createLangChainHandler } from './langchain';

let _client: OrchestraAI | null = null;
let _originalInvoke: any;
let _originalAinvoke: any;

function addCallbacks(config: any, handler: any) {
  const cfg = config ? { ...config } : {};
  const cb = cfg.callbacks || [];
  cfg.callbacks = [...cb, handler];
  return cfg;
}

/**
 * LangGraph.js tracer integration.
 */
export const langGraphTracer = {
  /**
   * Automatically instrument LangGraph.js to send traces to OrchestraAI.
   *
   * Captures:
   * - Graph execution as agent_run
   * - Node/chain/tool spans via LangChain callback handler
   */
  autoInstrument(client: OrchestraAI): void {
    _client = client;

    let CompiledGraph: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      CompiledGraph = require('@langchain/langgraph').CompiledGraph;
    } catch (err) {
      console.warn('[OrchestraAI] LangGraph not installed; skipping auto-instrumentation');
      return;
    }

    if (!CompiledGraph || _originalInvoke) return;

    _originalInvoke = CompiledGraph.prototype.invoke;
    _originalAinvoke = CompiledGraph.prototype.ainvoke;

    const patchInvoke = (original: any, isAsync = false) => {
      return async function patched(this: any, input: any, config?: any, ...rest: any[]) {
        if (!_client) return original.call(this, input, config, ...rest);
        const graphName = this?.name || 'langgraph';
        const handler = createLangChainHandler({
          client: _client,
          agentName: graphName,
          metadata: { framework: 'langgraph', graphName },
        });

        const trace = _client.startTrace(graphName, {
          metadata: { framework: 'langgraph', graphName },
        });

        try {
          const cfgWithCb = addCallbacks(config, handler);
          const result = isAsync
            ? await original.call(this, input, cfgWithCb, ...rest)
            : await original.call(this, input, cfgWithCb, ...rest);
          trace.end();
          return result;
        } catch (err: any) {
          trace.error(err instanceof Error ? err : new Error(String(err)));
          throw err;
        }
      };
    };

    CompiledGraph.prototype.invoke = patchInvoke(_originalInvoke, false);
    if (_originalAinvoke) {
      CompiledGraph.prototype.ainvoke = patchInvoke(_originalAinvoke, true);
    }

    console.log('[OrchestraAI] LangGraph auto-instrumentation enabled');
  },

  /**
   * Remove LangGraph.js instrumentation.
   */
  removeInstrumentation(): void {
    if (!_client) return;
    let CompiledGraph: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      CompiledGraph = require('@langchain/langgraph').CompiledGraph;
    } catch {
      _client = null;
      return;
    }

    if (CompiledGraph && _originalInvoke) {
      CompiledGraph.prototype.invoke = _originalInvoke;
      if (_originalAinvoke) {
        CompiledGraph.prototype.ainvoke = _originalAinvoke;
      }
    }

    _originalInvoke = undefined;
    _originalAinvoke = undefined;
    _client = null;
  },

  /**
   * Get the current client instance.
   */
  getClient(): OrchestraAI | null {
    return _client;
  },
};
