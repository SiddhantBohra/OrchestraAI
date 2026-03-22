'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import Link from 'next/link';
import {
  Activity,
  Shield,
  Zap,
  Eye,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (_hasHydrated && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, _hasHydrated, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Activity className="h-8 w-8 text-purple-400" />
            <span className="text-2xl font-bold text-white">OrchestraAI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-gray-300 hover:text-white transition"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
            The Control Plane for
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              {' '}
              Autonomous Agents
            </span>
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
            Observe what your agents think and do. Control what they're allowed to do.
            Govern cost, safety, and correctness. Enable human intervention at the right time.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/register"
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-lg text-lg font-medium transition"
            >
              Start Free Trial
            </Link>
            <a
              href="https://docs.orchestra.ai"
              className="border border-white/20 hover:border-white/40 text-white px-8 py-3 rounded-lg text-lg font-medium transition"
            >
              View Docs
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          Everything you need for production agents
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Eye className="h-8 w-8" />}
            title="Agent Trace Explorer"
            description="Visualize agent reasoning, tool calls, and LLM interactions in a beautiful timeline view."
          />
          <FeatureCard
            icon={<DollarSign className="h-8 w-8" />}
            title="Cost Governance"
            description="Set budgets per agent, project, or team. Automatic kill-switches prevent runaway costs."
          />
          <FeatureCard
            icon={<AlertTriangle className="h-8 w-8" />}
            title="Runaway Detection"
            description="Detect loops, hallucinations, and token burn velocity. Automatic intervention before it's too late."
          />
          <FeatureCard
            icon={<Shield className="h-8 w-8" />}
            title="Policy Engine"
            description="Define what tools each agent can use. Block dangerous actions before they happen."
          />
          <FeatureCard
            icon={<Zap className="h-8 w-8" />}
            title="Real-time Metrics"
            description="Tokens per outcome, loop rate, tool failure rate. Know your agents inside out."
          />
          <FeatureCard
            icon={<Activity className="h-8 w-8" />}
            title="Framework Support"
            description="LangGraph, CrewAI, OpenAI Agents SDK, and more. One SDK, all frameworks."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-12 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to take control of your agents?
          </h2>
          <p className="text-lg text-white/80 mb-8">
            Start with our free tier. No credit card required.
          </p>
          <Link
            href="/register"
            className="bg-white text-purple-600 px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-100 transition"
          >
            Get Started for Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400">
          <p>© 2026 OrchestraAI. Built for engineers running agents in production.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-purple-500/50 transition">
      <div className="text-purple-400 mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}
