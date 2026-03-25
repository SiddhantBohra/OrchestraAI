'use client';

import { useState } from 'react';
import { X, Filter, Clock, DollarSign, Gauge, User, Hash, Bot, Brain, ChevronDown, Tag } from 'lucide-react';

export interface TraceFilters {
  status: string;
  search: string;
  model: string;
  agentName: string;
  minCost: string;
  minDuration: string;
  userId: string;
  sessionId: string;
  startDate: string;
  endDate: string;
  tags: string;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
}

export const defaultFilters: TraceFilters = {
  status: '',
  search: '',
  model: '',
  agentName: '',
  minCost: '',
  minDuration: '',
  userId: '',
  sessionId: '',
  startDate: '',
  endDate: '',
  tags: '',
  sortBy: 'createdAt',
  sortOrder: 'DESC',
};

const TIME_PRESETS = [
  { label: '1h', ms: 3600000 },
  { label: '6h', ms: 21600000 },
  { label: '24h', ms: 86400000 },
  { label: '7d', ms: 604800000 },
  { label: '30d', ms: 2592000000 },
];

interface FilterBarProps {
  filters: TraceFilters;
  onChange: (filters: TraceFilters) => void;
  agents?: { id: string; name: string }[];
  models?: string[];
}

export function FilterBar({ filters, onChange, agents = [], models = [] }: FilterBarProps) {
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = [
    filters.model, filters.agentName, filters.minCost, filters.minDuration,
    filters.userId, filters.sessionId, filters.startDate, filters.tags,
  ].filter(Boolean).length;

  const set = (key: keyof TraceFilters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const setTimeRange = (ms: number) => {
    const now = new Date();
    const start = new Date(now.getTime() - ms);
    onChange({
      ...filters,
      startDate: start.toISOString().slice(0, 16),
      endDate: '',
    });
  };

  const clearFilters = () => onChange({ ...defaultFilters, search: filters.search, status: filters.status });

  // Collect active filter chips
  const chips: { label: string; key: keyof TraceFilters }[] = [];
  if (filters.model) chips.push({ label: `Model: ${filters.model}`, key: 'model' });
  if (filters.agentName) chips.push({ label: `Agent: ${filters.agentName}`, key: 'agentName' });
  if (filters.minCost) chips.push({ label: `Cost ≥ $${filters.minCost}`, key: 'minCost' });
  if (filters.minDuration) chips.push({ label: `Latency ≥ ${filters.minDuration}ms`, key: 'minDuration' });
  if (filters.userId) chips.push({ label: `User: ${filters.userId}`, key: 'userId' });
  if (filters.sessionId) chips.push({ label: `Session: ${filters.sessionId}`, key: 'sessionId' });
  if (filters.startDate) chips.push({ label: `From: ${filters.startDate.replace('T', ' ')}`, key: 'startDate' });
  if (filters.endDate) chips.push({ label: `To: ${filters.endDate.replace('T', ' ')}`, key: 'endDate' });
  if (filters.tags) chips.push({ label: `Tags: ${filters.tags}`, key: 'tags' });

  return (
    <div className="border-b border-gray-200 dark:border-slate-700/80 bg-gray-50/50 dark:bg-slate-800/30">
      {/* Filter toggle + active chips */}
      <div className="px-4 py-2 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition ${
            showFilters || activeFilterCount > 0
              ? 'border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300'
              : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-400'
          }`}
        >
          <Filter className="h-3 w-3" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 px-1.5 py-px text-[9px] rounded-full bg-purple-500 text-white font-bold">{activeFilterCount}</span>
          )}
          <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {/* Active filter chips */}
        {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300"
          >
            {chip.label}
            <button onClick={() => set(chip.key, '')} className="hover:text-purple-900 dark:hover:text-purple-100">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {activeFilterCount > 1 && (
          <button onClick={clearFilters} className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            Clear all
          </button>
        )}

        {/* Sort control */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">Sort:</span>
          <select
            value={filters.sortBy}
            onChange={(e) => set('sortBy', e.target.value)}
            className="text-[11px] px-1.5 py-0.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300"
          >
            <option value="createdAt">Time</option>
            <option value="durationMs">Duration</option>
            <option value="cost">Cost</option>
            <option value="totalTokens">Tokens</option>
          </select>
          <button
            onClick={() => set('sortOrder', filters.sortOrder === 'DESC' ? 'ASC' : 'DESC')}
            className="text-[10px] px-1.5 py-0.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            {filters.sortOrder === 'DESC' ? '↓ Newest' : '↑ Oldest'}
          </button>
        </div>
      </div>

      {/* Expanded filter controls */}
      {showFilters && (
        <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {/* Time range presets */}
          <div className="col-span-2">
            <label className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Time Range
            </label>
            <div className="flex items-center gap-1">
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setTimeRange(preset.ms)}
                  className="px-2 py-0.5 text-[10px] font-medium rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:border-purple-300 dark:hover:border-purple-600 hover:text-purple-700 dark:hover:text-purple-300 transition"
                >
                  {preset.label}
                </button>
              ))}
              <input
                type="datetime-local"
                value={filters.startDate}
                onChange={(e) => set('startDate', e.target.value)}
                className="text-[10px] px-1.5 py-0.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 w-[140px]"
                placeholder="Start"
              />
              <span className="text-[10px] text-gray-400">→</span>
              <input
                type="datetime-local"
                value={filters.endDate}
                onChange={(e) => set('endDate', e.target.value)}
                className="text-[10px] px-1.5 py-0.5 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 w-[140px]"
                placeholder="End"
              />
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1 flex items-center gap-1">
              <Brain className="h-2.5 w-2.5" /> Model
            </label>
            {models.length > 0 ? (
              <select
                value={filters.model}
                onChange={(e) => set('model', e.target.value)}
                className="w-full text-[11px] px-2 py-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300"
              >
                <option value="">All models</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input
                type="text"
                value={filters.model}
                onChange={(e) => set('model', e.target.value)}
                placeholder="e.g. gpt-4o"
                className="w-full text-[11px] px-2 py-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
              />
            )}
          </div>

          {/* Agent */}
          <div>
            <label className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1 flex items-center gap-1">
              <Bot className="h-2.5 w-2.5" /> Agent
            </label>
            {agents.length > 0 ? (
              <select
                value={filters.agentName}
                onChange={(e) => set('agentName', e.target.value)}
                className="w-full text-[11px] px-2 py-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300"
              >
                <option value="">All agents</option>
                {agents.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            ) : (
              <input
                type="text"
                value={filters.agentName}
                onChange={(e) => set('agentName', e.target.value)}
                placeholder="Agent name"
                className="w-full text-[11px] px-2 py-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
              />
            )}
          </div>

          {/* Min Cost */}
          <div>
            <label className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1 flex items-center gap-1">
              <DollarSign className="h-2.5 w-2.5" /> Min Cost ($)
            </label>
            <input
              type="number"
              step="0.001"
              value={filters.minCost}
              onChange={(e) => set('minCost', e.target.value)}
              placeholder="0.00"
              className="w-full text-[11px] px-2 py-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
            />
          </div>

          {/* Min Duration */}
          <div>
            <label className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1 flex items-center gap-1">
              <Gauge className="h-2.5 w-2.5" /> Min Latency (ms)
            </label>
            <input
              type="number"
              value={filters.minDuration}
              onChange={(e) => set('minDuration', e.target.value)}
              placeholder="0"
              className="w-full text-[11px] px-2 py-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
            />
          </div>

          {/* User ID */}
          <div>
            <label className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1 flex items-center gap-1">
              <User className="h-2.5 w-2.5" /> User ID
            </label>
            <input
              type="text"
              value={filters.userId}
              onChange={(e) => set('userId', e.target.value)}
              placeholder="user-123"
              className="w-full text-[11px] px-2 py-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
            />
          </div>

          {/* Session ID */}
          <div>
            <label className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1 flex items-center gap-1">
              <Hash className="h-2.5 w-2.5" /> Session ID
            </label>
            <input
              type="text"
              value={filters.sessionId}
              onChange={(e) => set('sessionId', e.target.value)}
              placeholder="session-abc"
              className="w-full text-[11px] px-2 py-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium mb-1 flex items-center gap-1">
              <Tag className="h-2.5 w-2.5" /> Tags
            </label>
            <input
              type="text"
              value={filters.tags}
              onChange={(e) => set('tags', e.target.value)}
              placeholder="tag1, tag2"
              className="w-full text-[11px] px-2 py-1 border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}
