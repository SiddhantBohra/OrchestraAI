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
  User,
  Hash,
  Tag,
  Copy,
  Check,
  Activity,
  Shield,
} from 'lucide-react';

// ─── Icon mapping ─────────────────────────────────────────────

function TraceTypeIcon({ type, className = 'h-3.5 w-3.5' }: { type: string; className?: string }) {
  switch (type) {
    case 'llm_call': return <Brain className={className} />;
    case 'tool_call': return <Wrench className={className} />;
    case 'retriever': return <Database className={className} />;
    case 'agent_action': return <Zap className={className} />;
    case 'agent_run': return <Activity className={className} />;
    case 'human_input': return <User className={className} />;
    case 'error': return <AlertTriangle className={className} />;
    default: return <MessageSquare className={className} />;
  }
}

// ─── Copyable ID ──────────────────────────────────────────────

function CopyableId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
      title={`${label}: ${value}`}
    >
      {copied ? <Check className="h-2.5 w-2.5 text-green-500" /> : <Copy className="h-2.5 w-2.5" />}
      {value.slice(0, 8)}...
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────

function Badge({ icon, label, color = 'gray' }: { icon: React.ReactNode; label: string; color?: string }) {
  const colors: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[color] || colors.gray}`}>
      {icon}{label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function TracesPage() {
  const { currentProject } = useProjectStore();
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<any | null>(null);
  const [filter, setFilter] = useState({ status: '', search: '' });

  const { data: agentRuns, isLoading } = useQuery({
    queryKey: ['agent-runs', currentProject?.id, filter],
    queryFn: () => tracesApi.list(currentProject!.id, { type: 'agent_run', status: filter.status || undefined, limit: 100 }),
    enabled: !!currentProject,
    refetchInterval: 3000, // Poll every 3 seconds for real-time updates
  });

  const { data: traceTree } = useQuery({
    queryKey: ['trace-tree', currentProject?.id, selectedTraceId],
    queryFn: () => tracesApi.getTree(currentProject!.id, selectedTraceId!),
    enabled: !!currentProject && !!selectedTraceId,
    refetchInterval: 3000,
  });

  if (!currentProject) {
    return <div className="p-8 text-center text-gray-500">Please select a project first.</div>;
  }

  // Deduplicate agent runs: keep latest status per traceId
  // (the API returns both "started" and "completed" events for the same trace)
  const rawRuns = agentRuns?.data || [];
  const runMap = new Map<string, any>();
  for (const run of rawRuns) {
    const existing = runMap.get(run.traceId);
    if (!existing || run.status !== 'started') {
      runMap.set(run.traceId, run);
    }
  }
  const runs = Array.from(runMap.values());
  const tree = traceTree?.data || [];

  // Compute aggregate stats for the selected trace
  const traceStats = tree.length > 0 ? computeTraceStats(tree) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Trace Explorer</h1>
            <p className="text-xs text-gray-500">Debug and analyze agent execution traces</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                placeholder="Search traces..."
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white w-56"
              />
            </div>
            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
            >
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="started">Running</option>
              <option value="timeout">Timeout</option>
            </select>
          </div>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left — Agent Runs List */}
        <div className="w-72 border-r border-gray-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Agent Runs {runs.length > 0 && `(${runs.length})`}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <div key={i} className="px-3 py-2.5 animate-pulse border-b border-gray-100 dark:border-slate-700">
                  <div className="h-3.5 bg-gray-200 dark:bg-slate-700 rounded w-3/4 mb-1.5" />
                  <div className="h-2.5 bg-gray-200 dark:bg-slate-700 rounded w-1/2" />
                </div>
              ))
            ) : runs.length > 0 ? (
              runs
                .filter((r: any) => !filter.search || r.name?.toLowerCase().includes(filter.search.toLowerCase()) || r.agentName?.toLowerCase().includes(filter.search.toLowerCase()))
                .map((run: any) => (
                <button
                  key={run.id}
                  onClick={() => { setSelectedTraceId(run.traceId); setSelectedSpan(null); }}
                  className={`w-full px-3 py-2.5 text-left border-b border-gray-100 dark:border-slate-700 transition ${
                    selectedTraceId === run.traceId
                      ? 'bg-purple-50 dark:bg-purple-900/20 border-l-2 border-l-purple-500'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-xs text-gray-900 dark:text-white truncate">
                      {run.agentName || run.name}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${getStatusColor(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    {run.durationMs != null && (
                      <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{formatDuration(run.durationMs)}</span>
                    )}
                    {run.totalTokens != null && run.totalTokens > 0 && (
                      <span className="flex items-center gap-0.5"><Zap className="h-2.5 w-2.5" />{formatNumber(run.totalTokens)}</span>
                    )}
                    {run.cost != null && Number(run.cost) > 0 && (
                      <span className="flex items-center gap-0.5"><DollarSign className="h-2.5 w-2.5" />{formatCurrency(Number(run.cost))}</span>
                    )}
                  </div>
                  <p className="text-[9px] text-gray-400 mt-0.5">{formatDate(run.createdAt)}</p>
                </button>
              ))
            ) : (
              <div className="px-4 py-12 text-center text-gray-400 text-xs">
                No agent runs yet.<br />Send traces via the SDK to see them here.
              </div>
            )}
          </div>
        </div>

        {/* Middle — Trace Tree + Header */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-200 dark:border-slate-700">
          {/* Trace header with stats */}
          {selectedTraceId && traceStats && (
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {traceStats.agentName && (
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{traceStats.agentName}</span>
                )}
                <CopyableId label="Trace ID" value={selectedTraceId} />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge icon={<Clock className="h-2.5 w-2.5" />} label={`Latency: ${formatDuration(traceStats.totalDuration)}`} color="gray" />
                {traceStats.totalCost > 0 && (
                  <Badge icon={<DollarSign className="h-2.5 w-2.5" />} label={`Cost: ${formatCurrency(traceStats.totalCost)}`} color="green" />
                )}
                {traceStats.totalTokens > 0 && (
                  <Badge
                    icon={<Zap className="h-2.5 w-2.5" />}
                    label={`${formatNumber(traceStats.inputTokens)} → ${formatNumber(traceStats.outputTokens)} (Σ ${formatNumber(traceStats.totalTokens)})`}
                    color="blue"
                  />
                )}
                {traceStats.sessionId && (
                  <Badge icon={<Hash className="h-2.5 w-2.5" />} label={`Session: ${traceStats.sessionId}`} color="purple" />
                )}
                {traceStats.userId && (
                  <Badge icon={<User className="h-2.5 w-2.5" />} label={`User: ${traceStats.userId}`} color="amber" />
                )}
              </div>
            </div>
          )}

          {/* Tree */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {selectedTraceId && tree.length > 0 ? (
              <div className="space-y-px">
                {tree.map((node: any) => (
                  <TraceNode key={node.id} node={node} depth={0} selectedSpanId={selectedSpan?.spanId} onSelect={setSelectedSpan} maxDuration={traceStats?.totalDuration || 1} />
                ))}
              </div>
            ) : selectedTraceId ? (
              <div className="text-center text-gray-400 py-12 text-xs">Loading trace tree...</div>
            ) : (
              <div className="text-center text-gray-400 py-20 text-xs">
                <Activity className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                Select an agent run to view its trace tree
              </div>
            )}
          </div>
        </div>

        {/* Right — Span Detail */}
        <div className="w-[420px] flex flex-col bg-white dark:bg-slate-800">
          <div className="px-4 py-2.5 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {selectedSpan ? 'Span Details' : 'Details'}
            </h3>
            {selectedSpan && (
              <button onClick={() => setSelectedSpan(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {selectedSpan ? <SpanDetail span={selectedSpan} /> : (
              <div className="text-center text-gray-400 py-20 text-xs">
                <Shield className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                Click a span in the tree to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compute aggregate stats from trace tree ──────────────────

function computeTraceStats(tree: any[]): any {
  let totalCost = 0, inputTokens = 0, outputTokens = 0, totalDuration = 0;
  let agentName = '', sessionId = '', userId = '';

  function walk(nodes: any[]) {
    for (const n of nodes) {
      if (n.cost) totalCost += Number(n.cost);
      if (n.promptTokens) inputTokens += Number(n.promptTokens);
      if (n.completionTokens) outputTokens += Number(n.completionTokens);
      if (n.type === 'agent_run' && n.durationMs) totalDuration = Math.max(totalDuration, n.durationMs);
      if (n.agentName && !agentName) agentName = n.agentName;
      if (n.metadata?.session_id && !sessionId) sessionId = n.metadata.session_id;
      if (n.children) walk(n.children);
    }
  }
  walk(tree);

  return { totalCost, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, totalDuration, agentName, sessionId, userId };
}

// ─── Trace Tree Node ──────────────────────────────────────────

function TraceNode({ node, depth, selectedSpanId, onSelect, maxDuration }: {
  node: any; depth: number; selectedSpanId?: string; onSelect: (s: any) => void; maxDuration: number;
}) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.spanId === selectedSpanId;
  const durationPct = maxDuration > 0 ? Math.max(2, (node.durationMs || 0) / maxDuration * 100) : 0;

  return (
    <div>
      <div
        style={{ paddingLeft: depth * 16 + 4 }}
        className={`group flex items-center gap-1 py-1 px-1 rounded-md cursor-pointer text-[11px] transition-all ${
          isSelected ? 'bg-purple-100 dark:bg-purple-900/30 ring-1 ring-purple-300 dark:ring-purple-700' : 'hover:bg-gray-100 dark:hover:bg-slate-700/40'
        }`}
        onClick={() => onSelect(node)}
      >
        {/* Tree connector line */}
        {depth > 0 && (
          <div className="w-3 h-px bg-gray-300 dark:bg-slate-600 flex-shrink-0 -ml-1 mr-0.5" />
        )}

        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center"
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-2.5 w-2.5 text-gray-400" /> : <ChevronRight className="h-2.5 w-2.5 text-gray-400" />
          ) : <div className="w-2.5" />}
        </button>

        {/* Type icon + badge */}
        <span className={`flex items-center gap-0.5 text-[9px] px-1.5 py-px rounded font-medium flex-shrink-0 ${getTraceTypeColor(node.type)}`}>
          <TraceTypeIcon type={node.type} className="h-2.5 w-2.5" />
        </span>

        {/* Name */}
        <span className="flex-1 truncate text-gray-800 dark:text-gray-200 font-medium">
          {node.name}
        </span>

        {/* Token counts (like Langfuse: "1,024 → 384 (Σ 1,408)") */}
        {(node.promptTokens || node.completionTokens) && (
          <span className="text-[9px] text-gray-400 flex-shrink-0 font-mono">
            {formatNumber(node.promptTokens || 0)}→{formatNumber(node.completionTokens || 0)}
          </span>
        )}

        {/* Cost */}
        {node.cost != null && Number(node.cost) > 0 && (
          <span className="text-[9px] text-green-600 dark:text-green-400 flex-shrink-0 font-mono">
            {formatCurrency(Number(node.cost))}
          </span>
        )}

        {/* Duration with proportional bar */}
        <div className="flex items-center gap-1 flex-shrink-0 w-20">
          <div className="flex-1 h-1 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${node.status === 'failed' ? 'bg-red-400' : 'bg-purple-400'}`}
              style={{ width: `${durationPct}%` }}
            />
          </div>
          <span className="text-[9px] text-gray-500 w-8 text-right">{formatDuration(node.durationMs || 0)}</span>
        </div>
      </div>

      {expanded && hasChildren && node.children.map((child: any) => (
        <TraceNode key={child.id} node={child} depth={depth + 1} selectedSpanId={selectedSpanId} onSelect={onSelect} maxDuration={maxDuration} />
      ))}
    </div>
  );
}

// ─── Span Detail Panel ────────────────────────────────────────

function SpanDetail({ span }: { span: any }) {
  return (
    <div className="divide-y divide-gray-100 dark:divide-slate-700">
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${getTraceTypeColor(span.type)}`}>
            <span className="flex items-center gap-1"><TraceTypeIcon type={span.type} className="h-3 w-3" />{span.type}</span>
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${getStatusColor(span.status)}`}>{span.status}</span>
        </div>
        <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{span.name}</h4>
        <div className="flex items-center gap-2 flex-wrap">
          {span.agentName && <Badge icon={<Activity className="h-2.5 w-2.5" />} label={span.agentName} />}
          {span.spanId && <CopyableId label="Span" value={span.spanId} />}
        </div>
      </div>

      {/* Metrics grid */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 gap-3">
          {span.durationMs != null && <MetricCard label="Latency" value={formatDuration(span.durationMs)} icon={<Clock className="h-3.5 w-3.5" />} />}
          {span.model && <MetricCard label="Model" value={span.model} icon={<Brain className="h-3.5 w-3.5" />} />}
          {(span.promptTokens || span.completionTokens) && (
            <MetricCard
              label="Tokens"
              value={`${formatNumber(span.promptTokens || 0)} → ${formatNumber(span.completionTokens || 0)}`}
              sub={span.totalTokens ? `Σ ${formatNumber(span.totalTokens)}` : undefined}
              icon={<Zap className="h-3.5 w-3.5" />}
            />
          )}
          {span.cost != null && Number(span.cost) > 0 && <MetricCard label="Cost" value={formatCurrency(Number(span.cost))} icon={<DollarSign className="h-3.5 w-3.5" />} />}
          {span.toolName && <MetricCard label="Tool" value={span.toolName} icon={<Wrench className="h-3.5 w-3.5" />} />}
        </div>
      </div>

      {/* Input */}
      {span.input && <IOSection title="Input" content={span.input} variant="input" />}

      {/* Output */}
      {span.output && <IOSection title="Output" content={span.output} variant="output" />}

      {/* Tool Args */}
      {span.toolArgs && <IOSection title="Tool Arguments" content={JSON.stringify(span.toolArgs, null, 2)} variant="json" />}

      {/* Tool Result */}
      {span.toolResult && <IOSection title="Tool Result" content={span.toolResult} variant="output" />}

      {/* Error */}
      {span.errorMessage && (
        <div className="px-4 py-3">
          <h5 className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Error {span.errorType && `(${span.errorType})`}
          </h5>
          <pre className="text-[11px] bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-2.5 rounded-lg whitespace-pre-wrap max-h-40 overflow-y-auto border border-red-200 dark:border-red-800">
            {span.errorMessage}
          </pre>
        </div>
      )}

      {/* Metadata */}
      {span.metadata && Object.keys(span.metadata).length > 0 && (
        <IOSection title="Metadata" content={JSON.stringify(span.metadata, null, 2)} variant="json" />
      )}

      {/* Timing + IDs */}
      <div className="px-4 py-3">
        <h5 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Timing & IDs</h5>
        <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500 font-mono">
          <span>Start: {span.startTime ? new Date(Number(span.startTime)).toISOString() : '—'}</span>
          <span>End: {span.endTime ? new Date(Number(span.endTime)).toISOString() : '—'}</span>
          <span>Span: {span.spanId}</span>
          <span>Parent: {span.parentSpanId || '—'}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────

function MetricCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-gray-50 dark:bg-slate-900/50 rounded-lg p-2">
      <div className="text-gray-400 mt-0.5">{icon}</div>
      <div>
        <p className="text-[9px] text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-xs font-semibold text-gray-900 dark:text-white">{value}</p>
        {sub && <p className="text-[9px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

// ─── I/O Section ──────────────────────────────────────────────

function IOSection({ title, content, variant }: { title: string; content: string; variant: 'input' | 'output' | 'json' }) {
  const [expanded, setExpanded] = useState(true);
  const colors = {
    input: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10',
    output: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10',
    json: 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900',
  };

  // Try to pretty-print JSON
  let displayContent = content;
  if (variant === 'json' || content.trim().startsWith('{') || content.trim().startsWith('[')) {
    try {
      displayContent = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      displayContent = content;
    }
  }

  return (
    <div className="px-4 py-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 hover:text-gray-700 dark:hover:text-gray-300"
      >
        {expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
        {title}
        <span className="text-gray-400 font-normal normal-case">({content.length} chars)</span>
      </button>
      {expanded && (
        <pre className={`text-[11px] p-2.5 rounded-lg whitespace-pre-wrap max-h-48 overflow-y-auto border text-gray-800 dark:text-gray-200 ${colors[variant]}`}>
          {displayContent}
        </pre>
      )}
    </div>
  );
}
