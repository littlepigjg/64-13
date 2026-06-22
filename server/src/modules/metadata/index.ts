import fs from 'fs';
import path from 'path';
import { ensureDir, formatDate, getDirSize } from '../../utils';
import { config } from '../../config';
import type {
  PackageInfo,
  PackageVersion,
  CacheStats,
  StorageTrend,
  CachePolicy,
  RegistryType,
  PackageSource,
  User,
  UserRole,
  AuditLog,
  AuditAction,
  AuditLogQuery,
} from '../../types';

interface DBPackage {
  id: number;
  name: string;
  registry: RegistryType;
  source: PackageSource;
  scope?: string;
  description?: string;
  author?: string;
  license?: string;
  latestVersion: string;
  createdAt: number;
  updatedAt: number;
  totalSize: number;
  downloadCount: number;
  ownerId?: number;
  ownerName?: string;
}

interface DBVersion {
  id: number;
  packageId: number;
  version: string;
  size: number;
  filePath: string;
  sha1?: string;
  publishedAt: number;
  downloadCount: number;
  publisherId?: number;
  publisherName?: string;
}

interface DBUser {
  id: number;
  username: string;
  role: UserRole;
  token: string;
  createdAt: number;
  lastActiveAt: number;
}

interface DBAuditLog {
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

interface DB {
  nextPackageId: number;
  nextVersionId: number;
  nextUserId: number;
  nextAuditLogId: number;
  packages: DBPackage[];
  versions: DBVersion[];
  users: DBUser[];
  auditLogs: DBAuditLog[];
  storageTrend: StorageTrend[];
  cachePolicy: CachePolicy;
}

const DEFAULT_POLICY: CachePolicy = {
  maxSizeGB: 50,
  maxAgeDays: 90,
  autoClean: true,
};

export class MetadataIndex {
  private dataDir: string;
  private dbPath: string;
  private db: DB;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    ensureDir(dataDir);
    this.dbPath = path.join(dataDir, 'registry-data.json');
    this.db = this.loadDB();
  }

  private loadDB(): DB {
    if (fs.existsSync(this.dbPath)) {
      try {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const db: DB = {
          nextPackageId: parsed.nextPackageId || 1,
          nextVersionId: parsed.nextVersionId || 1,
          nextUserId: parsed.nextUserId || 1,
          nextAuditLogId: parsed.nextAuditLogId || 1,
          packages: parsed.packages || [],
          versions: parsed.versions || [],
          users: parsed.users || [],
          auditLogs: parsed.auditLogs || [],
          storageTrend: parsed.storageTrend || [],
          cachePolicy: parsed.cachePolicy || { ...DEFAULT_POLICY, ...config.cache },
        };

        if (db.users.length === 0 && config.auth.requireAuth) {
          const now = Date.now();
          db.users.push({
            id: db.nextUserId++,
            username: config.auth.defaultAdminUsername,
            role: 'admin',
            token: config.auth.defaultAdminToken,
            createdAt: now,
            lastActiveAt: now,
          });
        }

        this.cleanupOldAuditLogs(db);
        return db;
      } catch {
        // fall through to default
      }
    }

    const now = Date.now();
    const defaultDB: DB = {
      nextPackageId: 1,
      nextVersionId: 1,
      nextUserId: 2,
      nextAuditLogId: 1,
      packages: [],
      versions: [],
      users: [],
      auditLogs: [],
      storageTrend: [],
      cachePolicy: { ...DEFAULT_POLICY, ...config.cache },
    };

    if (config.auth.requireAuth) {
      defaultDB.users.push({
        id: 1,
        username: config.auth.defaultAdminUsername,
        role: 'admin',
        token: config.auth.defaultAdminToken,
        createdAt: now,
        lastActiveAt: now,
      });
    }

    return defaultDB;
  }

