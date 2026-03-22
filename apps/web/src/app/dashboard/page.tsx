'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/store';
import { dashboardApi } from '@/lib/api';
import {
  formatCurrency,
  formatNumber,
  formatDuration,
  formatDate,
  getStatusColor,
  getTraceTypeColor,
} from '@/lib/utils';
import {
  Activity,
  Bot,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  Clock,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

export default function DashboardPage() {
  const { currentProject } = useProjectStore();

  const { data: overview, isLoading } = useQuery({
    queryKey: ['dashboard-overview', currentProject?.id],
    queryFn: () => dashboardApi.overview(currentProject!.id),
    enabled: !!currentProject,
    refetchInterval: 5000, // Refresh every 5s
  });

  if (!currentProject) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <Bot className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Project Selected
          </h3>
          <p className="text-gray-500">
            Create a project to start monitoring your agents.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-8">
          <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded w-64" />
          <div className="grid grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-slate-700 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const data = overview?.data;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          {currentProject.name} overview
        </p>
      </div>

      {/* Runaway Alerts */}
      {data?.runawayAlerts?.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">
              {data.runawayAlerts.length} runaway agent(s) detected!
            </span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-red-600 dark:text-red-400">
            {data.runawayAlerts.map((alert: any, i: number) => (
              <li key={i}>
                {alert.agentName}: {alert.callCount} calls in 5 min,{' '}
                {formatNumber(alert.tokensBurned)} tokens burned
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Agents"
          value={data?.summary?.totalAgents || 0}
          subtitle={`${data?.summary?.activeAgents || 0} active`}
          icon={<Bot className="h-6 w-6" />}
          trend={data?.summary?.erroredAgents > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          title="Cost (24h)"
          value={formatCurrency(data?.summary?.totalCost24h || 0)}
          subtitle={`${formatNumber(data?.summary?.totalTokens24h || 0)} tokens`}
          icon={<DollarSign className="h-6 w-6" />}
          trend="neutral"
        />
        <StatCard
          title="Recent Errors"
          value={data?.summary?.recentErrorCount || 0}
          subtitle="Last 24 hours"
          icon={<AlertTriangle className="h-6 w-6" />}
          trend={data?.summary?.recentErrorCount > 0 ? 'warning' : 'success'}
        />
        <StatCard
          title="Runaway Alerts"
          value={data?.summary?.runawayAlertCount || 0}
          subtitle="Active now"
          icon={<Zap className="h-6 w-6" />}
          trend={data?.summary?.runawayAlertCount > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Cost by Agent */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Cost by Agent (24h)
          </h3>
          {data?.costByAgent?.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.costByAgent}
                    dataKey="totalCost"
                    nameKey="agentName"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ agentName, percent }) =>
                      `${agentName || 'Unknown'} (${(percent * 100).toFixed(0)}%)`
                    }
                  >
                    {data.costByAgent.map((_: any, index: number) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No data yet
            </div>
          )}
        </div>

        {/* Model Usage */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Model Usage (24h)
          </h3>
          <div className="space-y-4">
            {data?.modelUsage?.length > 0 ? (
              data.modelUsage.map((model: any, i: number) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {model.model || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatNumber(model.callCount)} calls · {formatNumber(model.totalTokens)} tokens
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(model.totalCost)}
                    </p>
                    <p className="text-xs text-gray-500">
                      avg {Math.round(model.avgLatency)}ms
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 py-8">No data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Runs & Errors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Runs */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Recent Agent Runs
          </h3>
          <div className="space-y-3">
            {data?.recentRuns?.length > 0 ? (
              data.recentRuns.slice(0, 5).map((run: any) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-slate-700 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {run.agentName || 'Unknown Agent'}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(run.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {formatDuration(run.durationMs || 0)}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${getStatusColor(run.status)}`}
                    >
                      {run.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 py-8">No runs yet</div>
            )}
          </div>
        </div>

        {/* Recent Errors */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Recent Errors
          </h3>
          <div className="space-y-3">
            {data?.recentErrors?.length > 0 ? (
              data.recentErrors.slice(0, 5).map((error: any) => (
                <div
                  key={error.id}
                  className="py-2 border-b border-gray-100 dark:border-slate-700 last:border-0"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {error.agentName || 'Unknown Agent'}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(error.createdAt)}</p>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 truncate">
                    {error.errorType}: {error.errorMessage}
                  </p>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 py-8">No errors 🎉</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  trend: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const trendColors = {
    success: 'text-green-600 bg-green-100',
    warning: 'text-amber-600 bg-amber-100',
    danger: 'text-red-600 bg-red-100',
    neutral: 'text-purple-600 bg-purple-100',
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {title}
        </span>
        <div className={`p-2 rounded-lg ${trendColors[trend]}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
    </div>
  );
}
