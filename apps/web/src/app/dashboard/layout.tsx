'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore, useProjectStore } from '@/lib/store';
import { projectsApi } from '@/lib/api';
import {
  Activity,
  LayoutDashboard,
  Bot,
  FileSearch,
  Shield,
  DollarSign,
  Settings,
  LogOut,
  ChevronDown,
  Plus,
  MessageSquare,
  Users,
} from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, logout, _hasHydrated } = useAuthStore();
  const { currentProject, projects, setProjects, setCurrentProject } = useProjectStore();
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  useEffect(() => {
    if (!_hasHydrated) return; // Wait for zustand to rehydrate from localStorage
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Load projects
    projectsApi.list().then((res) => {
      setProjects(res.data);
      if (!currentProject && res.data.length > 0) {
        setCurrentProject(res.data[0]);
      }
    });
  }, [isAuthenticated, _hasHydrated]);

  // Show nothing while hydrating (prevents flash of login redirect)
  if (!_hasHydrated || !isAuthenticated) {
    return null;
  }

  const navigation = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Agents', href: '/dashboard/agents', icon: Bot },
    { name: 'Traces', href: '/dashboard/traces', icon: FileSearch },
    { name: 'Sessions', href: '/dashboard/sessions', icon: MessageSquare },
    { name: 'Users', href: '/dashboard/users', icon: Users },
    { name: 'Policies', href: '/dashboard/policies', icon: Shield },
    { name: 'Cost', href: '/dashboard/cost', icon: DollarSign },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-slate-700">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Activity className="h-8 w-8 text-purple-600" />
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              OrchestraAI
            </span>
          </Link>
        </div>

        {/* Project Selector */}
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <div className="relative">
            <button
              onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-slate-700 rounded-lg text-sm"
            >
              <span className="text-gray-900 dark:text-white truncate">
                {currentProject?.name || 'Select Project'}
              </span>
              <ChevronDown className="h-4 w-4 text-gray-500" />
            </button>

            {projectDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600 z-50">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setCurrentProject(project);
                      setProjectDropdownOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-600 text-gray-900 dark:text-white"
                  >
                    {project.name}
                  </button>
                ))}
                <Link
                  href="/dashboard/projects/new"
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-purple-600 hover:bg-gray-100 dark:hover:bg-slate-600 border-t border-gray-200 dark:border-slate-600"
                  onClick={() => setProjectDropdownOpen(false)}
                >
                  <Plus className="h-4 w-4" />
                  New Project
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-medium">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {user?.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {user?.email}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="pl-64 h-screen">
        <div className="h-full">{children}</div>
      </main>
    </div>
  );
}
