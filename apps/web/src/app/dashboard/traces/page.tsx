'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/store';
import { tracesApi, getTraceStreamUrl } from '@/lib/api';
import {
  formatDuration,
  formatDate,
  formatNumber,
  formatCurrency,
  getStatusColor,
  getTraceTypeColor,
  getTraceTypeIconColor,
  getTraceTypeLabel,
  getDurationBarColor,
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
  Copy,
  Check,
  Activity,
  Shield,
  Bot,
  ArrowRight,
  Layers,
} from 'lucide-react';

// ─── Icon mapping ─────────────────────────────────────────────

function TraceTypeIcon({ type, className = 'h-3.5 w-3.5' }: { type: string; className?: string }) {
  switch (type) {
    case 'llm_call': return <Brain className={className} />;
    case 'tool_call': return <Wrench className={className} />;
    case 'retriever': return <Database className={className} />;
    case 'agent_action': return <Zap className={className} />;
    case 'agent_run': return <Bot className={className} />;
    case 'human_input': return <User className={className} />;
    case 'error': return <AlertTriangle className={className} />;
    case 'step': return <Layers className={className} />;
    default: return <MessageSquare className={className} />;
  }
}

// ─── Copyable ID ──────────────────────────────────────────────

function CopyableId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
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
    gray: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
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
  const queryClient = useQueryClient();
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<any | null>(null);
  const [filter, setFilter] = useState({ status: '', search: '' });
  const [isLive, setIsLive] = useState(true);
  const [panelWidths, setPanelWidths] = useState({ left: 260, right: 420 });
  const eventSourceRef = useRef<EventSource | null>(null);

  const { data: agentRuns, isLoading } = useQuery({
    queryKey: ['agent-runs', currentProject?.id, filter],
    queryFn: () => tracesApi.list(currentProject!.id, { type: 'agent_run', status: filter.status || undefined, limit: 100 }),
    enabled: !!currentProject,
    refetchInterval: 5000, // Fallback polling (SSE handles real-time)
  });

  const { data: traceTree } = useQuery({
    queryKey: ['trace-tree', currentProject?.id, selectedTraceId],
    queryFn: () => tracesApi.getTree(currentProject!.id, selectedTraceId!),
    enabled: !!currentProject && !!selectedTraceId,
    refetchInterval: 5000, // Fallback polling
  });

  // ── SSE: Real-time trace updates ──────────────────────────────
  useEffect(() => {
    if (!currentProject?.id || !isLive) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;

    const url = `${getTraceStreamUrl(currentProject.id)}?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'heartbeat') return;

        // Invalidate relevant queries so they refetch instantly
        queryClient.invalidateQueries({ queryKey: ['agent-runs', currentProject.id] });
        if (selectedTraceId && data.traceId === selectedTraceId) {
          queryClient.invalidateQueries({ queryKey: ['trace-tree', currentProject.id, selectedTraceId] });
        }
      } catch {
        // Ignore parse errors from heartbeats
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [currentProject?.id, isLive, selectedTraceId, queryClient]);

  if (!currentProject) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Please select a project first.</div>;
  }

  // Deduplicate agent runs: keep latest status per traceId
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

  // Auto-select first span when tree loads and nothing is selected
  const firstLeafSpan = tree.length > 0 && !selectedSpan ? findFirstLeaf(tree) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700/80 bg-white dark:bg-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Trace Explorer</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Debug and analyze agent execution traces</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                placeholder="Search traces..."
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder:text-gray-400 w-56 focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition"
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
            <button
              onClick={() => setIsLive(!isLive)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition ${
                isLive
                  ? 'border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-500 dark:text-gray-400'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              {isLive ? 'Live' : 'Paused'}
            </button>
          </div>
        </div>
      </div>

      {/* Three-panel resizable layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left — Agent Runs List */}
        <div style={{ width: panelWidths.left }} className="flex-shrink-0 border-r border-gray-200 dark:border-slate-700/80 flex flex-col bg-white dark:bg-slate-800/50">
          <div className="px-3 py-2.5 border-b border-gray-100 dark:border-slate-700/60 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Agent Runs {runs.length > 0 && `(${runs.length})`}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <div key={i} className="px-3 py-3 animate-pulse border-b border-gray-100 dark:border-slate-700/40">
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
                  className={`w-full px-3 py-3 text-left border-b border-gray-100 dark:border-slate-700/40 transition-colors ${
                    selectedTraceId === run.traceId
                      ? 'bg-purple-50 dark:bg-purple-500/10 border-l-2 border-l-purple-500'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-700/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold text-[13px] text-gray-900 dark:text-gray-100 truncate">
                      {run.agentName || run.name}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${getStatusColor(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  {/* Input preview subtitle — helps distinguish traces */}
                  {run.input && (
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 truncate mb-1 leading-tight">
                      {run.input.length > 60 ? run.input.slice(0, 60) + '...' : run.input}
                    </p>
                  )}
                  {!run.input && run.metadata?.task && (
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 truncate mb-1 leading-tight">
                      {String(run.metadata.task).length > 60 ? String(run.metadata.task).slice(0, 60) + '...' : String(run.metadata.task)}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                    {run.metadata?.framework && (
                      <span className="text-[9px] px-1.5 py-px rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 font-medium">
                        {run.metadata.framework}
                      </span>
                    )}
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
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">{formatDate(run.createdAt)}</p>
                </button>
              ))
            ) : (
              <div className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-xs">
                No agent runs yet.<br />Send traces via the SDK to see them here.
              </div>
            )}
          </div>
        </div>

        {/* Resize handle: Left ↔ Middle */}
        <ResizeHandle onResize={(dx) => setPanelWidths(prev => ({
          ...prev,
          left: Math.max(180, Math.min(500, prev.left + dx)),
        }))} />

        {/* Middle — Trace Tree + Header */}
        <div className="flex-1 flex flex-col min-w-[300px]">
          {/* Trace header with stats */}
          {selectedTraceId && traceStats && (
            <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700/60 bg-gray-50/80 dark:bg-slate-800/80">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {traceStats.agentName && (
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{traceStats.agentName}</span>
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
              <div className="text-center text-gray-400 dark:text-gray-500 py-12 text-xs">Loading trace tree...</div>
            ) : (
              <EmptyState
                icon={<Activity className="h-10 w-10" />}
                title="No trace selected"
                description="Select an agent run from the left panel to inspect its execution trace"
              />
            )}
          </div>
        </div>

        {/* Resize handle: Middle ↔ Right */}
        <ResizeHandle onResize={(dx) => setPanelWidths(prev => ({
          ...prev,
          right: Math.max(280, Math.min(700, prev.right - dx)),
        }))} />

        {/* Right — Span Detail */}
        <div style={{ width: panelWidths.right }} className="flex-shrink-0 flex flex-col bg-white dark:bg-slate-800/50">
          <div className="px-4 py-2.5 border-b border-gray-200 dark:border-slate-700/60 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {selectedSpan || firstLeafSpan ? 'Span Details' : 'Details'}
            </h3>
            {(selectedSpan || firstLeafSpan) && (
              <button onClick={() => setSelectedSpan(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"><X className="h-3.5 w-3.5" /></button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {(selectedSpan || firstLeafSpan) ? <SpanDetail span={selectedSpan || firstLeafSpan} /> : (
              <EmptyState
                icon={<Shield className="h-10 w-10" />}
                title="No span selected"
                description={selectedTraceId ? "Click a span in the trace tree to view its details" : "Select a trace first, then click any span"}
              />
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

/** Find the first meaningful span in the tree for auto-select */
function findFirstLeaf(nodes: any[]): any | null {
  for (const n of nodes) {
    if (n.children && n.children.length > 0) {
      const found = findFirstLeaf(n.children);
      if (found) return found;
    }
    return n;
  }
  return null;
}

// ─── Trace Tree Node ──────────────────────────────────────────

function TraceNode({ node, depth, selectedSpanId, onSelect, maxDuration }: {
  node: any; depth: number; selectedSpanId?: string; onSelect: (s: any) => void; maxDuration: number;
}) {
  const [expanded, setExpanded] = useState(depth < 3);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.spanId === selectedSpanId;
  const durationPct = maxDuration > 0 ? Math.max(2, (node.durationMs || 0) / maxDuration * 100) : 0;

  // Display name: for LLM calls, show "llm:model" like Langfuse
  const displayName = node.type === 'llm_call' && node.model
    ? `llm:${node.model}`
    : node.type === 'tool_call' && node.toolName
      ? `tool:${node.toolName}`
      : node.name;

  return (
    <div>
      <div
        style={{ paddingLeft: depth * 20 + 4 }}
        className={`group flex items-center gap-1.5 py-1.5 px-1.5 rounded-md cursor-pointer text-[12px] transition-all ${
          isSelected
            ? 'bg-purple-100 dark:bg-purple-500/15 ring-1 ring-purple-400/50 dark:ring-purple-500/40'
            : 'hover:bg-gray-100 dark:hover:bg-slate-700/40'
        }`}
        onClick={() => onSelect(node)}
      >
        {/* Tree connector line */}
        {depth > 0 && (
          <div className="w-3 h-px bg-gray-300 dark:bg-slate-600 flex-shrink-0 -ml-1.5 mr-0" />
        )}

        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-3 w-3 text-gray-500 dark:text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-500 dark:text-gray-400" />
          ) : <div className="w-3" />}
        </button>

        {/* Type badge with icon + label */}
        <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${getTraceTypeColor(node.type)}`}>
          <TraceTypeIcon type={node.type} className="h-3 w-3" />
          <span>{getTraceTypeLabel(node.type)}</span>
        </span>

        {/* Name */}
        <span className={`flex-1 truncate font-medium ${
          isSelected ? 'text-purple-900 dark:text-purple-200' : 'text-gray-800 dark:text-gray-200'
        }`}>
          {displayName}
        </span>

        {/* Token counts */}
        {(node.promptTokens || node.completionTokens) && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0 font-mono flex items-center gap-0.5">
            <span className="text-blue-600 dark:text-blue-400">{formatNumber(node.promptTokens || 0)}</span>
            <ArrowRight className="h-2.5 w-2.5 text-gray-400" />
            <span className="text-emerald-600 dark:text-emerald-400">{formatNumber(node.completionTokens || 0)}</span>
          </span>
        )}

        {/* Cost */}
        {node.cost != null && Number(node.cost) > 0 && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex-shrink-0 font-semibold">
            {formatCurrency(Number(node.cost))}
          </span>
        )}

        {/* Duration with proportional bar (heat-map colored) */}
        <div className="flex items-center gap-1 flex-shrink-0 w-24">
          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${getDurationBarColor(durationPct, node.status === 'failed')}`}
              style={{ width: `${durationPct}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 w-10 text-right font-mono">{formatDuration(node.durationMs || 0)}</span>
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
    <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold flex items-center gap-1 ${getTraceTypeColor(span.type)}`}>
            <TraceTypeIcon type={span.type} className="h-3 w-3" />{getTraceTypeLabel(span.type)}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${getStatusColor(span.status)}`}>{span.status}</span>
        </div>
        <h4 className="text-base font-bold text-gray-900 dark:text-white mb-1.5">{span.name}</h4>
        <div className="flex items-center gap-2 flex-wrap">
          {span.agentName && <Badge icon={<Activity className="h-2.5 w-2.5" />} label={span.agentName} />}
          {span.spanId && <CopyableId label="Span" value={span.spanId} />}
        </div>
      </div>

      {/* Metrics grid */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 gap-2.5">
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
          {span.metadata?.timeToFirstTokenMs != null && (
            <MetricCard label="Time to First Token" value={formatDuration(span.metadata.timeToFirstTokenMs)} icon={<Zap className="h-3.5 w-3.5" />} />
          )}
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
          <h5 className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Error {span.errorType && `(${span.errorType})`}
          </h5>
          <pre className="text-[11px] bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 p-3 rounded-lg whitespace-pre-wrap max-h-40 overflow-y-auto border border-red-200 dark:border-red-500/20">
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
        <h5 className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Timing & IDs</h5>
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[11px]">
          <div>
            <span className="text-gray-400 dark:text-gray-500">Start</span>
            <p className="font-mono text-gray-700 dark:text-gray-300">{span.startTime ? new Date(Number(span.startTime)).toISOString() : '—'}</p>
          </div>
          <div>
            <span className="text-gray-400 dark:text-gray-500">End</span>
            <p className="font-mono text-gray-700 dark:text-gray-300">{span.endTime ? new Date(Number(span.endTime)).toISOString() : '—'}</p>
          </div>
          <div>
            <span className="text-gray-400 dark:text-gray-500">Span ID</span>
            <p className="font-mono text-gray-700 dark:text-gray-300 truncate">{span.spanId}</p>
          </div>
          <div>
            <span className="text-gray-400 dark:text-gray-500">Parent</span>
            <p className="font-mono text-gray-700 dark:text-gray-300 truncate">{span.parentSpanId || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────

function MetricCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 bg-gray-50 dark:bg-slate-900/50 rounded-lg p-2.5 border border-gray-100 dark:border-slate-700/40">
      <div className="text-gray-400 dark:text-gray-500 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

// ─── I/O Section ──────────────────────────────────────────────

function IOSection({ title, content, variant }: { title: string; content: string; variant: 'input' | 'output' | 'json' }) {
  const [expanded, setExpanded] = useState(true);
  const colors = {
    input: 'border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/5',
    output: 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5',
    json: 'border-gray-200 dark:border-slate-600/40 bg-gray-50 dark:bg-slate-900/50',
  };
  const titleColors = {
    input: 'text-blue-600 dark:text-blue-400',
    output: 'text-emerald-600 dark:text-emerald-400',
    json: 'text-gray-500 dark:text-gray-400',
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
        className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-2 hover:opacity-80 transition ${titleColors[variant]}`}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
        <span className="text-gray-400 dark:text-gray-500 font-normal normal-case">({content.length} chars)</span>
      </button>
      {expanded && (
        <pre className={`text-[12px] p-3 rounded-lg whitespace-pre-wrap max-h-60 overflow-y-auto border text-gray-800 dark:text-gray-200 leading-relaxed ${colors[variant]}`}>
          {displayContent}
        </pre>
      )}
    </div>
  );
}

// ─── Resize Handle ────────────────────────────────────────────

function ResizeHandle({ onResize }: { onResize: (dx: number) => void }) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    let lastX = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - lastX;
      lastX = moveEvent.clientX;
      onResize(dx);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="w-1 flex-shrink-0 cursor-col-resize group relative hover:bg-purple-500/30 active:bg-purple-500/50 transition-colors"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-gray-300 dark:bg-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-20 px-6">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-700/50 text-gray-400 dark:text-gray-500 mb-4">
        {icon}
      </div>
      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">{title}</h4>
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-[200px]">{description}</p>
    </div>
  );
}
