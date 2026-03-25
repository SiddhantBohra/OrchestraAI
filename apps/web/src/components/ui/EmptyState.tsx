'use client';

import React from 'react';

export function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-20 px-6">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 dark:bg-slate-700/50 text-gray-400 dark:text-gray-500 mb-4">
        {icon}
      </div>
      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">{title}</h4>
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-[200px]">{description}</p>
    </div>
  );
}
