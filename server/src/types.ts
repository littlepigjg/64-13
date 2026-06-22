import type { Request } from 'express';

export type RegistryType = 'npm' | 'pypi';

export type PackageSource = 'cache' | 'private' | 'upstream';

export type UserRole = 'admin' | 'developer';

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.create'
  | 'user.delete'
  | 'package.upload'
  | 'package.delete'
  | 'package.version.delete'
  | 'package.cleanup'
  | 'config.update'
  | 'cache.cleanup'
  | 'cache.snapshot';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  token: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface AuditLog {
  id: number;
  userId: number;
  username: string;
  userRole: UserRole;
  action: AuditAction;
  target?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  timestamp: number;
  success: boolean;
  errorMessage?: string;
}

export interface PackageInfo {
  name: string;
  registry: RegistryType;
  source: PackageSource;
  versions: PackageVersion[];
  latestVersion: string;
  description?: string;
  author?: string;
  license?: string;
  scope?: string;
  createdAt: number;
  updatedAt: number;
  totalSize: number;
  downloadCount: number;
  ownerId?: number;
  ownerName?: string;
}

export interface PackageVersion {
  version: string;
  size: number;
  filePath: string;
  sha1?: string;
  publishedAt: number;
  downloadCount: number;
  publisherId?: number;
  publisherName?: string;
}

export interface CacheStats {
  totalPackages: number;
  totalVersions: number;
  totalSize: number;
  npmPackages: number;
  pypiPackages: number;
  privatePackages: number;
  cachePackages: number;
  maxSize: number;
  usagePercent: number;
}

export interface PackageListBreakdown {
  total: number;
  privateOwned: number;
  privateOthers: number;
  cache: number;
  npm: number;
  pypi: number;
}

export interface PackageListResponse {
  packages: PackageInfo[];
  total: number;
  breakdown: PackageListBreakdown;
}

export interface StorageTrend {
  date: string;
  size: number;
  packages: number;
}

export interface CachePolicy {
  maxSizeGB: number;
  maxAgeDays: number;
  autoClean: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export interface LoginRequest {
  username: string;
  token: string;
}

export interface LoginResponse {
  success: boolean;
  user: User;
}

export interface CreateUserRequest {
  username: string;
  role: UserRole;
}

export interface AuditLogQuery {
  userId?: number;
  action?: AuditAction;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
  success?: boolean;
}
