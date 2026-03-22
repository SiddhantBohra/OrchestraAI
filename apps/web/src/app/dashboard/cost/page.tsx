'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/store';
import { dashboardApi, projectsApi } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/utils';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

export default function CostPage() {
  const { currentProject } = useProjectStore();
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');

  const { data: costData, isLoading } = useQuery({
    queryKey: ['cost-analytics', currentProject?.id, period],
    queryFn: () => dashboardApi.cost(currentProject!.id, period),
    enabled: !!currentProject,
  });

  const { data: budgetData } = useQuery({
    queryKey: ['budget', currentProject?.id],
    queryFn: () => projectsApi.checkBudget(currentProject!.id),
    enabled: !!currentProject,
  });

  if (!currentProject) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a project first.
      </div>
    );
  }

  const data = costData?.data;
  const budget = budgetData?.data;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Cost Analytics
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Track and analyze your AI spending
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-slate-700">
          {(['day', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                period === p
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-48 bg-gray-200 dark:bg-slate-700 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Total Cost"
              value={formatCurrency(data?.totalCost || 0)}
              subtitle={`This ${period}`}
              icon={<DollarSign className="h-6 w-6" />}
              color="purple"
            />
            <StatCard
              title="Total Tokens"
              value={formatNumber(data?.totalTokens || 0)}
              subtitle={`This ${period}`}
              icon={<TrendingUp className="h-6 w-6" />}
              color="blue"
            />
            <StatCard
              title="Budget Remaining"
              value={formatCurrency(budget?.remaining || 0)}
              subtitle={`${data?.budgetUtilization || 0}% used`}
              icon={<PieChartIcon className="h-6 w-6" />}
              color="green"
            />
            <StatCard
              title="Budget Status"
              value={budget?.allowed ? 'Active' : 'Exceeded'}
              subtitle={budget?.allowed ? 'Within limits' : 'Kill-switch may activate'}
              icon={<AlertTriangle className="h-6 w-6" />}
              color={budget?.allowed ? 'green' : 'red'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Cost by Agent */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Cost by Agent
              </h3>
              {data?.costByAgent?.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.costByAgent} layout="vertical">
                      <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                      <YAxis
                        type="category"
                        dataKey="agentName"
                        width={120}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => `Agent: ${label}`}
                      />
                      <Bar dataKey="cost" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-80 flex items-center justify-center text-gray-500">
                  No cost data for this period
                </div>
              )}
            </div>

            {/* Cost by Model */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Cost by Model
              </h3>
              {data?.costByModel?.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.costByModel}
                        dataKey="cost"
                        nameKey="model"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ model, percent }) =>
                          `${model} (${(percent * 100).toFixed(0)}%)`
                        }
                        labelLine={false}
                      >
                        {data.costByModel.map((_: any, index: number) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-80 flex items-center justify-center text-gray-500">
                  No cost data for this period
                </div>
              )}
            </div>
          </div>

          {/* Model Details Table */}
          <div className="mt-8 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Model Usage Details
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Model
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Calls
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Tokens
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Avg Latency
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                  {data?.costByModel?.map((model: any, i: number) => (
                    <tr key={i}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {model.model || 'Unknown'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">
                        {formatNumber(model.calls)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">
                        {formatNumber(model.tokens)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">
                        {model.avgLatency}ms
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white text-right">
                        {formatCurrency(model.cost)}
                      </td>
                    </tr>
                  ))}
                  {(!data?.costByModel || data.costByModel.length === 0) && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-gray-500"
                      >
                        No data for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: 'purple' | 'blue' | 'green' | 'red';
}) {
  const colorClasses = {
    purple: 'bg-purple-100 text-purple-600',
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {title}
        </span>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
    </div>
  );
}
