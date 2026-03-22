'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/store';
import { agentsApi } from '@/lib/api';
import {
  formatCurrency,
  formatNumber,
  formatDate,
  getStatusColor,
} from '@/lib/utils';
import {
  Bot,
  Plus,
  MoreVertical,
  Skull,
  Trash2,
  Eye,
  Activity,
} from 'lucide-react';

export default function AgentsPage() {
  const { currentProject } = useProjectStore();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents', currentProject?.id],
    queryFn: () => agentsApi.list(currentProject!.id),
    enabled: !!currentProject,
  });

  const killMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.kill(currentProject!.id, agentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  if (!currentProject) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a project first.
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Agents
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage and monitor your registered agents
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition"
        >
          <Plus className="h-5 w-5" />
          Register Agent
        </button>
      </div>

      {/* Agents Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-48 bg-gray-200 dark:bg-slate-700 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : agents?.data?.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(agents?.data ?? []).map((agent: any) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onKill={() => killMutation.mutate(agent.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
          <Bot className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No agents registered
          </h3>
          <p className="text-gray-500 mb-4">
            Agents will appear here once you integrate the SDK.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-purple-600 hover:text-purple-700 font-medium"
          >
            Register your first agent
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateAgentModal
          projectId={currentProject.id}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['agents'] });
          }}
        />
      )}
    </div>
  );
}

function AgentCard({
  agent,
  onKill,
}: {
  agent: any;
  onKill: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const successRate = agent.totalRuns > 0
    ? ((agent.successfulRuns / agent.totalRuns) * 100).toFixed(1)
    : '0';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Bot className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {agent.name}
            </h3>
            <p className="text-xs text-gray-500">{agent.framework}</p>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600 z-10">
              <button className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-600">
                <Eye className="h-4 w-4" />
                View Details
              </button>
              <button
                onClick={() => {
                  onKill();
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-slate-600"
              >
                <Skull className="h-4 w-4" />
                Kill Agent
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="mb-4">
        <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(agent.status)}`}>
          {agent.status}
        </span>
        {agent.version && (
          <span className="ml-2 text-xs text-gray-500">v{agent.version}</span>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500 dark:text-gray-400">Total Runs</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {formatNumber(agent.totalRuns)}
          </p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400">Success Rate</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {successRate}%
          </p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400">Total Tokens</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {formatNumber(agent.totalTokens)}
          </p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400">Total Cost</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {formatCurrency(agent.totalCost)}
          </p>
        </div>
      </div>

      {/* Last Run */}
      {agent.lastRunAt && (
        <p className="mt-4 text-xs text-gray-500">
          Last run: {formatDate(agent.lastRunAt)}
        </p>
      )}
    </div>
  );
}

function CreateAgentModal({
  projectId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [framework, setFramework] = useState('langgraph');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await agentsApi.create(projectId, { name, framework, description });
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Register Agent
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              placeholder="My Agent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Framework
            </label>
            <select
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="langgraph">LangGraph</option>
              <option value="openai-agents">OpenAI Agents SDK</option>
              <option value="crewai">CrewAI</option>
              <option value="mastra">Mastra</option>
              <option value="llamaindex">LlamaIndex</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              placeholder="What does this agent do?"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded-lg transition"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
