'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/store';
import { sessionsApi } from '@/lib/api';
import { formatDate, formatCurrency, formatNumber, formatDuration } from '@/lib/utils';
import {
  MessageSquare,
  Clock,
  Zap,
  DollarSign,
  User,
  Hash,
  ChevronRight,
  Bot,
  ArrowRight,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { CopyableId } from '@/components/ui/CopyableId';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

export default function SessionsPage() {
  const { currentProject } = useProjectStore();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(380);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', currentProject?.id],
    queryFn: () => sessionsApi.list(currentProject!.id, { limit: 100 }),
    enabled: !!currentProject,
    refetchInterval: 10000,
  });

  const { data: sessionTraces } = useQuery({
    queryKey: ['session-traces', currentProject?.id, selectedSessionId],
    queryFn: () => sessionsApi.get(currentProject!.id, selectedSessionId!),
    enabled: !!currentProject && !!selectedSessionId,
  });

  if (!currentProject) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Please select a project first.</div>;
  }

  const sessionList = sessions?.data || [];
  const traces = sessionTraces?.data || [];

  // Compute session stats
  const sessionStats = traces.length > 0 ? {
    turns: traces.length,
    totalDuration: traces.reduce((sum: number, t: any) => sum + (t.durationMs || 0), 0),
    totalCost: traces.reduce((sum: number, t: any) => sum + Number(t.cost || 0), 0),
    totalTokens: traces.reduce((sum: number, t: any) => sum + (t.totalTokens || 0), 0),
  } : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700/80 bg-white dark:bg-slate-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sessions</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">View multi-turn conversations grouped by session ID</p>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left — Session List */}
        <div style={{ width: leftWidth }} className="flex-shrink-0 border-r border-gray-200 dark:border-slate-700/80 flex flex-col bg-white dark:bg-slate-800/50">
          <div className="px-3 py-2.5 border-b border-gray-100 dark:border-slate-700/60 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Sessions {sessionList.length > 0 && `(${sessionList.length})`}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="px-4 py-3 animate-pulse border-b border-gray-100 dark:border-slate-700/40">
                  <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/2" />
                </div>
              ))
            ) : sessionList.length > 0 ? (
              sessionList.map((session: any) => (
                <button
                  key={session.sessionId}
                  onClick={() => setSelectedSessionId(session.sessionId)}
                  className={`w-full px-4 py-3 text-left border-b border-gray-100 dark:border-slate-700/40 transition-colors ${
                    selectedSessionId === session.sessionId
                      ? 'bg-purple-50 dark:bg-purple-500/10 border-l-2 border-l-purple-500'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-700/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[12px] font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {session.sessionId.length > 20 ? session.sessionId.slice(0, 20) + '...' : session.sessionId}
                    </span>
                    <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                    {session.userId && (
                      <span className="flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{session.userId}</span>
                    )}
                    <span className="flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" />{session.traceCount} turns</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
                    {Number(session.totalCost) > 0 && (
                      <span className="flex items-center gap-0.5"><DollarSign className="h-2.5 w-2.5" />{formatCurrency(Number(session.totalCost))}</span>
                    )}
                    {Number(session.totalTokens) > 0 && (
                      <span className="flex items-center gap-0.5"><Zap className="h-2.5 w-2.5" />{formatNumber(Number(session.totalTokens))}</span>
                    )}
                  </div>
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-1">{formatDate(session.lastSeen)}</p>
                </button>
              ))
            ) : (
              <div className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-xs">
                No sessions found.<br />Pass a session_id in your SDK traces to group conversations.
              </div>
            )}
          </div>
        </div>

        <ResizeHandle onResize={(dx) => setLeftWidth(prev => Math.max(250, Math.min(600, prev + dx)))} />

        {/* Right — Conversation View */}
        <div className="flex-1 flex flex-col min-w-[400px] bg-gray-50/50 dark:bg-slate-900/30">
          {selectedSessionId && sessionStats ? (
            <>
              {/* Session stats header */}
              <div className="px-6 py-3 border-b border-gray-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/80">
                <div className="flex items-center gap-2 mb-2">
                  <CopyableId label="Session" value={selectedSessionId} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge icon={<MessageSquare className="h-2.5 w-2.5" />} label={`${sessionStats.turns} turns`} color="purple" />
                  <Badge icon={<Clock className="h-2.5 w-2.5" />} label={formatDuration(sessionStats.totalDuration)} color="gray" />
                  {sessionStats.totalCost > 0 && (
                    <Badge icon={<DollarSign className="h-2.5 w-2.5" />} label={formatCurrency(sessionStats.totalCost)} color="green" />
                  )}
                  {sessionStats.totalTokens > 0 && (
                    <Badge icon={<Zap className="h-2.5 w-2.5" />} label={`${formatNumber(sessionStats.totalTokens)} tokens`} color="blue" />
                  )}
                </div>
              </div>

              {/* Conversation messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {traces.map((trace: any, i: number) => (
                  <div key={trace.id} className="space-y-2">
                    {/* Turn number */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase">Turn {i + 1}</span>
                      <span className="text-[9px] text-gray-400 dark:text-gray-500">{formatDate(trace.createdAt)}</span>
                      {trace.agentName && (
                        <span className="text-[9px] px-1.5 py-px rounded bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 font-medium flex items-center gap-0.5">
                          <Bot className="h-2 w-2" />{trace.agentName}
                        </span>
                      )}
                      {trace.durationMs != null && (
                        <span className="text-[9px] text-gray-400 dark:text-gray-500 flex items-center gap-0.5">
                          <Clock className="h-2 w-2" />{formatDuration(trace.durationMs)}
                        </span>
                      )}
                    </div>

                    {/* User input (left-aligned) */}
                    {trace.input && (
                      <div className="flex">
                        <div className="max-w-[70%] bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl rounded-tl-sm px-4 py-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <User className="h-3 w-3 text-blue-500" />
                            <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 uppercase">Input</span>
                          </div>
                          <p className="text-[12px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{trace.input}</p>
                        </div>
                      </div>
                    )}

                    {/* Agent output (right-aligned) */}
                    {trace.output && (
                      <div className="flex justify-end">
                        <div className="max-w-[70%] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl rounded-tr-sm px-4 py-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Bot className="h-3 w-3 text-emerald-500" />
                            <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Output</span>
                            {trace.cost != null && Number(trace.cost) > 0 && (
                              <span className="text-[9px] text-gray-400 ml-auto">{formatCurrency(Number(trace.cost))}</span>
                            )}
                          </div>
                          <p className="text-[12px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                            {trace.output.length > 1000 ? trace.output.slice(0, 1000) + '...' : trace.output}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {trace.errorMessage && (
                      <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                        <p className="text-[11px] text-red-700 dark:text-red-300">{trace.errorMessage}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<MessageSquare className="h-10 w-10" />}
              title="No session selected"
              description="Select a session from the left to view the conversation"
            />
          )}
        </div>
      </div>
    </div>
  );
}
