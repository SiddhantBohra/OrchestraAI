'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectStore } from '@/lib/store';
import { projectsApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  Settings,
  Key,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  DollarSign,
  Power,
} from 'lucide-react';

export default function SettingsPage() {
  const { currentProject, setCurrentProject } = useProjectStore();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [budgetLimit, setBudgetLimit] = useState(currentProject?.budgetLimit?.toString() || '100');
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(currentProject?.killSwitchEnabled ?? true);
  const [saving, setSaving] = useState(false);

  const regenerateMutation = useMutation({
    mutationFn: () => projectsApi.regenerateKey(currentProject!.id),
    onSuccess: (res) => {
      setCurrentProject(res.data);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const copyApiKey = () => {
    if (currentProject?.apiKey) {
      navigator.clipboard.writeText(currentProject.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = async () => {
    if (!currentProject) return;
    setSaving(true);
    try {
      const res = await projectsApi.update(currentProject.id, {
        budgetLimit: parseFloat(budgetLimit),
        killSwitchEnabled,
      });
      setCurrentProject(res.data);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    } finally {
      setSaving(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a project first.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Settings
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Configure your project settings
        </p>
      </div>

      <div className="space-y-8">
        {/* API Key Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Key className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                API Key
              </h2>
              <p className="text-sm text-gray-500">
                Use this key to authenticate your SDK
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-100 dark:bg-slate-700 rounded-lg px-4 py-3 font-mono text-sm text-gray-700 dark:text-gray-300">
              {currentProject.apiKey}
            </div>
            <button
              onClick={copyApiKey}
              className="p-3 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition"
            >
              {copied ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <Copy className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              )}
            </button>
            <button
              onClick={() => {
                if (confirm('Regenerate API key? This will invalidate the current key.')) {
                  regenerateMutation.mutate();
                }
              }}
              disabled={regenerateMutation.isPending}
              className="p-3 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition"
            >
              <RefreshCw
                className={`h-5 w-5 text-gray-600 dark:text-gray-400 ${
                  regenerateMutation.isPending ? 'animate-spin' : ''
                }`}
              />
            </button>
          </div>

          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Keep this key secret!</p>
                <p className="text-amber-600 dark:text-amber-400">
                  Never expose your API key in client-side code or public repositories.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Budget & Kill-Switch Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Cost Governance
              </h2>
              <p className="text-sm text-gray-500">
                Set budget limits and safety controls
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Monthly Budget Limit (USD)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  min="1"
                  className="w-48 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
                <span className="text-sm text-gray-500">
                  Current spend: {formatCurrency(currentProject.currentSpend || 0)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">
                  Kill-Switch
                </h3>
                <p className="text-sm text-gray-500">
                  Automatically block new requests when budget is exceeded
                </p>
              </div>
              <button
                onClick={() => setKillSwitchEnabled(!killSwitchEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  killSwitchEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    killSwitchEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white px-6 py-2 rounded-lg transition"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* SDK Installation */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Quick Start
          </h2>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Python
              </h3>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
                <code>{`pip install orchestra-ai

from orchestra_ai import OrchestraAI

oa = OrchestraAI(api_key="${currentProject.apiKey}")

with oa.trace("my-agent") as trace:
    # Your agent code here
    result = trace.llm_call(model="gpt-4o", ...)
`}</code>
              </pre>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                TypeScript / Node.js
              </h3>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
                <code>{`npm install @orchestra-ai/sdk

import { OrchestraAI } from '@orchestra-ai/sdk';

const oa = new OrchestraAI({ apiKey: '${currentProject.apiKey}' });

const trace = oa.startTrace('my-agent');
// Your agent code here
await trace.llmCall({ model: 'gpt-4o', ... });
trace.end();
`}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
