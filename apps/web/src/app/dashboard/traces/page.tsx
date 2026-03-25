'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/store';
import { tracesApi, agentsApi, dashboardApi, getTraceStreamUrl } from '@/lib/api';
import {
  formatDuration,
  formatDate,
  formatNumber,
  formatCurrency,
  getStatusColor,
} from '@/lib/utils';
import {
  Search,
  Clock,
  Zap,
  DollarSign,
  X,
  Hash,
  User,
  Activity,
  Shield,
} from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { CopyableId } from '@/components/ui/CopyableId';
import { EmptyState } from '@/components/ui/EmptyState';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { TraceNode } from '@/components/traces/TraceNode';
import { SpanDetail } from '@/components/traces/SpanDetail';
import { FilterBar, TraceFilters, defaultFilters } from '@/components/traces/FilterBar';
import { ExportButton } from '@/components/traces/ExportButton';

// ─── Helpers ─────────────────────────────────────────────────

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
      if (n.userId && !userId) userId = n.userId;
      if (n.children) walk(n.children);
    }
  }
  walk(tree);
  return { totalCost, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, totalDuration, agentName, sessionId, userId };
}

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

// ─── Main Page ───────────────────────────────────────────────

export default function TracesPage() {
  const { currentProject } = useProjectStore();
  const queryClient = useQueryClient();
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<any | null>(null);
  const [filters, setFilters] = useState<TraceFilters>(defaultFilters);
  const [isLive, setIsLive] = useState(true);
  const [panelWidths, setPanelWidths] = useState({ left: 260, right: 420 });
  const [page, setPage] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const PAGE_SIZE = 50;

  // Build query params from filters
  const queryParams = {
    type: 'agent_run' as const,
    status: filters.status || undefined,
    agentName: filters.agentName || undefined,
    model: filters.model || undefined,
    minCost: filters.minCost ? Number(filters.minCost) : undefined,
    minDuration: filters.minDuration ? Number(filters.minDuration) : undefined,
    userId: filters.userId || undefined,
    sessionId: filters.sessionId || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    tags: filters.tags || undefined,
    sortBy: filters.sortBy || undefined,
    sortOrder: filters.sortOrder || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  // Fetch agents list for filter dropdown
  const { data: agentsList } = useQuery({
    queryKey: ['agents-list', currentProject?.id],
    queryFn: () => agentsApi.list(currentProject!.id),
    enabled: !!currentProject,
    staleTime: 60000,
  });

  // Fetch model usage for filter dropdown
  const { data: overviewData } = useQuery({
    queryKey: ['dashboard-overview', currentProject?.id],
    queryFn: () => dashboardApi.overview(currentProject!.id),
    enabled: !!currentProject,
    staleTime: 60000,
  });

  const agents = (agentsList?.data || []).map((a: any) => ({ id: a.id, name: a.name }));
  const models = (overviewData?.data?.modelUsage || []).map((m: any) => m.model).filter(Boolean);

  const { data: agentRuns, isLoading } = useQuery({
    queryKey: ['agent-runs', currentProject?.id, queryParams],
    queryFn: () => tracesApi.list(currentProject!.id, queryParams),
    enabled: !!currentProject,
    refetchInterval: 5000,
  });

  const { data: traceCount } = useQuery({
    queryKey: ['trace-count', currentProject?.id, queryParams],
    queryFn: () => tracesApi.count(currentProject!.id, { ...queryParams, limit: undefined, offset: undefined }),
    enabled: !!currentProject,
    refetchInterval: 15000,
  });

  const { data: traceTree } = useQuery({
    queryKey: ['trace-tree', currentProject?.id, selectedTraceId],
    queryFn: () => tracesApi.getTree(currentProject!.id, selectedTraceId!),
    enabled: !!currentProject && !!selectedTraceId,
    refetchInterval: 5000,
  });

  // Track selectedTraceId in a ref so SSE handler doesn't need to reconnect on selection change
  const selectedTraceIdRef = useRef(selectedTraceId);
  selectedTraceIdRef.current = selectedTraceId;

  // SSE: Real-time trace updates
  useEffect(() => {
    if (!currentProject?.id || !isLive) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;

    const projectId = currentProject.id;
    const url = `${getTraceStreamUrl(projectId)}?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      console.log('[SSE] Connected');
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'heartbeat' || data.type === 'connected') return;

        // Invalidate agent runs list (prefix match covers all filter variants)
        queryClient.invalidateQueries({ queryKey: ['agent-runs'] });
        queryClient.invalidateQueries({ queryKey: ['trace-count'] });

        // Invalidate the trace tree if we're viewing the same trace
        const currentTraceId = selectedTraceIdRef.current;
        if (currentTraceId && data.traceId === currentTraceId) {
          queryClient.invalidateQueries({ queryKey: ['trace-tree', projectId, currentTraceId] });
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = (err) => {
      console.warn('[SSE] Error — will auto-reconnect', err);
    };

    return () => { es.close(); eventSourceRef.current = null; };
  }, [currentProject?.id, isLive, queryClient]);

  if (!currentProject) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Please select a project first.</div>;
  }

  // Deduplicate agent runs
  const rawRuns = agentRuns?.data || [];
  const runMap = new Map<string, any>();
  for (const run of rawRuns) {
    const existing = runMap.get(run.traceId);
    if (!existing || run.status !== 'started') runMap.set(run.traceId, run);
  }
  const runs = Array.from(runMap.values())
    .filter((r: any) => !filters.search || r.name?.toLowerCase().includes(filters.search.toLowerCase()) || r.agentName?.toLowerCase().includes(filters.search.toLowerCase()));

  const tree = traceTree?.data || [];
  const traceStats = tree.length > 0 ? computeTraceStats(tree) : null;
  const firstLeafSpan = tree.length > 0 && !selectedSpan ? findFirstLeaf(tree) : null;
  const totalCount = traceCount?.data?.count || runs.length;

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
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Search traces..."
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder:text-gray-400 w-56 focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition"
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(0); }}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
            >
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="started">Running</option>
              <option value="timeout">Timeout</option>
            </select>
            <ExportButton traces={rawRuns} isLoading={isLoading} />
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

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onChange={(f) => { setFilters(f); setPage(0); }}
        agents={agents}
        models={models}
      />

      {/* Three-panel resizable layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left — Agent Runs List */}
        <div style={{ width: panelWidths.left }} className="flex-shrink-0 border-r border-gray-200 dark:border-slate-700/80 flex flex-col bg-white dark:bg-slate-800/50">
          <div className="px-3 py-2.5 border-b border-gray-100 dark:border-slate-700/60 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center justify-between">
            <span>Agent Runs {totalCount > 0 && `(${totalCount})`}</span>
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
              <>
                {runs.map((run: any) => (
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
                ))}
                {/* Pagination */}
                {totalCount > PAGE_SIZE && (
                  <div className="px-3 py-2 flex items-center justify-between border-t border-gray-100 dark:border-slate-700/40">
                    <button
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                      className="text-[10px] px-2 py-1 rounded border border-gray-300 dark:border-slate-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700/30"
                    >
                      Prev
                    </button>
                    <span className="text-[10px] text-gray-400">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                    </span>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={(page + 1) * PAGE_SIZE >= totalCount}
                      className="text-[10px] px-2 py-1 rounded border border-gray-300 dark:border-slate-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700/30"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-xs">
                No agent runs found.<br />
                {Object.values(filters).some(Boolean) ? 'Try adjusting your filters.' : 'Send traces via the SDK to see them here.'}
              </div>
            )}
          </div>
        </div>

        <ResizeHandle onResize={(dx) => setPanelWidths(prev => ({ ...prev, left: Math.max(180, Math.min(500, prev.left + dx)) }))} />

        {/* Middle — Trace Tree + Header */}
        <div className="flex-1 flex flex-col min-w-[300px]">
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

          <div className="flex-1 overflow-y-auto">
            {selectedTraceId && tree.length > 0 ? (
              <div>
                {/* Column headers */}
                <div className="flex items-center border-b border-gray-200 dark:border-slate-700/40 bg-gray-50 dark:bg-slate-800/60 sticky top-0 z-10">
                  <div className="flex-shrink-0 px-3 py-1.5 text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-r border-gray-100 dark:border-slate-700/40" style={{ width: '260px' }}>
                    Span
                  </div>
                  <div className="flex-1 flex items-center">
                    <div className="flex-1 flex justify-between px-3 text-[9px] text-gray-400 dark:text-gray-500 font-mono">
                      <span>0s</span>
                      {traceStats && traceStats.totalDuration > 0 && (
                        <>
                          <span>{formatDuration(traceStats.totalDuration * 0.25)}</span>
                          <span>{formatDuration(traceStats.totalDuration * 0.5)}</span>
                          <span>{formatDuration(traceStats.totalDuration * 0.75)}</span>
                          <span>{formatDuration(traceStats.totalDuration)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {/* Trace tree */}
                {tree.map((node: any) => (
                  <TraceNode
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedSpanId={selectedSpan?.spanId}
                    onSelect={setSelectedSpan}
                    maxDuration={traceStats?.totalDuration || 1}
                    traceStart={Number(node.startTime || 0)}
                  />
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

        <ResizeHandle onResize={(dx) => setPanelWidths(prev => ({ ...prev, right: Math.max(280, Math.min(700, prev.right - dx)) }))} />

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
