import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Settings as SettingsIcon,
  Database,
  Users,
  FileText,
  ShieldAlert,
  Shield,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import type { HealthInfo } from '../types';
import { formatSize } from '../utils';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const { user, isAdmin, logout, authEnabled } = useAuth();

  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const getRoleBadge = () => {
    if (!authEnabled || !user) return null;
    if (user.role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
          <ShieldAlert size={10} /> 管理员
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
        <Shield size={10} /> 开发者
      </span>
    );
  };

  const navItems = [
    { path: '/dashboard', label: '统计面板', icon: LayoutDashboard, adminOnly: false },
    { path: '/packages', label: '包列表', icon: Package, adminOnly: false },
    { path: '/users', label: '用户管理', icon: Users, adminOnly: true },
    { path: '/audit-logs', label: '审计日志', icon: FileText, adminOnly: true },
    { path: '/settings', label: '缓存策略', icon: SettingsIcon, adminOnly: true },
  ].filter((item) => !item.adminOnly || isAdmin());

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl">
              📦
            </div>
            <div>
              <h1 className="font-bold text-slate-800">Registry Proxy</h1>
              <p className="text-xs text-slate-500">本地镜像缓存系统</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {authEnabled && user && (
          <div className="p-3 border-t border-slate-200">
            <div className="p-3 rounded-lg bg-slate-50 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                  <UserIcon size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm text-slate-800 truncate">
                    {user.username}
                  </div>
                  <div className="mt-0.5">{getRoleBadge()}</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-white hover:text-red-600 transition-colors"
              >
                <LogOut size={13} /> 退出登录
              </button>
            </div>
          </div>
        )}

        {health && (
          <div className="p-4 border-t border-slate-200">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50">
              <Database size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-slate-600 space-y-1">
                <div>
                  <span className="text-slate-500">存储:</span>{' '}
                  <span className="font-mono truncate block" style={{ maxWidth: 150 }}>
                    {health.config.storageDir.replace(/\\/g, '/')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">端口:</span>{' '}
                  <span className="font-mono">{health.config.port}</span>
                </div>
                <div>
                  <span className="text-slate-500">私有 scope:</span>{' '}
                  <span className="font-mono text-indigo-600">
                    {health.config.privateScopes.join(', ')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
