'use client';

import { useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';

interface ExportButtonProps {
  traces: any[];
  isLoading?: boolean;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function tracesToCsv(traces: any[]): string {
  const headers = [
    'traceId', 'spanId', 'name', 'type', 'status', 'model',
    'durationMs', 'promptTokens', 'completionTokens', 'totalTokens',
    'cost', 'toolName', 'agentName', 'sessionId', 'userId',
    'startTime', 'endTime', 'errorType', 'errorMessage',
  ];
  const rows = traces.map((t) =>
    headers.map((h) => {
      const val = t[h];
      if (val == null) return '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export function ExportButton({ traces, isLoading }: ExportButtonProps) {
  const [open, setOpen] = useState(false);

  const exportJson = () => {
    downloadFile(JSON.stringify(traces, null, 2), `traces-${Date.now()}.json`, 'application/json');
    setOpen(false);
  };

  const exportCsv = () => {
    downloadFile(tracesToCsv(traces), `traces-${Date.now()}.csv`, 'text/csv');
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isLoading || traces.length === 0}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        <Download className="h-3 w-3" />
        Export
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[120px]">
            <button
              onClick={exportJson}
              className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/50"
            >
              Export JSON
            </button>
            <button
              onClick={exportCsv}
              className="w-full px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/50"
            >
              Export CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
