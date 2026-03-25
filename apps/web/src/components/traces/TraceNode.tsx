'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, ArrowRight } from 'lucide-react';
import { formatDuration, formatNumber, formatCurrency, getTraceTypeIconColor, getTraceTypeColor, getTraceTypeLabel } from '@/lib/utils';
import { TraceTypeIcon } from './TraceTypeIcon';

const INDENT_PX = 20;

const barBg: Record<string, string> = {
  agent_run: 'bg-purple-400/70 dark:bg-purple-500/50',
  llm_call: 'bg-emerald-400/70 dark:bg-emerald-500/50',
  tool_call: 'bg-amber-400/70 dark:bg-amber-500/50',
  retriever: 'bg-cyan-400/70 dark:bg-cyan-500/50',
  human_input: 'bg-pink-400/70 dark:bg-pink-500/50',
  agent_action: 'bg-indigo-400/70 dark:bg-indigo-500/50',
  error: 'bg-red-400/70 dark:bg-red-500/50',
  step: 'bg-blue-400/60 dark:bg-blue-500/40',
};

const barBorder: Record<string, string> = {
  agent_run: 'border-l-purple-500',
  llm_call: 'border-l-emerald-500',
  tool_call: 'border-l-amber-500',
  retriever: 'border-l-cyan-500',
  human_input: 'border-l-pink-500',
  agent_action: 'border-l-indigo-500',
  error: 'border-l-red-500',
  step: 'border-l-blue-500',
};

export function TraceNode({ node, depth, selectedSpanId, onSelect, maxDuration, traceStart }: {
  node: any; depth: number; selectedSpanId?: string; onSelect: (s: any) => void;
  maxDuration: number; traceStart: number;
}) {
  const [expanded, setExpanded] = useState(depth < 4);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.spanId === selectedSpanId;

  const startMs = Number(node.startTime || 0) - traceStart;
  const durationMs = node.durationMs || 0;
  const startPct = maxDuration > 0 ? Math.max(0, (startMs / maxDuration) * 100) : 0;
  const widthPct = maxDuration > 0 ? Math.max(2, (durationMs / maxDuration) * 100) : 2;

  const displayName = node.type === 'llm_call' && node.model ? node.model
    : node.type === 'tool_call' && node.toolName ? node.toolName
    : node.name?.replace(/^agent:/, '').replace(/^tool:/, '').replace(/^llm:/, '');

  return (
    <div>
      <div
        className={`group flex items-stretch cursor-pointer transition-all border-l-2 ${
          isSelected
            ? `${barBorder[node.type] || barBorder.step} bg-purple-50 dark:bg-purple-500/10`
            : 'border-l-transparent hover:bg-gray-50 dark:hover:bg-slate-700/20'
        }`}
        onClick={() => onSelect(node)}
      >
        {/* Left: Name column (fixed width, always readable) */}
        <div
          className="flex items-center flex-shrink-0 min-h-[36px] py-1 border-r border-gray-100 dark:border-slate-700/40"
          style={{ width: '260px', paddingLeft: `${depth * INDENT_PX + 8}px` }}
        >
          {/* Tree connector lines */}
          {depth > 0 && (
            <div className="flex items-center mr-1 flex-shrink-0">
              <div className="w-3 h-px bg-gray-300 dark:bg-slate-600" />
            </div>
          )}

          {/* Expand/collapse toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-slate-600 mr-1 transition-colors"
          >
            {hasChildren ? (
              expanded
                ? <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                : <ChevronRight className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            ) : <div className="w-3.5" />}
          </button>

          {/* Type icon */}
          <span className={`flex-shrink-0 mr-1.5 ${getTraceTypeIconColor(node.type)}`}>
            <TraceTypeIcon type={node.type} className="h-3.5 w-3.5" />
          </span>

          {/* Span name — always visible */}
          <span className="text-[12px] font-medium text-gray-800 dark:text-gray-200 truncate" title={displayName}>
            {displayName}
          </span>
        </div>

        {/* Right: Gantt timeline + metrics */}
        <div className="flex-1 flex items-center min-w-0">
          {/* Gantt bar area */}
          <div className="flex-1 relative h-[28px] mx-2">
            <div
              className={`absolute top-1 bottom-1 rounded-sm ${barBg[node.type] || barBg.step}`}
              style={{
                left: `${startPct}%`,
                width: `${widthPct}%`,
                maxWidth: `${100 - startPct}%`,
                minWidth: '4px',
              }}
            />
          </div>

          {/* Metrics: tokens, cost, duration (fixed right column) */}
          <div className="flex items-center gap-2 flex-shrink-0 pr-3 text-[10px]">
            {(node.promptTokens || node.completionTokens) && (
              <span className="font-mono text-gray-500 dark:text-gray-400 flex items-center gap-0.5 whitespace-nowrap">
                {formatNumber(node.promptTokens || 0)}
                <ArrowRight className="h-2 w-2" />
                {formatNumber(node.completionTokens || 0)}
              </span>
            )}
            {node.cost != null && Number(node.cost) > 0 && (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                {formatCurrency(Number(node.cost))}
              </span>
            )}
            <span className="font-mono text-gray-400 dark:text-gray-500 whitespace-nowrap min-w-[40px] text-right">
              {formatDuration(durationMs)}
            </span>
          </div>
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && node.children.map((child: any) => (
        <TraceNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedSpanId={selectedSpanId}
          onSelect={onSelect}
          maxDuration={maxDuration}
          traceStart={traceStart}
        />
      ))}
    </div>
  );
}
