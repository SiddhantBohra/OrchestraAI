'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/store';
import { tracesApi } from '@/lib/api';
import {
  formatDuration,
  formatDate,
  formatNumber,
  formatCurrency,
  getStatusColor,
  getTraceTypeColor,
} from '@/lib/utils';
import {
  Search,
  ChevronRight,
  ChevronDown,
  Clock,
  Zap,
  DollarSign,
  X,
  AlertTriangle,
  MessageSquare,
  Wrench,
  Brain,
  Database,
} from 'lucide-react';

// Icon mapping for trace types
function TraceTypeIcon({ type }: { type: string }) {
  const iconClass = 'h-3.5 w-3.5';
  switch (type) {
    case 'llm_call': return <Brain className={iconClass} />;
    case 'tool_call': return <Wrench className={iconClass} />;
    case 'retriever': return <Database className={iconClass} />;
    case 'agent_action': return <Zap className={iconClass} />;
    case 'error': return <AlertTriangle className={iconClass} />;
    default: return <MessageSquare className={iconClass} />;
  }
}

export default function TracesPage() {
  const { currentProject } = useProjectStore();
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<any | null>(null);
  const [filter, setFilter] = useState({ type: '', status: '', search: '' });

  // Fetch only agent_run traces for the left panel
  const { data: agentRuns, isLoading } = useQuery({
    queryKey: ['agent-runs', currentProject?.id, filter],
    queryFn: () =>
      tracesApi.list(currentProject!.id, {
        type: 'agent_run',
        status: filter.status || undefined,
        limit: 100,
      }),
    enabled: !!currentProject,
  });

  // Fetch trace tree when a run is selected
  const { data: traceTree } = useQuery({
    queryKey: ['trace-tree', currentProject?.id, selectedTraceId],
    queryFn: () => tracesApi.getTree(currentProject!.id, selectedTraceId!),
    enabled: !!currentProject && !!selectedTraceId,
  });

  if (!currentProject) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a project first.
      </div>
    );
  }

  const runs = agentRuns?.data || [];
  const tree = traceTree?.data || [];

  return (
    <div className="p-8 h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Trace Explorer</h1>
        <p className="text-gray-500 dark:text-gray-400">Debug and analyze agent execution traces</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            placeholder="Search agent runs..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
          />
        </div>
        <select
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
        >
          <option value="">All Status</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="started">Running</option>
          <option value="timeout">Timeout</option>
        </select>
      </div>

      <div className="grid grid-cols-12 gap-6" style={{ minHeight: '600px' }}>
        {/* Left Panel — Agent Runs */}
        <div className="col-span-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-slate-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Agent Runs
              {runs.length > 0 && <span className="text-gray-400 ml-2 text-sm font-normal">({runs.length})</span>}
            </h3>
          </div>
          <div className="flex-1 divide-y divide-gray-200 dark:divide-slate-700 overflow-y-auto">
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <div key={i} className="p-3 animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/2" />
                </div>
              ))
            ) : runs.length > 0 ? (
              runs
                .filter((r: any) => !filter.search || r.name?.toLowerCase().includes(filter.search.toLowerCase()) || r.agentName?.toLowerCase().includes(filter.search.toLowerCase()))
                .map((run: any) => (
                <button
                  key={run.id}
                  onClick={() => { setSelectedTraceId(run.traceId); setSelectedSpan(null); }}
                  className={`w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition ${
                    selectedTraceId === run.traceId ? 'bg-purple-50 dark:bg-purple-900/20 border-l-2 border-purple-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {run.agentName || run.name}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getStatusColor(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-gray-500">
                    {run.durationMs != null && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" /> {formatDuration(run.durationMs)}
                      </span>
                    )}
                    {run.totalTokens != null && run.totalTokens > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Zap className="h-3 w-3" /> {formatNumber(run.totalTokens)}
                      </span>
                    )}
                    {run.cost != null && Number(run.cost) > 0 && (
                      <span className="flex items-center gap-0.5">
                        <DollarSign className="h-3 w-3" /> {formatCurrency(Number(run.cost))}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{formatDate(run.createdAt)}</p>
                </button>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">
                No agent runs yet.
              </div>
            )}
          </div>
        </div>

        {/* Middle Panel — Trace Tree */}
        <div className="col-span-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-slate-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">Trace Tree</h3>
          </div>
          <div className="flex-1 p-3 overflow-y-auto">
            {selectedTraceId && tree.length > 0 ? (
              <div className="space-y-0.5">
                {tree.map((node: any) => (
                  <TraceNode
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedSpanId={selectedSpan?.spanId}
                    onSelect={setSelectedSpan}
                  />
                ))}
              </div>
            ) : selectedTraceId ? (
              <div className="text-center text-gray-500 py-8 text-sm">Loading tree...</div>
            ) : (
              <div className="text-center text-gray-500 py-8 text-sm">
                Select an agent run to view its trace tree
              </div>
            )}
          </div>
        </div>

        {/* Right Panel — Span Detail */}
        <div className="col-span-5 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {selectedSpan ? 'Span Details' : 'Details'}
            </h3>
            {selectedSpan && (
              <button onClick={() => setSelectedSpan(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {selectedSpan ? (
              <SpanDetail span={selectedSpan} />
            ) : (
              <div className="text-center text-gray-500 py-8 text-sm">
                Click a span in the tree to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trace Tree Node ───────────────────────────────────────

function TraceNode({
  node,
  depth,
  selectedSpanId,
  onSelect,
}: {
  node: any;
  depth: number;
  selectedSpanId?: string;
  onSelect: (span: any) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.spanId === selectedSpanId;

  return (
    <div>
      <div
        style={{ paddingLeft: depth * 20 + 4 }}
        className={`flex items-center gap-1.5 py-1 px-1 rounded cursor-pointer text-sm transition ${
          isSelected
            ? 'bg-purple-100 dark:bg-purple-900/30'
            : 'hover:bg-gray-100 dark:hover:bg-slate-700/50'
        }`}
        onClick={() => onSelect(node)}
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />
          ) : <div className="w-3" />}
        </button>

        {/* Type badge */}
        <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${getTraceTypeColor(node.type)}`}>
          <TraceTypeIcon type={node.type} />
          {node.type}
        </span>

        {/* Name */}
        <span className="flex-1 truncate text-gray-900 dark:text-white text-xs font-medium">
          {node.name}
        </span>

        {/* Status + duration */}
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${getStatusColor(node.status)}`}>
          {node.status}
        </span>
        <span className="text-[10px] text-gray-500 w-12 text-right">
          {formatDuration(node.durationMs || 0)}
        </span>
      </div>

      {expanded && hasChildren && node.children.map((child: any) => (
        <TraceNode key={child.id} node={child} depth={depth + 1} selectedSpanId={selectedSpanId} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ─── Span Detail Panel ─────────────────────────────────────

function SpanDetail({ span }: { span: any }) {
  return (
    <div className="divide-y divide-gray-200 dark:divide-slate-700">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${getTraceTypeColor(span.type)}`}>
            {span.type}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(span.status)}`}>
            {span.status}
          </span>
        </div>
        <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{span.name}</h4>
        {span.agentName && <p className="text-sm text-gray-500">Agent: {span.agentName}</p>}
      </div>

      {/* Metrics */}
      <div className="p-4 grid grid-cols-2 gap-4">
        {span.durationMs != null && (
          <MetricItem label="Duration" value={formatDuration(span.durationMs)} icon={<Clock className="h-4 w-4" />} />
        )}
        {span.model && (
          <MetricItem label="Model" value={span.model} icon={<Brain className="h-4 w-4" />} />
        )}
        {(span.promptTokens || span.completionTokens) && (
          <MetricItem
            label="Tokens"
            value={`${formatNumber(span.promptTokens || 0)} in / ${formatNumber(span.completionTokens || 0)} out`}
            icon={<Zap className="h-4 w-4" />}
          />
        )}
        {span.cost != null && Number(span.cost) > 0 && (
          <MetricItem label="Cost" value={formatCurrency(Number(span.cost))} icon={<DollarSign className="h-4 w-4" />} />
        )}
        {span.toolName && (
          <MetricItem label="Tool" value={span.toolName} icon={<Wrench className="h-4 w-4" />} />
        )}
      </div>

      {/* Input */}
      {span.input && (
        <div className="p-4">
          <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Input / Prompt</h5>
          <pre className="text-xs bg-gray-50 dark:bg-slate-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-48 overflow-y-auto">
            {span.input}
          </pre>
        </div>
      )}

      {/* Output */}
      {span.output && (
        <div className="p-4">
          <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Output / Response</h5>
          <pre className="text-xs bg-gray-50 dark:bg-slate-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-48 overflow-y-auto">
            {span.output}
          </pre>
        </div>
      )}

      {/* Tool Args */}
      {span.toolArgs && (
        <div className="p-4">
          <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Tool Arguments</h5>
          <pre className="text-xs bg-gray-50 dark:bg-slate-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-32 overflow-y-auto">
            {JSON.stringify(span.toolArgs, null, 2)}
          </pre>
        </div>
      )}

      {/* Tool Result */}
      {span.toolResult && (
        <div className="p-4">
          <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Tool Result</h5>
          <pre className="text-xs bg-gray-50 dark:bg-slate-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-32 overflow-y-auto">
            {span.toolResult}
          </pre>
        </div>
      )}

      {/* Error */}
      {span.errorMessage && (
        <div className="p-4">
          <h5 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Error
          </h5>
          {span.errorType && <p className="text-xs text-red-400 mb-1">{span.errorType}</p>}
          <pre className="text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
            {span.errorMessage}
          </pre>
        </div>
      )}

      {/* Metadata */}
      {span.metadata && Object.keys(span.metadata).length > 0 && (
        <div className="p-4">
          <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Metadata</h5>
          <pre className="text-xs bg-gray-50 dark:bg-slate-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-32 overflow-y-auto">
            {JSON.stringify(span.metadata, null, 2)}
          </pre>
        </div>
      )}

      {/* IDs */}
      <div className="p-4">
        <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">IDs</h5>
        <div className="space-y-1 text-xs text-gray-500 font-mono">
          <p>Span: {span.spanId}</p>
          {span.parentSpanId && <p>Parent: {span.parentSpanId}</p>}
          <p>Created: {formatDate(span.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}

function MetricItem({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-gray-400 mt-0.5">{icon}</div>
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}
