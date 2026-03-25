'use client';

import { useState } from 'react';
import { Clock, Brain, Zap, DollarSign, Wrench, Activity, AlertTriangle, Hash, User } from 'lucide-react';
import { formatDuration, formatNumber, formatCurrency, getTraceTypeColor, getStatusColor, getTraceTypeLabel } from '@/lib/utils';
import { TraceTypeIcon } from './TraceTypeIcon';
import { CopyableId } from '../ui/CopyableId';
import { MetricCard } from '../ui/MetricCard';
import { IOSection } from '../ui/IOSection';

type Tab = 'io' | 'metadata' | 'timing';

export function SpanDetail({ span }: { span: any }) {
  const [activeTab, setActiveTab] = useState<Tab>('io');

  const hasIO = span.input || span.output || span.toolArgs || span.toolResult;
  const hasError = !!span.errorMessage;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700/60">
        {/* Type + Status badges */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold flex items-center gap-1 ${getTraceTypeColor(span.type)}`}>
            <TraceTypeIcon type={span.type} className="h-3 w-3" />{getTraceTypeLabel(span.type)}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${getStatusColor(span.status)}`}>{span.status}</span>
        </div>

        {/* Name */}
        <h4 className="text-[15px] font-bold text-gray-900 dark:text-white mb-2 leading-tight">{span.name}</h4>

        {/* IDs row */}
        <div className="flex items-center gap-3 flex-wrap text-[10px]">
          {span.agentName && (
            <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <Activity className="h-2.5 w-2.5" /> {span.agentName}
            </span>
          )}
          {span.spanId && <CopyableId label="Span" value={span.spanId} />}
          {span.parentSpanId && <CopyableId label="Parent" value={span.parentSpanId} />}
        </div>
      </div>

      {/* Metrics row */}
      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-700/60 flex items-center gap-3 flex-wrap">
        {span.durationMs != null && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Clock className="h-3 w-3 text-gray-400" />
            <span className="font-semibold text-gray-700 dark:text-gray-200">{formatDuration(span.durationMs)}</span>
          </div>
        )}
        {span.model && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Brain className="h-3 w-3 text-gray-400" />
            <span className="font-medium text-gray-600 dark:text-gray-300">{span.model}</span>
          </div>
        )}
        {(span.promptTokens || span.completionTokens) && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Zap className="h-3 w-3 text-gray-400" />
            <span className="font-mono text-gray-600 dark:text-gray-300">
              {formatNumber(span.promptTokens || 0)} → {formatNumber(span.completionTokens || 0)}
            </span>
            {span.totalTokens && <span className="text-[10px] text-gray-400">(Σ {formatNumber(span.totalTokens)})</span>}
          </div>
        )}
        {span.cost != null && Number(span.cost) > 0 && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <DollarSign className="h-3 w-3 text-gray-400" />
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(span.cost))}</span>
          </div>
        )}
        {span.toolName && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Wrench className="h-3 w-3 text-gray-400" />
            <span className="font-medium text-gray-600 dark:text-gray-300">{span.toolName}</span>
          </div>
        )}
        {span.metadata?.timeToFirstTokenMs != null && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Zap className="h-3 w-3 text-amber-400" />
            <span className="text-gray-500 dark:text-gray-400">TTFT: {formatDuration(span.metadata.timeToFirstTokenMs)}</span>
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <div className="px-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center gap-0">
        {[
          { key: 'io' as Tab, label: 'Input / Output' },
          { key: 'metadata' as Tab, label: 'Metadata' },
          { key: 'timing' as Tab, label: 'Timing & IDs' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-[11px] font-medium border-b-2 transition ${
              activeTab === tab.key
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'io' && (
          <div>
            {/* Error (always show first if present) */}
            {hasError && (
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700/60">
                <h5 className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Error {span.errorType && `(${span.errorType})`}
                </h5>
                <pre className="text-[11px] bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 p-3 rounded-lg whitespace-pre-wrap max-h-40 overflow-y-auto border border-red-200 dark:border-red-500/20">
                  {span.errorMessage}
                </pre>
              </div>
            )}

            {span.input && <IOSection title="Input" content={span.input} variant="input" />}
            {span.output && <IOSection title="Output" content={span.output} variant="output" />}
            {span.toolArgs && <IOSection title="Tool Arguments" content={JSON.stringify(span.toolArgs, null, 2)} variant="json" />}
            {span.toolResult && <IOSection title="Tool Result" content={span.toolResult} variant="output" />}

            {!hasIO && !hasError && (
              <div className="px-4 py-8 text-center text-[11px] text-gray-400 dark:text-gray-500">
                No input/output data for this span.
              </div>
            )}
          </div>
        )}

        {activeTab === 'metadata' && (
          <div>
            {span.metadata && Object.keys(span.metadata).length > 0 ? (
              <IOSection title="Metadata" content={JSON.stringify(span.metadata, null, 2)} variant="json" />
            ) : (
              <div className="px-4 py-8 text-center text-[11px] text-gray-400 dark:text-gray-500">
                No metadata for this span.
              </div>
            )}
            {span.attributes && Object.keys(span.attributes).length > 0 && (
              <IOSection title="Attributes" content={JSON.stringify(span.attributes, null, 2)} variant="json" />
            )}
          </div>
        )}

        {activeTab === 'timing' && (
          <div className="px-4 py-3">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-slate-900/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700/40">
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1">Start</p>
                  <p className="text-[12px] font-mono text-gray-700 dark:text-gray-300">
                    {span.startTime ? new Date(Number(span.startTime)).toISOString() : '—'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-slate-900/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700/40">
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1">End</p>
                  <p className="text-[12px] font-mono text-gray-700 dark:text-gray-300">
                    {span.endTime ? new Date(Number(span.endTime)).toISOString() : '—'}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-slate-900/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700/40">
                <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1">Duration</p>
                <p className="text-[14px] font-semibold text-gray-800 dark:text-gray-100">
                  {span.durationMs != null ? formatDuration(span.durationMs) : '—'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-slate-900/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700/40">
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1">Span ID</p>
                  <p className="text-[11px] font-mono text-gray-600 dark:text-gray-400 break-all">{span.spanId || '—'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-slate-900/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700/40">
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1">Parent Span ID</p>
                  <p className="text-[11px] font-mono text-gray-600 dark:text-gray-400 break-all">{span.parentSpanId || '— (root)'}</p>
                </div>
              </div>

              {span.traceId && (
                <div className="bg-gray-50 dark:bg-slate-900/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700/40">
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1">Trace ID</p>
                  <p className="text-[11px] font-mono text-gray-600 dark:text-gray-400 break-all">{span.traceId}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
