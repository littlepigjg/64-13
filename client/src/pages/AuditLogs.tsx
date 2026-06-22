import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Filter,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  User,
  Calendar,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import type { AuditLog, AuditAction, User as UserType } from '../types';
import { formatDateTime, formatRelativeTime } from '../utils';

const actionLabels: Record<AuditAction, string> = {
  'user.login': '用户登录',
  'user.logout': '用户登出',
  'user.create': '创建用户',
  'user.delete': '删除用户',
  'package.upload': '上传包',
  'package.delete': '删除包',
  'package.version.delete': '删除版本',
  'package.cleanup': '清理包版本',
  'config.update': '更新配置',
  'cache.cleanup': '清理缓存',
  'cache.snapshot': '缓存快照',
};

const roleLabels: Record<string, string> = {
  admin: '管理员',
  developer: '开发者',
};

export default function AuditLogs() {
  const navigate = useNavigate();
  const { authEnabled, isAdmin, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserType[]>([]);
  const [actions, setActions] = useState<AuditAction[]>([]);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [filterUserId, setFilterUserId] = useState<number | undefined>();
  const [filterAction, setFilterAction] = useState<AuditAction | undefined>();
  const [filterSuccess, setFilterSuccess] = useState<boolean | undefined>();
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * pageSize;
      const [logsResult, usersResult, actionsResult] = await Promise.all([
        api.getAuditLogs({
          userId: filterUserId,
          action: filterAction,
          success: filterSuccess,
          startDate: filterStartDate ? new Date(filterStartDate).getTime() : undefined,
          endDate: filterEndDate ? new Date(filterEndDate).getTime() + 86400000 : undefined,
          limit: pageSize,
          offset,
        }),
        api.getUsers(),
        api.getAuditActions(),
      ]);
      setLogs(logsResult.logs);
      setTotal(logsResult.total);
      setUsers(usersResult.users);
      setActions(actionsResult.actions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && authEnabled && !isAdmin()) {
      navigate('/dashboard', { replace: true });
      return;
    }
    if (!authLoading) {
      loadData();
    }
  }, [authLoading, authEnabled, isAdmin, navigate, page, filterUserId, filterAction, filterSuccess, filterStartDate, filterEndDate]);

  const resetFilters = () => {
    setFilterUserId(undefined);
    setFilterAction(undefined);
    setFilterSuccess(undefined);
    setFilterStartDate('');
    setFilterEndDate('');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const userIdMap = new Map(users.map((u) => [u.id, u]));

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">审计日志</h1>
          <p className="text-sm text-slate-500 mt-1">记录所有关键操作，便于追溯和合规检查，共 {total} 条</p>
        </div>
        <button className="btn btn-secondary flex items-center gap-2" onClick={loadData}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-slate-500" />
          <span className="text-sm font-medium text-slate-700">筛选条件</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <select
            className="select"
            value={filterUserId === undefined ? '' : String(filterUserId)}
            onChange={(e) => {
              setFilterUserId(e.target.value === '' ? undefined : parseInt(e.target.value, 10));
              setPage(1);
            }}
          >
            <option value="">全部用户</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={filterAction || ''}
            onChange={(e) => {
              setFilterAction((e.target.value as AuditAction) || undefined);
              setPage(1);
            }}
          >
            <option value="">全部操作</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {actionLabels[a]}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={filterSuccess === undefined ? '' : String(filterSuccess)}
            onChange={(e) => {
              setFilterSuccess(e.target.value === '' ? undefined : e.target.value === 'true');
              setPage(1);
            }}
          >
            <option value="">全部结果</option>
            <option value="true">成功</option>
            <option value="false">失败</option>
          </select>

          <div>
            <input
              type="date"
              className="input w-full"
              value={filterStartDate}
              onChange={(e) => {
                setFilterStartDate(e.target.value);
                setPage(1);
              }}
              placeholder="开始日期"
            />
          </div>

          <div>
            <input
              type="date"
              className="input w-full"
              value={filterEndDate}
              onChange={(e) => {
                setFilterEndDate(e.target.value);
                setPage(1);
              }}
              placeholder="结束日期"
            />
          </div>

          <button className="btn btn-secondary" onClick={resetFilters}>
            重置筛选
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="animate-spin text-indigo-600 mx-auto" size={28} />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500">暂无符合条件的日志记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">时间</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">用户</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">操作</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">目标</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">结果</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">来源 IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const logUser = userIdMap.get(log.userId);
                  return (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                      <td className="py-3 px-4">
                        <div className="text-sm text-slate-700">{formatDateTime(log.timestamp)}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{formatRelativeTime(log.timestamp)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600">
                            <User size={14} />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-800">{log.username}</div>
                            <div className="text-xs text-slate-500">{roleLabels[log.userRole] || log.userRole}</div>
                          </div>
                        </div>
                        {logUser && <div className="text-xs text-slate-400 mt-1">ID: {logUser.id}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700">
                          {actionLabels[log.action] || log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm text-slate-700 max-w-xs truncate" title={log.target}>
                          {log.target || '-'}
                        </div>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="text-xs text-slate-500 mt-1 truncate max-w-xs" title={JSON.stringify(log.details)}>
                            {typeof log.details === 'object' ? Object.entries(log.details).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ') : ''}
                          </div>
                        )}
                        {log.errorMessage && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-red-600" title={log.errorMessage}>
                            <AlertTriangle size={12} />
                            <span className="truncate max-w-xs">{log.errorMessage}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {log.success ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md">
                            <CheckCircle2 size={12} /> 成功
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-md">
                            <XCircle size={12} /> 失败
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs font-mono text-slate-600">{log.ip || '-'}</div>
                        {log.userAgent && (
                          <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[180px]" title={log.userAgent}>
                            {log.userAgent}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100">
            <div className="text-sm text-slate-500">
              第 {page} / {totalPages} 页，共 {total} 条
            </div>
            <div className="flex items-center gap-1">
              <button
                className="btn btn-ghost p-2"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pn: number;
                if (totalPages <= 5) {
                  pn = i + 1;
                } else if (page <= 3) {
                  pn = i + 1;
                } else if (page >= totalPages - 2) {
                  pn = totalPages - 4 + i;
                } else {
                  pn = page - 2 + i;
                }
                return (
                  <button
                    key={pn}
                    className={`btn p-2 min-w-9 ${pn === page ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPage(pn)}
                  >
                    {pn}
                  </button>
                );
              })}
              <button
                className="btn btn-ghost p-2"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
