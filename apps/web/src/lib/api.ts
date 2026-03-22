import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { email: string; password: string; name: string; company?: string }) =>
    api.post('/auth/register', data),
};

// Projects API
export const projectsApi = {
  list: () => api.get('/projects'),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: { name: string; description?: string; budgetLimit?: number; killSwitchEnabled?: boolean }) =>
    api.post('/projects', data),
  update: (id: string, data: { name?: string; description?: string; budgetLimit?: number; killSwitchEnabled?: boolean }) =>
    api.patch(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  regenerateKey: (id: string) => api.post(`/projects/${id}/regenerate-key`),
  checkBudget: (id: string) => api.get(`/projects/${id}/budget`),
};

// Agents API
export const agentsApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/agents`),
  get: (projectId: string, id: string) => api.get(`/projects/${projectId}/agents/${id}`),
  create: (projectId: string, data: { name: string; description?: string; framework?: string }) =>
    api.post(`/projects/${projectId}/agents`, data),
  update: (projectId: string, id: string, data: { name?: string; description?: string; framework?: string }) =>
    api.patch(`/projects/${projectId}/agents/${id}`, data),
  delete: (projectId: string, id: string) => api.delete(`/projects/${projectId}/agents/${id}`),
  kill: (projectId: string, id: string) => api.post(`/projects/${projectId}/agents/${id}/kill`),
  metrics: (projectId: string, id: string) =>
    api.get(`/projects/${projectId}/agents/${id}/metrics`),
};

// Traces API
export const tracesApi = {
  list: (projectId: string, params?: { agentId?: string; type?: string; status?: string; limit?: number; offset?: number }) =>
    api.get(`/projects/${projectId}/traces`, { params }),
  get: (projectId: string, id: string) => api.get(`/projects/${projectId}/traces/${id}`),
  getTree: (projectId: string, traceId: string) =>
    api.get(`/projects/${projectId}/traces/tree/${traceId}`),
  getRuns: (projectId: string, limit?: number) =>
    api.get(`/projects/${projectId}/traces/runs`, { params: { limit } }),
  getErrors: (projectId: string, limit?: number) =>
    api.get(`/projects/${projectId}/traces/errors`, { params: { limit } }),
  detectRunaway: (projectId: string, windowMinutes?: number, threshold?: number) =>
    api.get(`/projects/${projectId}/traces/runaway`, { params: { windowMinutes, threshold } }),
};

// Policies API
export const policiesApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/policies`),
  get: (projectId: string, id: string) => api.get(`/projects/${projectId}/policies/${id}`),
  create: (projectId: string, data: { name: string; description?: string; type: string; conditions: Record<string, unknown>; action: string; priority?: number }) =>
    api.post(`/projects/${projectId}/policies`, data),
  update: (projectId: string, id: string, data: { name?: string; description?: string; conditions?: Record<string, unknown>; action?: string; isActive?: boolean; priority?: number }) =>
    api.patch(`/projects/${projectId}/policies/${id}`, data),
  delete: (projectId: string, id: string) => api.delete(`/projects/${projectId}/policies/${id}`),
  createDefaults: (projectId: string) => api.post(`/projects/${projectId}/policies/defaults`),
};

// Dashboard API
export const dashboardApi = {
  overview: (projectId: string) => api.get(`/projects/${projectId}/dashboard/overview`),
  cost: (projectId: string, period?: string) =>
    api.get(`/projects/${projectId}/dashboard/cost`, { params: { period } }),
  agentPerformance: (projectId: string, agentId: string) =>
    api.get(`/projects/${projectId}/dashboard/agents/${agentId}`),
};
