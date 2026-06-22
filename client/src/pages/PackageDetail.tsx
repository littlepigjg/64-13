import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Trash2,
  Calendar,
  FileText,
  Loader2,
  AlertTriangle,
  Lock,
  Download,
} from 'lucide-react';
import { ApiError, api } from '../api';
import { useAuth } from '../AuthContext';
import type { PackageInfo, RegistryType } from '../types';
import { formatSize, formatDate, formatRelativeTime } from '../utils';
import {
  PackageIcon,
  RegistryBadge,
  SourceBadge,
  OwnerBadge,
} from '../components/PackageBadges';

export default function PackageDetail() {
  const params = useParams<{ registry: RegistryType; name: string }>();
  const navigate = useNavigate();
  const { isPackageOwner, isAdmin, canDeletePackage } = useAuth();
  const [pkg, setPkg] = useState<PackageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const loadPkg = async () => {
    setLoading(true);
    setError(null);
    setErrorStatus(null);
    try {
      const data = await api.getPackage(params.registry!, decodeURIComponent(params.name!));
      setPkg(data);
    } catch (e: any) {
      setError(e.message);
      if (e instanceof ApiError) {
        setErrorStatus(e.status);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPkg();
  }, [params.registry, params.name]);

  const handleDeleteVersion = async (version: string) => {
    if (!confirm(`确认删除版本 ${pkg?.name}@${version}？`)) return;
    await api.deleteVersion(params.registry!, decodeURIComponent(params.name!), version);
    loadPkg();
  };

  const handleDeleteAll = async () => {
    if (!confirm(`确认删除包 ${pkg?.name}（包含所有 ${pkg?.versions.length} 个版本）？此操作不可恢复！`)) return;
    await api.deletePackage(params.registry!, decodeURIComponent(params.name!));
    navigate('/packages');
  };

  const handleCleanupOld = async () => {
    if (!confirm('仅保留最新 3 个版本，删除其余旧版本？')) return;
    await api.cleanupUnused(params.registry!, decodeURIComponent(params.name!), 3);
    loadPkg();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (errorStatus === 403 || error === 'Permission denied') {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Link to="/packages" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ArrowLeft size={14} /> 返回包列表
        </Link>
        <div className="card p-12 text-center">
          <Lock size={48} className="mx-auto text-rose-500 mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-2">无权访问此私有包</h2>
          <p className="text-slate-500 max-w-md mx-auto">
            这是其他成员上传的私有包，仅其所有者和管理员可以查看详情。如需访问，请联系包的所有者或管理员。
          </p>
        </div>
      </div>
    );
  }

  if (error || !pkg) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Link to="/packages" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ArrowLeft size={14} /> 返回包列表
        </Link>
        <div className="card p-12 text-center">
          <AlertTriangle size={48} className="mx-auto text-amber-500 mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-2">包不存在</h2>
          <p className="text-slate-500">{error || '未能找到该包的信息'}</p>
        </div>
      </div>
    );
  }

  const canDelete = canDeletePackage(pkg);
  const isOwner = isPackageOwner(pkg);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <Link to="/packages" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} /> 返回包列表
      </Link>

      <div className="card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            <PackageIcon registry={pkg.registry} size="lg" />
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-800">{pkg.name}</h1>
                <RegistryBadge registry={pkg.registry} />
                <SourceBadge source={pkg.source} />
                {pkg.source === 'private' && (
                  <OwnerBadge
                    ownerId={pkg.ownerId}
                    ownerName={pkg.ownerName}
                    source={pkg.source}
                  />
                )}
              </div>
              {pkg.scope && (
                <p className="text-sm text-slate-500 mt-1">
                  Scope: <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{pkg.scope}</span>
                </p>
              )}
              {pkg.description && (
                <p className="text-slate-600 mt-2 max-w-2xl">{pkg.description}</p>
              )}
              {pkg.source === 'private' && (
                <p className="mt-3 text-xs inline-flex items-center gap-2 text-slate-500">
                  <Lock size={12} />
                  {isOwner
                    ? '这是你上传的私有包，你可以管理它的所有版本'
                    : isAdmin()
                      ? '作为管理员，你可以管理该私有包'
                      : '你无法管理此私有包，仅可查看基本信息'}
                </p>
              )}
              {pkg.source !== 'private' && (
                <p className="mt-3 text-xs inline-flex items-center gap-2 text-slate-500">
                  <Download size={12} /> 代理缓存 · 团队共享只读，不支持删除
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {pkg && canDelete && (
              <>
                {pkg.versions.length > 3 && (
                  <button className="btn btn-secondary" onClick={handleCleanupOld}>
                    清理旧版本
                  </button>
                )}
                <button className="btn btn-danger" onClick={handleDeleteAll}>
                  <Trash2 size={16} /> 删除包
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8 pt-6 border-t border-slate-100">
          <InfoCard label="最新版本" value={pkg.latestVersion || '-'} />
          <InfoCard label="版本数量" value={`${pkg.versions.length}`} />
          <InfoCard label="总占用" value={formatSize(pkg.totalSize)} />
          <InfoCard label="下载次数" value={`${pkg.downloadCount}`} />
          <InfoCard label="最后更新" value={formatRelativeTime(pkg.updatedAt)} />
        </div>

        {pkg.source === 'private' && (pkg.ownerName || pkg.author || pkg.license) && (
          <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-2 md:grid-cols-3 gap-4">
            {pkg.ownerName && (
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wide">所有者</span>
                <p className="text-slate-700 mt-1 font-medium">{pkg.ownerName}</p>
              </div>
            )}
            {pkg.author && (
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wide">作者</span>
                <p className="text-slate-700 mt-1">{pkg.author}</p>
              </div>
            )}
            {pkg.license && (
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wide">许可证</span>
                <p className="text-slate-700 mt-1">{pkg.license}</p>
              </div>
            )}
          </div>
        )}

        {pkg.source !== 'private' && (pkg.author || pkg.license) && (
          <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-2 gap-4">
            {pkg.author && (
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wide">作者</span>
                <p className="text-slate-700 mt-1">{pkg.author}</p>
              </div>
            )}
            {pkg.license && (
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wide">许可证</span>
                <p className="text-slate-700 mt-1">{pkg.license}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">版本列表</h2>
          <span className="text-sm text-slate-500">{pkg.versions.length} 个版本</span>
        </div>

        <div className="space-y-2">
          {pkg.versions.map((ver) => (
            <div
              key={ver.version}
              className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-mono font-bold text-sm">
                  v{ver.version.split('.')[0]}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-slate-800">{ver.version}</span>
                    {ver.version === pkg.latestVersion && (
                      <span className="badge bg-emerald-100 text-emerald-700">最新</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} /> {formatDate(ver.publishedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Download size={12} /> {formatSize(ver.size)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Download size={12} /> {ver.downloadCount} 次
                    </span>
                    {ver.publisherName && (
                      <span className="inline-flex items-center gap-1 text-indigo-600 font-medium">
                        发布者: {ver.publisherName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {canDelete && (
                <button
                  className="btn btn-ghost p-2 text-slate-400 hover:text-red-600 hover:bg-red-50"
                  onClick={() => handleDeleteVersion(ver.version)}
                  title="删除此版本"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-lg bg-slate-50">
      <div className="flex items-center gap-2 text-slate-500 text-xs">
        {label}
      </div>
      <div className="mt-1.5 font-semibold text-slate-800 truncate">{value}</div>
    </div>
  );
}
