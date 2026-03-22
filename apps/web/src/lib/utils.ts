import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(num);
}

export function formatNumber(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
    idle: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
    killed: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
    started: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
    timeout: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400',
  };
  return colors[status] || 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400';
}

export function getTraceTypeColor(type: string): string {
  const colors: Record<string, string> = {
    agent_run: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
    step: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    tool_call: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    llm_call: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
    retriever: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400',
    agent_action: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400',
    human_input: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  };
  return colors[type] || 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400';
}

/** Get the accent color for trace type icons */
export function getTraceTypeIconColor(type: string): string {
  const colors: Record<string, string> = {
    agent_run: 'text-purple-600 dark:text-purple-400',
    step: 'text-blue-600 dark:text-blue-400',
    tool_call: 'text-amber-600 dark:text-amber-400',
    llm_call: 'text-emerald-600 dark:text-emerald-400',
    retriever: 'text-cyan-600 dark:text-cyan-400',
    agent_action: 'text-indigo-600 dark:text-indigo-400',
    human_input: 'text-pink-600 dark:text-pink-400',
    error: 'text-red-600 dark:text-red-400',
  };
  return colors[type] || 'text-gray-500 dark:text-gray-400';
}

/** Duration bar color based on percentage of max (heat-map style) */
export function getDurationBarColor(pct: number, failed: boolean): string {
  if (failed) return 'bg-red-400 dark:bg-red-500';
  if (pct > 80) return 'bg-red-400 dark:bg-red-500';
  if (pct > 50) return 'bg-amber-400 dark:bg-amber-500';
  if (pct > 25) return 'bg-blue-400 dark:bg-blue-500';
  return 'bg-purple-400 dark:bg-purple-500';
}

/** Pretty label for span type */
export function getTraceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    agent_run: 'AGENT',
    step: 'SPAN',
    tool_call: 'TOOL',
    llm_call: 'LLM',
    retriever: 'RETRIEVER',
    agent_action: 'ACTION',
    human_input: 'HUMAN',
    error: 'ERROR',
  };
  return labels[type] || type.toUpperCase();
}
