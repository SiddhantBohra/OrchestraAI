'use client';

import { Brain, Wrench, Database, Zap, Bot, User, AlertTriangle, Layers, MessageSquare } from 'lucide-react';

export function TraceTypeIcon({ type, className = 'h-3.5 w-3.5' }: { type: string; className?: string }) {
  switch (type) {
    case 'llm_call': return <Brain className={className} />;
    case 'tool_call': return <Wrench className={className} />;
    case 'retriever': return <Database className={className} />;
    case 'agent_action': return <Zap className={className} />;
    case 'agent_run': return <Bot className={className} />;
    case 'human_input': return <User className={className} />;
    case 'error': return <AlertTriangle className={className} />;
    case 'step': return <Layers className={className} />;
    default: return <MessageSquare className={className} />;
  }
}
