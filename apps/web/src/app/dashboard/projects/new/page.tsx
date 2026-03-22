'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { projectsApi } from '@/lib/api';
import { useProjectStore } from '@/lib/store';
import { ArrowLeft, Folder, DollarSign, AlertTriangle } from 'lucide-react';

export default function NewProjectPage() {
  const router = useRouter();
  const { setCurrentProject } = useProjectStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [budgetLimit, setBudgetLimit] = useState('100');
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await projectsApi.create({
        name,
        description,
        budgetLimit: parseFloat(budgetLimit),
        killSwitchEnabled,
      });
      setCurrentProject(res.data);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
              <Folder className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Create New Project
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Projects help you organize your agents and set boundaries
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Project Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My AI Agent Project"
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What agents are you building?"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div className="border-t border-gray-200 dark:border-slate-700 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                Cost Governance
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monthly Budget Limit (USD)
                  </label>
                  <input
                    type="number"
                    value={budgetLimit}
                    onChange={(e) => setBudgetLimit(e.target.value)}
                    min="1"
                    placeholder="100"
                    className="w-48 px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Set a spending limit to prevent runaway costs
                  </p>
                </div>

                <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                  <input
                    type="checkbox"
                    id="killSwitch"
                    checked={killSwitchEnabled}
                    onChange={(e) => setKillSwitchEnabled(e.target.checked)}
                    className="mt-1 h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                  />
                  <label htmlFor="killSwitch" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Enable Kill-Switch
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Automatically block new agent requests when budget is exceeded.
                      Recommended for production safety.
                    </p>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-4 pt-4">
              <Link
                href="/dashboard"
                className="px-6 py-3 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading || !name}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition"
              >
                {loading ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
