'use client';

import React from 'react';

export function MetricCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 bg-gray-50 dark:bg-slate-900/50 rounded-lg p-2.5 border border-gray-100 dark:border-slate-700/40">
      <div className="text-gray-400 dark:text-gray-500 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}
