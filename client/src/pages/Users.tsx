import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users as UsersIcon,
  UserPlus,
  Trash2,
  RefreshCw,
  Loader2,
  Shield,
  ShieldAlert,
  Copy,
  CheckCircle2,
  AlertCircle,
  User,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import type { User as UserType, UserRole } from '../types';
import { formatDateTime } from '../utils';

export default function Users() {
  const navigate = useNavigate();
  const { authEnabled, isAdmin, loading: authLoading, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('developer');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newUserToken, setNewUserToken] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const result = await api.getUsers();
      setUsers(result.users);
    } catch (e) {
      console.error('Failed to load users:', e);
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
      loadUsers();
    }
  }, [authLoading, authEnabled, isAdmin, navigate]);

  const handleCreateUser = async () => {
    if (!newUsername || !newUsername.match(/^[a-zA-Z0-9_-]+$/)) {
      setCreateError('用户名只能包含字母、数字、下划线和连字符');
      return;
    }
    if (newUsername.length < 3 || newUsername.length > 50) {
      setCreateError('用户名长度必须在 3-50 个字符之间');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const result = await api.createUser({
        username: newUsername,
        role: newRole,
      });
      setNewUserToken(result.token);
      setNewUsername('');
      setNewRole('developer');
      loadUsers();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '创建用户失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (!confirm(`确定要删除用户 "${username}" 吗？此操作不可撤销。`)) return;

    setActionLoading(id);
    try {
      await api.deleteUser(id);
      loadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRegenerateToken = async (id: number, username: string) => {
    if (!confirm(`确定要重新生成用户 "${username}" 的 Token 吗？旧 Token 将立即失效。`)) return;

    setActionLoading(id);
    try {
      const result = await api.regenerateUserToken(id);
      setNewUserToken(result.token);
      loadUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : '重新生成 Token 失败');
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = async (text: string, id: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getRoleBadge = (role: UserRole) => {
    if (role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
          <ShieldAlert size={12} /> 管理员
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
        <Shield size={12} /> 开发者
      </span>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">用户管理</h1>
          <p className="text-sm text-slate-500 mt-1">管理系统用户和权限</p>
        </div>
        <button
          className="btn btn-primary flex items-center gap-2"
          onClick={() => setShowCreateModal(true)}
        >
          <UserPlus size={18} /> 添加用户
        </button>
      </div>

      <div className="card p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  用户名
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  角色
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  创建时间
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  最后活跃
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600">
                        <User size={18} />
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{u.username}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {u.token.slice(0, 8)}...{u.token.slice(-4)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">{getRoleBadge(u.role)}</td>
                  <td className="py-4 px-4 text-sm text-slate-600">{formatDateTime(u.createdAt)}</td>
                  <td className="py-4 px-4 text-sm text-slate-600">{formatDateTime(u.lastActiveAt)}</td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        onClick={() => handleRegenerateToken(u.id, u.username)}
                        disabled={actionLoading === u.id}
                        title="重新生成 Token"
                      >
                        {actionLoading === u.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <RefreshCw size={16} />
                        )}
                      </button>
                      <button
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        onClick={() => handleDeleteUser(u.id, u.username)}
                        disabled={
                          actionLoading === u.id ||
                          u.id === currentUser?.id ||
                          (u.role === 'admin' && users.filter(x => x.role === 'admin').length <= 1)
                        }
                        title={
                          u.id === currentUser?.id
                            ? '不能删除自己'
                            : u.role === 'admin' && users.filter(x => x.role === 'admin').length <= 1
                            ? '至少保留一个管理员'
                            : '删除用户'
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-slate-800 mb-6">添加新用户</h2>

            {createError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
                <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{createError}</p>
              </div>
            )}

            {newUserToken ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center gap-2 text-emerald-700 font-medium mb-3">
                    <CheckCircle2 size={20} /> 用户创建成功
                  </div>
                  <p className="text-sm text-emerald-700 mb-3">
                    请立即将以下 Token 发送给用户，此 Token 只会显示一次：
                  </p>
                  <div className="flex items-center gap-2 bg-white rounded-lg border border-emerald-200 p-3">
                    <code className="flex-1 text-sm font-mono text-emerald-800 break-all">
                      {newUserToken}
                    </code>
                    <button
                      className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                      onClick={() => copyToClipboard(newUserToken!, 0)}
                    >
                      {copiedId === 0 ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                </div>
                <button
                  className="w-full btn btn-primary"
                  onClick={() => {
                    setNewUserToken(null);
                    setShowCreateModal(false);
                  }}
                >
                  完成
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    用户名
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="输入用户名"
                    className="input w-full"
                    disabled={creating}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    3-50 个字符，只能包含字母、数字、下划线和连字符
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    角色
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewRole('developer')}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        newRole === 'developer'
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                      disabled={creating}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Shield size={18} className={newRole === 'developer' ? 'text-indigo-600' : 'text-slate-400'} />
                        <span className="font-medium text-slate-800">开发者</span>
                      </div>
                      <p className="text-xs text-slate-500">上传和管理自己的包</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRole('admin')}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        newRole === 'admin'
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                      disabled={creating}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <ShieldAlert size={18} className={newRole === 'admin' ? 'text-purple-600' : 'text-slate-400'} />
                        <span className="font-medium text-slate-800">管理员</span>
                      </div>
                      <p className="text-xs text-slate-500">完整系统管理权限</p>
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    className="flex-1 btn btn-secondary"
                    onClick={() => setShowCreateModal(false)}
                    disabled={creating}
                  >
                    取消
                  </button>
                  <button
                    className="flex-1 btn btn-primary"
                    onClick={handleCreateUser}
                    disabled={creating}
                  >
                    {creating && <Loader2 size={16} className="animate-spin" />}
                    {creating ? '创建中...' : '创建用户'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
