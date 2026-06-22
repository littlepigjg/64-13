import { Archive, Database, Lock, HardDrive, User, ShieldCheck, UserCheck } from 'lucide-react';
import type { RegistryType, PackageSource } from '../types';
import { useAuth } from '../AuthContext';

export function RegistryIcon({ registry, size = 16 }: { registry: RegistryType; size?: number }) {
  if (registry === 'npm') {
    return <Archive size={size} />;
  }
  return <Database size={size} />;
}

export function PackageIcon({
  registry,
  size = 'md',
}: {
  registry: RegistryType;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeMap = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-14 h-14 text-2xl',
  } as const;
  const iconSize = { sm: 14, md: 16, lg: 28 } as const;

  return (
    <div
      className={`${sizeMap[size]} rounded-xl flex items-center justify-center ${
        registry === 'npm'
          ? 'bg-gradient-to-br from-orange-100 to-orange-200 text-orange-600'
          : 'bg-gradient-to-br from-sky-100 to-sky-200 text-sky-600'
      }`}
    >
      <RegistryIcon registry={registry} size={iconSize[size]} />
    </div>
  );
}

export function RegistryBadge({ registry }: { registry: RegistryType }) {
  return (
    <span
      className={`badge ${
        registry === 'npm' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
      }`}
    >
      {registry.toUpperCase()}
    </span>
  );
}

export function SourceBadge({ source }: { source: PackageSource }) {
  if (source === 'private') {
    return (
      <span className="badge bg-violet-100 text-violet-700 inline-flex items-center gap-1">
        <Lock size={11} /> 私有包
      </span>
    );
  }
  if (source === 'upstream') {
    return (
      <span className="badge bg-blue-100 text-blue-700 inline-flex items-center gap-1">
        <Database size={11} /> 上游
      </span>
    );
  }
  return (
    <span className="badge bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
      <HardDrive size={11} /> 代理缓存
    </span>
  );
}

export function OwnerBadge({
  ownerId,
  ownerName,
  source,
}: {
  ownerId?: number;
  ownerName?: string;
  source: PackageSource;
}) {
  const { user, isAdmin } = useAuth();

  if (source !== 'private') {
    return (
      <span className="text-xs text-slate-400 inline-flex items-center gap-1">
        <Database size={12} /> 公共缓存
      </span>
    );
  }

  if (!ownerId || !ownerName) {
    return (
      <span className="text-xs text-slate-400 inline-flex items-center gap-1">
        <User size={12} /> 未知
      </span>
    );
  }

  const isMine = user?.id === ownerId;

  if (isMine) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100"
        title="我上传的私有包"
      >
        <UserCheck size={12} /> 我
      </span>
    );
  }

  if (isAdmin()) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200"
        title={`所有者：${ownerName}`}
      >
        <ShieldCheck size={12} /> {ownerName}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200"
    >
      <User size={12} /> 其他成员
    </span>
  );
}
