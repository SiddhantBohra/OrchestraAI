'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/store';
import { policiesApi } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/utils';
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  DollarSign,
  Zap,
  Lock,
} from 'lucide-react';

const POLICY_TYPE_INFO: Record<string, { icon: any; label: string; color: string }> = {
  budget: { icon: DollarSign, label: 'Budget', color: 'bg-green-100 text-green-700' },
  rate_limit: { icon: Zap, label: 'Rate Limit', color: 'bg-blue-100 text-blue-700' },
  tool_permission: { icon: Lock, label: 'Tool Permission', color: 'bg-purple-100 text-purple-700' },
  runaway_detection: { icon: AlertTriangle, label: 'Runaway Detection', color: 'bg-red-100 text-red-700' },
  pii_redaction: { icon: Shield, label: 'PII Redaction', color: 'bg-amber-100 text-amber-700' },
};

export default function PoliciesPage() {
  const { currentProject } = useProjectStore();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: policies, isLoading } = useQuery({
    queryKey: ['policies', currentProject?.id],
    queryFn: () => policiesApi.list(currentProject!.id),
    enabled: !!currentProject,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      policiesApi.update(currentProject!.id, id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => policiesApi.delete(currentProject!.id, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
  });

  const createDefaultsMutation = useMutation({
    mutationFn: () => policiesApi.createDefaults(currentProject!.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['policies'] }),
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
            Policies
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Control plane rules for agent governance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => createDefaultsMutation.mutate()}
            disabled={createDefaultsMutation.isPending}
            className="text-purple-600 hover:text-purple-700 text-sm font-medium"
          >
            {createDefaultsMutation.isPending ? 'Creating...' : 'Add Default Policies'}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Plus className="h-5 w-5" />
            Create Policy
          </button>
        </div>
      </div>

      {/* Policies List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-24 bg-gray-200 dark:bg-slate-700 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : policies?.data?.length > 0 ? (
        <div className="space-y-4">
          {(policies?.data ?? []).map((policy: any) => {
            const typeInfo = POLICY_TYPE_INFO[policy.type] || POLICY_TYPE_INFO.budget;
            const Icon = typeInfo.icon;

            return (
              <div
                key={policy.id}
                className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {policy.name}
                        </h3>
                        <span className={`text-xs px-2 py-0.5 rounded ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                          Priority: {policy.priority}
                        </span>
                      </div>
                      {policy.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                          {policy.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>
                          Action: <strong className="text-gray-700 dark:text-gray-300">{policy.action}</strong>
                        </span>
                        <span>
                          Triggered: <strong className="text-gray-700 dark:text-gray-300">{formatNumber(policy.triggerCount)} times</strong>
                        </span>
                        {policy.lastTriggeredAt && (
                          <span>Last: {formatDate(policy.lastTriggeredAt)}</span>
                        )}
                      </div>
                      {/* Conditions preview */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(policy.conditions).map(([key, value]) => (
                          <span
                            key={key}
                            className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded"
                          >
                            {key}: {JSON.stringify(value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        toggleMutation.mutate({
                          id: policy.id,
                          isActive: !policy.isActive,
                        })
                      }
                      className={`p-2 rounded-lg transition ${
                        policy.isActive
                          ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                          : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {policy.isActive ? (
                        <ToggleRight className="h-6 w-6" />
                      ) : (
                        <ToggleLeft className="h-6 w-6" />
                      )}
                    </button>
                    <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition">
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this policy?')) {
                          deleteMutation.mutate(policy.id);
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No policies configured
          </h3>
          <p className="text-gray-500 mb-4">
            Policies help you control agent behavior and prevent runaway costs.
          </p>
          <button
            onClick={() => createDefaultsMutation.mutate()}
            className="text-purple-600 hover:text-purple-700 font-medium"
          >
            Create default policies
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreatePolicyModal
          projectId={currentProject.id}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['policies'] });
          }}
        />
      )}
    </div>
  );
}

function CreatePolicyModal({
  projectId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('budget');
  const [action, setAction] = useState('warn');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(10);
  const [loading, setLoading] = useState(false);

  // Condition fields
  const [maxBudget, setMaxBudget] = useState('');
  const [maxLoopsPerMinute, setMaxLoopsPerMinute] = useState('');
  const [blockedTools, setBlockedTools] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const conditions: any = {};
    if (type === 'budget' && maxBudget) {
      conditions.maxBudget = parseFloat(maxBudget);
      conditions.budgetPeriod = 'daily';
    }
    if (type === 'runaway_detection' && maxLoopsPerMinute) {
      conditions.maxLoopsPerMinute = parseInt(maxLoopsPerMinute);
    }
    if (type === 'tool_permission' && blockedTools) {
      conditions.blockedTools = blockedTools.split(',').map((t) => t.trim());
    }

    try {
      await policiesApi.create(projectId, {
        name,
        type,
        action,
        description,
        priority,
        conditions,
      });
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Create Policy
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
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              >
                <option value="budget">Budget</option>
                <option value="rate_limit">Rate Limit</option>
                <option value="tool_permission">Tool Permission</option>
                <option value="runaway_detection">Runaway Detection</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Action
              </label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              >
                <option value="allow">Allow</option>
                <option value="warn">Warn</option>
                <option value="block">Block</option>
                <option value="kill">Kill Agent</option>
                <option value="escalate">Escalate</option>
              </select>
            </div>
          </div>

          {/* Condition fields based on type */}
          {type === 'budget' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Budget (USD/day)
              </label>
              <input
                type="number"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                placeholder="10"
              />
            </div>
          )}

          {type === 'runaway_detection' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max Loops Per Minute
              </label>
              <input
                type="number"
                value={maxLoopsPerMinute}
                onChange={(e) => setMaxLoopsPerMinute(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                placeholder="50"
              />
            </div>
          )}

          {type === 'tool_permission' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Blocked Tools (comma-separated)
              </label>
              <input
                type="text"
                value={blockedTools}
                onChange={(e) => setBlockedTools(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                placeholder="delete_database, send_money"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Priority (higher = evaluated first)
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              rows={2}
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
              {loading ? 'Creating...' : 'Create Policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
