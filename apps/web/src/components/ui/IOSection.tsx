'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';

/** Lightweight JSON syntax highlighter using regex token coloring */
function highlightJson(json: string): React.ReactNode {
  const parts = json.split(/("(?:\\.|[^"\\])*")/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      // It's a quoted string — check if it's a key (followed by :)
      const nextPart = parts[i + 1];
      if (nextPart && nextPart.trimStart().startsWith(':')) {
        return <span key={i} className="text-purple-600 dark:text-purple-400">{part}</span>;
      }
      return <span key={i} className="text-emerald-600 dark:text-emerald-400">{part}</span>;
    }
    // Highlight numbers, booleans, null in non-string parts
    return part.split(/(\b(?:true|false|null)\b|-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g).map((token, j) => {
      if (/^(true|false|null)$/.test(token)) {
        return <span key={`${i}-${j}`} className="text-orange-500 dark:text-orange-400">{token}</span>;
      }
      if (/^-?\d+\.?\d*(?:[eE][+-]?\d+)?$/.test(token)) {
        return <span key={`${i}-${j}`} className="text-blue-600 dark:text-blue-400">{token}</span>;
      }
      return token;
    });
  });
}

export function IOSection({ title, content, variant }: { title: string; content: string; variant: 'input' | 'output' | 'json' }) {
  const [expanded, setExpanded] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const colors = {
    input: 'border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/5',
    output: 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5',
    json: 'border-gray-200 dark:border-slate-600/40 bg-gray-50 dark:bg-slate-900/50',
  };
  const titleColors = {
    input: 'text-blue-600 dark:text-blue-400',
    output: 'text-emerald-600 dark:text-emerald-400',
    json: 'text-gray-500 dark:text-gray-400',
  };

  // Try to pretty-print JSON
  let displayContent = content;
  let isJson = false;
  if (variant === 'json' || content.trim().startsWith('{') || content.trim().startsWith('[')) {
    try {
      displayContent = JSON.stringify(JSON.parse(content), null, 2);
      isJson = true;
    } catch {
      displayContent = content;
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider hover:opacity-80 transition ${titleColors[variant]}`}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {title}
          <span className="text-gray-400 dark:text-gray-500 font-normal normal-case">({content.length} chars)</span>
        </button>
        {expanded && (
          <div className="flex items-center gap-1.5">
            {isJson && (
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="text-[9px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
              >
                {showRaw ? 'Formatted' : 'Raw'}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
              title="Copy content"
            >
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <pre className={`text-[12px] p-3 rounded-lg whitespace-pre-wrap max-h-60 overflow-y-auto border text-gray-800 dark:text-gray-200 leading-relaxed ${colors[variant]}`}>
          {isJson && !showRaw ? highlightJson(displayContent) : displayContent}
        </pre>
      )}
    </div>
  );
}
