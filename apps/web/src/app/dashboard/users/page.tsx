'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/store';
import { usersApi } from '@/lib/api';
import { formatDate, formatCurrency, formatNumber } from '@/lib/utils';
import {
  Users,
  User,
  MessageSquare,
  Zap,
  DollarSign,
  Hash,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export default function UsersPage() {
  const { currentProject } = useProjectStore();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', currentProject?.id],
    queryFn: () => usersApi.list(currentProject!.id, { limit: 100 }),
    enabled: !!currentProject,
    refetchInterval: 15000,
  });

  const { data: userSessions } = useQuery({
    queryKey: ['user-sessions', currentProject?.id, selectedUserId],
    queryFn: () => usersApi.get(currentProject!.id, selectedUserId!),
    enabled: !!currentProject && !!selectedUserId,
  });

  if (!currentProject) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Please select a project first.</div>;
  }

  const userList = users?.data || [];
  const sessions = userSessions?.data || [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700/80 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-3">
          {selectedUserId && (
            <button
              onClick={() => setSelectedUserId(null)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {selectedUserId ? `User: ${selectedUserId}` : 'Users'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {selectedUserId ? 'Sessions and activity for this user' : 'Track end-user activity and costs'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedUserId ? (
          /* User table */
          <div className="p-6">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : userList.length > 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-7 gap-4 px-4 py-2.5 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <div className="col-span-2">User ID</div>
                  <div>Sessions</div>
                  <div>Traces</div>
                  <div>Total Cost</div>
                  <div>Total Tokens</div>
                  <div>Last Seen</div>
                </div>

                {/* Table rows */}
                {userList.map((u: any) => (
                  <button
                    key={u.userId}
                    onClick={() => setSelectedUserId(u.userId)}
                    className="w-full grid grid-cols-7 gap-4 px-4 py-3 border-b border-gray-100 dark:border-slate-700/40 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors text-left items-center"
                  >
                    <div className="col-span-2 flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <User className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate font-mono">
                        {u.userId}
                      </span>
                    </div>
                    <div className="text-[12px] text-gray-600 dark:text-gray-400 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />{u.sessionCount}
                    </div>
                    <div className="text-[12px] text-gray-600 dark:text-gray-400 flex items-center gap-1">
                      <Hash className="h-3 w-3" />{u.traceCount}
                    </div>
                    <div className="text-[12px] font-medium text-gray-900 dark:text-gray-100">
                      {Number(u.totalCost) > 0 ? formatCurrency(Number(u.totalCost)) : '—'}
                    </div>
                    <div className="text-[12px] text-gray-600 dark:text-gray-400">
                      {Number(u.totalTokens) > 0 ? formatNumber(Number(u.totalTokens)) : '—'}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      {formatDate(u.lastSeen)}
                      <ChevronRight className="h-3 w-3 text-gray-400 ml-auto" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Users className="h-10 w-10" />}
                title="No users tracked"
                description="Pass a userId in your SDK traces to track end-user activity"
              />
            )}
          </div>
        ) : (
          /* User detail — sessions list */
          <div className="p-6">
            {sessions.length > 0 ? (
              <div className="space-y-3">
                {sessions.map((session: any) => (
                  <div
                    key={session.sessionId}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[12px] font-semibold text-gray-900 dark:text-gray-100">
                        {session.sessionId}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(session.lastSeen)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{session.traceCount} turns</span>
                      {Number(session.totalCost) > 0 && (
                        <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{formatCurrency(Number(session.totalCost))}</span>
                      )}
                      {Number(session.totalTokens) > 0 && (
                        <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{formatNumber(Number(session.totalTokens))}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-400 text-xs py-12">No sessions found for this user.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
