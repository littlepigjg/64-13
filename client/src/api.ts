import type {
  PackageListResponse,
  PackageInfo,
  CacheStats,
  StorageTrend,
  CachePolicy,
  HealthInfo,
  RegistryType,
  PackageSource,
  LoginRequest,
  LoginResponse,
  AuthInfo,
  CreateUserRequest,
  CreateUserResponse,
  UserListResponse,
  AuditLogListResponse,
  AuditAction,
  AuditActionsResponse,
  User,
} from './types';

const API_BASE = '/api';

let authToken: string | null = null;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('auth_token');
  }
  return authToken;
}

function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      setAuthToken(null);
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(err.error || `HTTP ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => request<HealthInfo>('/health'),

  getScopes: () => request<{ scopes: string[] }>('/scopes'),

  listPackages: (params: {
    registry?: RegistryType;
    source?: PackageSource;
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'name' | 'updatedAt' | 'size' | 'downloads';
    sortOrder?: 'asc' | 'desc';
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) qs.set(k, String(v));
    });
    return request<PackageListResponse>(`/packages?${qs.toString()}`);
  },

  getPackage: (registry: RegistryType, name: string) =>
    request<PackageInfo>(`/packages/${registry}/${encodeURIComponent(name)}`),

  deletePackage: (registry: RegistryType, name: string) =>
    request<{ success: boolean; deleted: string }>(
      `/packages/${registry}/${encodeURIComponent(name)}`,
      { method: 'DELETE' }
    ),

  deleteVersion: (registry: RegistryType, name: string, version: string) =>
    request<{ success: boolean; deleted: string }>(
      `/packages/${registry}/${encodeURIComponent(name)}/versions/${version}`,
      { method: 'DELETE' }
    ),

  cleanupUnused: (registry: RegistryType, name: string, keep: number = 3) =>
    request<{ success: boolean; kept: number; deleted: string[] }>(
      `/packages/${registry}/${encodeURIComponent(name)}/cleanup-unused?keep=${keep}`,
      { method: 'POST' }
    ),

  getStats: () => request<CacheStats>('/stats'),

  getTrend: (days: number = 30) =>
    request<StorageTrend[]>(`/stats/trend?days=${days}`),

  getCachePolicy: () => request<CachePolicy>('/cache/policy'),

  updateCachePolicy: (policy: CachePolicy) =>
    request<{ success: boolean; policy: CachePolicy }>('/cache/policy', {
      method: 'PUT',
      body: JSON.stringify(policy),
    }),

  runCleanup: () =>
    request<{ success: boolean; deletedFiles: number; freedBytes: number }>(
      '/cache/cleanup',
      { method: 'POST' }
    ),

  snapshot: () =>
    request<{ success: boolean; timestamp: number }>('/cache/snapshot', {
      method: 'POST',
    }),

  login: (data: LoginRequest) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    }),

  getAuthInfo: () => request<AuthInfo>('/auth/me'),

  getUsers: () => request<UserListResponse>('/auth/users'),

  createUser: (data: CreateUserRequest) =>
    request<CreateUserResponse>('/auth/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteUser: (id: number) =>
    request<{ success: boolean; deleted: string }>(`/auth/users/${id}`, {
      method: 'DELETE',
    }),

  regenerateUserToken: (id: number) =>
    request<{ success: boolean; token: string }>(`/auth/users/${id}/regenerate-token`, {
      method: 'POST',
    }),

  getAuditLogs: (params: {
    userId?: number;
    action?: AuditAction;
    startDate?: number;
    endDate?: number;
    limit?: number;
    offset?: number;
    success?: boolean;
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) qs.set(k, String(v));
    });
    return request<AuditLogListResponse>(`/audit/logs?${qs.toString()}`);
  },

  getAuditActions: () => request<AuditActionsResponse>('/audit/actions'),
};