  private cleanupOldAuditLogs(db: DB): void {
    if (config.audit.retentionDays <= 0) return;
    const cutoff = Date.now() - config.audit.retentionDays * 24 * 60 * 60 * 1000;
    db.auditLogs = db.auditLogs.filter(log => log.timestamp >= cutoff);
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persist();
    }, 200);
  }

  private persist(): void {
    ensureDir(this.dataDir);
    const tmpPath = this.dbPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(this.db, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.dbPath);
  }

  getOrCreatePackage(
    name: string,
    registry: RegistryType,
    source: PackageSource,
    scope?: string,
    ownerId?: number,
    ownerName?: string
  ): number {
    const existing = this.db.packages.find(
      (p) => p.name === name && p.registry === registry
    );
    if (existing) {
      if (ownerId !== undefined && existing.ownerId === undefined) {
        existing.ownerId = ownerId;
        existing.ownerName = ownerName;
        this.scheduleSave();
      }
      return existing.id;
    }

    const now = Date.now();
    const id = this.db.nextPackageId++;
    this.db.packages.push({
      id,
      name,
      registry,
      source,
      scope,
      latestVersion: '',
      createdAt: now,
      updatedAt: now,
      totalSize: 0,
      downloadCount: 0,
      ownerId,
      ownerName,
    });
    this.scheduleSave();
    return id;
  }

  createUser(username: string, role: UserRole, token: string): User {
    const now = Date.now();
    const user: DBUser = {
      id: this.db.nextUserId++,
      username,
      role,
      token,
      createdAt: now,
      lastActiveAt: now,
    };
    this.db.users.push(user);
    this.scheduleSave();
    return this.toUser(user);
  }

  getUserById(id: number): User | null {
    const user = this.db.users.find(u => u.id === id);
    return user ? this.toUser(user) : null;
  }

  getUserByUsername(username: string): User | null {
    const user = this.db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    return user ? this.toUser(user) : null;
  }

  getUserByToken(token: string): User | null {
    const user = this.db.users.find(u => u.token === token);
    return user ? this.toUser(user) : null;
  }

  listUsers(): User[] {
    return this.db.users.map(u => this.toUser(u));
  }

  updateUserLastActive(id: number, timestamp: number): void {
    const user = this.db.users.find(u => u.id === id);
    if (user) {
      user.lastActiveAt = timestamp;
      this.scheduleSave();
    }
  }

  updateUserToken(id: number, token: string): void {
    const user = this.db.users.find(u => u.id === id);
    if (user) {
      user.token = token;
      this.scheduleSave();
    }
  }

  deleteUser(id: number): boolean {
    const idx = this.db.users.findIndex(u => u.id === id);
    if (idx < 0) return false;
    this.db.users.splice(idx, 1);
    this.scheduleSave();
    return true;
  }

  addAuditLog(log: Omit<AuditLog, 'id'>): void {
    const dbLog: DBAuditLog = {
      ...log,
      id: this.db.nextAuditLogId++,
    };
    this.db.auditLogs.push(dbLog);
    if (this.db.auditLogs.length > 10000) {
      this.cleanupOldAuditLogs(this.db);
    }
    this.scheduleSave();
  }

  queryAuditLogs(query: AuditLogQuery): { logs: AuditLog[]; total: number } {
    let logs = [...this.db.auditLogs];

    if (query.userId !== undefined) {
      logs = logs.filter(l => l.userId === query.userId);
    }
    if (query.action) {
      logs = logs.filter(l => l.action === query.action);
    }
    if (query.startDate !== undefined) {
      logs = logs.filter(l => l.timestamp >= query.startDate!);
    }
    if (query.endDate !== undefined) {
      logs = logs.filter(l => l.timestamp <= query.endDate!);
    }
    if (query.success !== undefined) {
      logs = logs.filter(l => l.success === query.success);
    }

    logs.sort((a, b) => b.timestamp - a.timestamp);

    const total = logs.length;
    const limit = query.limit || 50;
    const offset = query.offset || 0;
    logs = logs.slice(offset, offset + limit);

    return { logs: logs.map(l => this.toAuditLog(l)), total };
  }

  private toUser(dbUser: DBUser): User {
    return {
      id: dbUser.id,
      username: dbUser.username,
      role: dbUser.role,
      token: dbUser.token,
      createdAt: dbUser.createdAt,
      lastActiveAt: dbUser.lastActiveAt,
    };
  }

  private toAuditLog(dbLog: DBAuditLog): AuditLog {
    return {
      id: dbLog.id,
      userId: dbLog.userId,
      username: dbLog.username,
      userRole: dbLog.userRole,
      action: dbLog.action,
      target: dbLog.target,
      details: dbLog.details,
      ip: dbLog.ip,
      userAgent: dbLog.userAgent,
      timestamp: dbLog.timestamp,
      success: dbLog.success,
      errorMessage: dbLog.errorMessage,
    };
  }

  upsertPackageInfo(info: Partial<PackageInfo> & { name: string; registry: RegistryType }): void {
    const existing = this.db.packages.find(
      (p) => p.name === info.name && p.registry === info.registry
    );
    const now = Date.now();

    if (existing) {
      if (info.description !== undefined) existing.description = info.description;
      if (info.author !== undefined) existing.author = info.author;
      if (info.license !== undefined) existing.license = info.license;
      if (info.latestVersion !== undefined) existing.latestVersion = info.latestVersion;
      if (info.source !== undefined) existing.source = info.source;
      existing.updatedAt = now;
    } else {
      this.getOrCreatePackage(info.name, info.registry, info.source || 'cache', info.scope);
    }
    this.scheduleSave();
  }

  addVersion(
    packageId: number,
    version: string,
    size: number,
    filePath: string,
    sha1?: string,
    publisherId?: number,
    publisherName?: string
  ): void {
    const now = Date.now();
    const existing = this.db.versions.find(
      (v) => v.packageId === packageId && v.version === version
    );
    if (existing) {
      existing.size = size;
      existing.filePath = filePath;
      if (sha1) existing.sha1 = sha1;
      existing.publishedAt = now;
      if (publisherId !== undefined) {
        existing.publisherId = publisherId;
        existing.publisherName = publisherName;
      }
    } else {
      const id = this.db.nextVersionId++;
      this.db.versions.push({
        id,
        packageId,
        version,
        size,
        filePath,
        sha1,
        publishedAt: now,
        downloadCount: 0,
        publisherId,
        publisherName,
      });
    }
    this.recalcPackageSize(packageId);
    const pkg = this.db.packages.find((p) => p.id === packageId);
    if (pkg) pkg.updatedAt = now;
    this.scheduleSave();
  }

  private recalcPackageSize(packageId: number): void {
    const pkgVersions = this.db.versions.filter((v) => v.packageId === packageId);
    const total = pkgVersions.reduce((s, v) => s + v.size, 0);
    const latest = pkgVersions.sort((a, b) => b.publishedAt - a.publishedAt)[0];

    const pkg = this.db.packages.find((p) => p.id === packageId);
    if (pkg) {
      pkg.totalSize = total;
      pkg.latestVersion = latest?.version || '';
    }
  }

  incrementVersionDownload(packageId: number, version: string): void {
    const v = this.db.versions.find(
      (v) => v.packageId === packageId && v.version === version
    );
    if (v) v.downloadCount++;
    const pkg = this.db.packages.find((p) => p.id === packageId);
    if (pkg) pkg.downloadCount++;
    this.scheduleSave();
  }

  getPackage(name: string, registry: RegistryType): PackageInfo | null {
    const pkg = this.db.packages.find(
      (p) => p.name === name && p.registry === registry
    );
    if (!pkg) return null;

    const versions = this.db.versions
      .filter((v) => v.packageId === pkg.id)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .map<PackageVersion>((v) => ({
        version: v.version,
        size: v.size,
        filePath: v.filePath,
        sha1: v.sha1,
        publishedAt: v.publishedAt,
        downloadCount: v.downloadCount,
        publisherId: v.publisherId,
        publisherName: v.publisherName,
      }));

    return {
      name: pkg.name,
      registry: pkg.registry,
      source: pkg.source,
      scope: pkg.scope,
      description: pkg.description,
      author: pkg.author,
      license: pkg.license,
      latestVersion: pkg.latestVersion,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
      totalSize: pkg.totalSize,
      downloadCount: pkg.downloadCount,
      ownerId: pkg.ownerId,
      ownerName: pkg.ownerName,
      versions,
    };
  }

  listPackages(options: {
    registry?: RegistryType;
    source?: PackageSource;
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'name' | 'updatedAt' | 'size' | 'downloads';
    sortOrder?: 'asc' | 'desc';
    ownerId?: number;
  } = {}): { packages: PackageInfo[]; total: number; breakdown: import('../../types').PackageListBreakdown } {
    let list = [...this.db.packages];

    if (options.registry) list = list.filter((p) => p.registry === options.registry);
    if (options.source) list = list.filter((p) => p.source === options.source);
    if (options.ownerId !== undefined) {
      list = list.filter((p) => p.ownerId === options.ownerId || p.source !== 'private');
    }
    if (options.search) {
      const s = options.search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(s));
    }

    const total = list.length;

    const breakdown: import('../../types').PackageListBreakdown = {
      total,
      privateOwned: 0,
      privateOthers: 0,
      cache: 0,
      npm: 0,
      pypi: 0,
    };
    const userId = options.ownerId;
    for (const pkg of list) {
      if (pkg.registry === 'npm') breakdown.npm++;
      if (pkg.registry === 'pypi') breakdown.pypi++;
      if (pkg.source === 'cache') breakdown.cache++;
      if (pkg.source === 'private') {
        if (userId !== undefined && pkg.ownerId === userId) {
          breakdown.privateOwned++;
        } else if (userId === undefined) {
          if (pkg.ownerId !== undefined) breakdown.privateOwned++;
          else breakdown.privateOthers++;
        } else {
          breakdown.privateOthers++;
        }
      }
    }

    const sortField = options.sortBy === 'size' ? 'totalSize' :
      options.sortBy === 'downloads' ? 'downloadCount' :
      options.sortBy === 'updatedAt' ? 'updatedAt' : 'name';
    const order = options.sortOrder?.toUpperCase() === 'ASC' ? 1 : -1;

    list.sort((a: any, b: any) => {
      const va = a[sortField];
      const vb = b[sortField];
      if (typeof va === 'string') return va.localeCompare(vb) * order;
      return (va - vb) * order;
    });

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    list = list.slice(offset, offset + limit);

    const idSet = new Set(list.map((p) => p.id));
    const versionsByPkg: Record<number, DBVersion[]> = {};
    for (const v of this.db.versions) {
      if (idSet.has(v.packageId)) {
        if (!versionsByPkg[v.packageId]) versionsByPkg[v.packageId] = [];
        versionsByPkg[v.packageId].push(v);
      }
    }
    for (const arr of Object.values(versionsByPkg)) {
      arr.sort((a, b) => b.publishedAt - a.publishedAt);
    }

    const packages: PackageInfo[] = list.map((pkg) => ({
      name: pkg.name,
      registry: pkg.registry,
      source: pkg.source,
      scope: pkg.scope,
      description: pkg.description,
      author: pkg.author,
      license: pkg.license,
      latestVersion: pkg.latestVersion,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
      totalSize: pkg.totalSize,
      downloadCount: pkg.downloadCount,
      ownerId: pkg.ownerId,
      ownerName: pkg.ownerName,
      versions: (versionsByPkg[pkg.id] || []).map<PackageVersion>((v) => ({
        version: v.version,
        size: v.size,
        filePath: v.filePath,
        sha1: v.sha1,
        publishedAt: v.publishedAt,
        downloadCount: v.downloadCount,
        publisherId: v.publisherId,
        publisherName: v.publisherName,
      })),
    }));

    return { packages, total, breakdown };
  }

  getVersionFilePath(packageName: string, registry: RegistryType, version: string): string | null {
    const pkg = this.db.packages.find(
      (p) => p.name === packageName && p.registry === registry
    );
    if (!pkg) return null;
    const ver = this.db.versions.find(
      (v) => v.packageId === pkg.id && v.version === version
    );
    return ver?.filePath || null;
  }

  deletePackage(name: string, registry: RegistryType): boolean {
    const idx = this.db.packages.findIndex(
      (p) => p.name === name && p.registry === registry
    );
    if (idx < 0) return false;
    const [pkg] = this.db.packages.splice(idx, 1);
    this.db.versions = this.db.versions.filter((v) => v.packageId !== pkg.id);
    this.scheduleSave();
    return true;
  }

  deletePackageVersion(name: string, registry: RegistryType, version: string): boolean {
    const pkg = this.db.packages.find(
      (p) => p.name === name && p.registry === registry
    );
    if (!pkg) return false;

    const idx = this.db.versions.findIndex(
      (v) => v.packageId === pkg.id && v.version === version
    );
    if (idx < 0) return false;

    this.db.versions.splice(idx, 1);
    this.recalcPackageSize(pkg.id);
    this.scheduleSave();
    return true;
  }

  getStats(): CacheStats {
    const totalPackages = this.db.packages.length;
    const totalVersions = this.db.versions.length;
    const totalSize = this.db.packages.reduce((s, p) => s + p.totalSize, 0);
    const npmPackages = this.db.packages.filter((p) => p.registry === 'npm').length;
    const pypiPackages = this.db.packages.filter((p) => p.registry === 'pypi').length;
    const privatePackages = this.db.packages.filter((p) => p.source === 'private').length;
    const cachePackages = this.db.packages.filter((p) => p.source === 'cache').length;

    const policy = this.getCachePolicy();
    const maxSizeBytes = policy.maxSizeGB * 1024 * 1024 * 1024;
    const dirSize = getDirSize(config.storageDir);
    const actualSize = Math.max(totalSize, dirSize);

    return {
      totalPackages,
      totalVersions,
      totalSize: actualSize,
      npmPackages,
      pypiPackages,
      privatePackages,
      cachePackages,
      maxSize: maxSizeBytes,
      usagePercent: actualSize > 0 && maxSizeBytes > 0 ? Math.min(100, (actualSize / maxSizeBytes) * 100) : 0,
    };
  }

  getStorageTrend(days: number = 30): StorageTrend[] {
    return this.db.storageTrend.slice(-days);
  }

  recordStorageSnapshot(): void {
    const stats = this.getStats();
    const date = formatDate(Date.now());
    const idx = this.db.storageTrend.findIndex((t) => t.date === date);
    const entry: StorageTrend = {
      date,
      size: stats.totalSize,
      packages: stats.totalPackages,
    };
    if (idx >= 0) {
      this.db.storageTrend[idx] = entry;
    } else {
      this.db.storageTrend.push(entry);
    }
    if (this.db.storageTrend.length > 365) {
      this.db.storageTrend = this.db.storageTrend.slice(-365);
    }
    this.scheduleSave();
  }

  getCachePolicy(): CachePolicy {
    return { ...this.db.cachePolicy };
  }

  updateCachePolicy(policy: CachePolicy): void {
    this.db.cachePolicy = { ...policy };
    this.scheduleSave();
  }

  getOldPackages(maxAgeDays: number): Array<{ name: string; registry: RegistryType; filePath: string }> {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const pkgMap = new Map(this.db.packages.map((p) => [p.id, p]));
    const result: Array<{ name: string; registry: RegistryType; filePath: string }> = [];
    for (const v of this.db.versions) {
      const pkg = pkgMap.get(v.packageId);
      if (pkg && pkg.updatedAt < cutoff && pkg.source === 'cache') {
        result.push({ name: pkg.name, registry: pkg.registry, filePath: v.filePath });
      }
    }
    return result;
  }

  getPackagesForEviction(neededBytes: number): Array<{ name: string; registry: RegistryType; version: string; filePath: string; size: number }> {
    const pkgMap = new Map(this.db.packages.map((p) => [p.id, p]));
    const rows = this.db.versions
      .map((v) => {
        const pkg = pkgMap.get(v.packageId)!;
        return {
          name: pkg.name,
          registry: pkg.registry,
          version: v.version,
          filePath: v.filePath,
          size: v.size,
          _downloads: pkg.downloadCount,
          _updated: pkg.updatedAt,
          _isCache: pkg.source === 'cache',
        };
      })
      .filter((r) => r._isCache)
      .sort((a, b) => a._downloads - b._downloads || a._updated - b._updated);

    const result: Array<{ name: string; registry: RegistryType; version: string; filePath: string; size: number }> = [];
    let acc = 0;
    for (const r of rows) {
      result.push({
        name: r.name,
        registry: r.registry,
        version: r.version,
        filePath: r.filePath,
        size: r.size,
      });
      acc += r.size;
      if (acc >= neededBytes) break;
    }
    return result;
  }

  close(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.persist();
  }
}

let metadataInstance: MetadataIndex | null = null;

export function getMetadataIndex(): MetadataIndex {
  if (!metadataInstance) {
    metadataInstance = new MetadataIndex(config.dataDir);
  }
  return metadataInstance;
}
