'use client';

import React from 'react';

const colorMap: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

export function Badge({ icon, label, color = 'gray' }: { icon: React.ReactNode; label: string; color?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${colorMap[color] || colorMap.gray}`}>
      {icon}{label}
    </span>
  );
}
