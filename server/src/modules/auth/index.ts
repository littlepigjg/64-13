import { Router, Response, NextFunction } from 'express';
import { config } from '../../config';
import { getMetadataIndex } from '../metadata';
import { getAuditLogger } from '../audit';
import type {
  User,
  UserRole,
  AuthenticatedRequest,
  LoginRequest,
  LoginResponse,
  CreateUserRequest,
} from '../../types';
import { randomBytes } from 'crypto';

function generateToken(): string {
  return 'tk_' + randomBytes(24).toString('hex');
}

function extractToken(req: AuthenticatedRequest): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  if (req.headers['x-auth-token']) {
    return String(req.headers['x-auth-token']);
  }
  if (req.query && typeof req.query.token === 'string') {
    return req.query.token;
  }
  if (req.body && typeof req.body === 'object' && req.body.token) {
    return req.body.token;
  }
  return null;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!config.auth.requireAuth) {
    next();
    return;
  }

  const publicPaths = [
    '/api/auth/login',
    '/api/health',
    '/npm',
    '/pypi',
  ];
  const path = req.path;
  if (publicPaths.some(p => path.startsWith(p))) {
    next();
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
    return;
  }

  const metadata = getMetadataIndex();
  const user = metadata.getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    return;
  }

  const now = Date.now();
  const expiryMs = config.auth.tokenExpiryDays * 24 * 60 * 60 * 1000;
  if (now - user.lastActiveAt > expiryMs) {
    res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return;
  }

  metadata.updateUserLastActive(user.id, now);
  req.user = user;
  next();
}

export function requireRole(role: UserRole) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!config.auth.requireAuth) {
      next();
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (role === 'admin' && user.role !== 'admin') {
      res.status(403).json({ error: 'Admin permission required', code: 'PERMISSION_DENIED' });
      return;
    }

    next();
  };
}

export function canDeletePackage(
  req: AuthenticatedRequest,
  packageName: string,
  registry: string
): boolean {
  if (!config.auth.requireAuth) return true;
  const user = req.user;
  if (!user) return false;
  if (user.role === 'admin') return true;

  const metadata = getMetadataIndex();
  const pkg = metadata.getPackage(packageName, registry as any);
  if (!pkg) return false;
  if (pkg.source !== 'private') return false;

  return pkg.ownerId === user.id;
}

const router = Router();

router.post('/auth/login', (req: AuthenticatedRequest, res: Response) => {
  const audit = getAuditLogger();
  const body = req.body as Partial<LoginRequest>;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];

  if (!body.username || !body.token) {
    audit.log({
      action: 'user.login',
      username: body.username || 'unknown',
      userRole: 'developer',
      target: body.username,
      success: false,
      errorMessage: 'Missing username or token',
      ip,
      userAgent,
    });
    res.status(400).json({ error: 'Username and token are required' });
    return;
  }

  const metadata = getMetadataIndex();
  let user = metadata.getUserByUsername(body.username);

  if (!user) {
    audit.log({
      action: 'user.login',
      username: body.username,
      userRole: 'developer',
      target: body.username,
      success: false,
      errorMessage: 'User not found',
      ip,
      userAgent,
    });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (user.token !== body.token) {
    audit.log({
      action: 'user.login',
      userId: user.id,
      username: user.username,
      userRole: user.role,
      target: user.username,
      success: false,
      errorMessage: 'Invalid token',
      ip,
      userAgent,
    });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const now = Date.now();
  metadata.updateUserLastActive(user.id, now);

  const updatedUser = metadata.getUserById(user.id)!;

  audit.log({
    action: 'user.login',
    userId: updatedUser.id,
    username: updatedUser.username,
    userRole: updatedUser.role,
    target: updatedUser.username,
    success: true,
    ip,
    userAgent,
  });

  const response: LoginResponse = {
    success: true,
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      role: updatedUser.role,
      token: updatedUser.token,
      createdAt: updatedUser.createdAt,
      lastActiveAt: updatedUser.lastActiveAt,
    },
  };

  res.json(response);
});

router.post('/auth/logout', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const audit = getAuditLogger();
  const user = req.user;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];

  if (user) {
    audit.log({
      action: 'user.logout',
      userId: user.id,
      username: user.username,
      userRole: user.role,
      target: user.username,
      success: true,
      ip,
      userAgent,
    });
  }

  res.json({ success: true });
});

router.get('/auth/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  if (!config.auth.requireAuth) {
    res.json({
      authEnabled: false,
    });
    return;
  }

  res.json({
    authEnabled: true,
    user: req.user,
  });
});

router.get('/auth/users', authMiddleware, requireRole('admin'), (_req: AuthenticatedRequest, res: Response) => {
  const metadata = getMetadataIndex();
  const users = metadata.listUsers();
  res.json({ users });
});

router.post('/auth/users', authMiddleware, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  const audit = getAuditLogger();
  const body = req.body as Partial<CreateUserRequest>;
  const user = req.user!;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];

  if (!body.username || !body.role) {
    res.status(400).json({ error: 'Username and role are required' });
    return;
  }

  if (!['admin', 'developer'].includes(body.role)) {
    res.status(400).json({ error: 'Invalid role. Must be admin or developer' });
    return;
  }

  if (body.username.length < 3 || body.username.length > 50) {
    res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(body.username)) {
    res.status(400).json({ error: 'Username can only contain letters, numbers, underscores and hyphens' });
    return;
  }

  const metadata = getMetadataIndex();
  const existing = metadata.getUserByUsername(body.username);
  if (existing) {
    res.status(409).json({ error: 'Username already exists' });
    return;
  }

  const token = generateToken();
  const newUser = metadata.createUser(body.username, body.role as UserRole, token);

  audit.log({
    action: 'user.create',
    userId: user.id,
    username: user.username,
    userRole: user.role,
    target: newUser.username,
    details: { newUserId: newUser.id, newUserRole: newUser.role },
    success: true,
    ip,
    userAgent,
  });

  res.json({
    success: true,
    user: newUser,
    token,
  });
});

router.delete('/auth/users/:id', authMiddleware, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  const audit = getAuditLogger();
  const user = req.user!;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];
  const targetId = parseInt(req.params.id as string, 10);

  if (isNaN(targetId)) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  if (targetId === user.id) {
    res.status(400).json({ error: 'Cannot delete yourself' });
    return;
  }

  const metadata = getMetadataIndex();
  const targetUser = metadata.getUserById(targetId);
  if (!targetUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const admins = metadata.listUsers().filter(u => u.role === 'admin');
  if (targetUser.role === 'admin' && admins.length <= 1) {
    res.status(400).json({ error: 'Cannot delete the last admin user' });
    return;
  }

  const deleted = metadata.deleteUser(targetId);
  if (!deleted) {
    res.status(500).json({ error: 'Failed to delete user' });
    return;
  }

  audit.log({
    action: 'user.delete',
    userId: user.id,
    username: user.username,
    userRole: user.role,
    target: targetUser.username,
    details: { deletedUserId: targetId },
    success: true,
    ip,
    userAgent,
  });

  res.json({
    success: true,
    deleted: targetUser.username,
  });
});

router.post('/auth/users/:id/regenerate-token', authMiddleware, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  const audit = getAuditLogger();
  const adminUser = req.user!;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];
  const targetId = parseInt(req.params.id as string, 10);

  if (isNaN(targetId)) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  const metadata = getMetadataIndex();
  const targetUser = metadata.getUserById(targetId);
  if (!targetUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const newToken = generateToken();
  metadata.updateUserToken(targetId, newToken);

  audit.log({
    action: 'config.update',
    userId: adminUser.id,
    username: adminUser.username,
    userRole: adminUser.role,
    target: `user:${targetUser.username}`,
    details: { action: 'regenerate_token' },
    success: true,
    ip,
    userAgent,
  });

  res.json({
    success: true,
    token: newToken,
  });
});

export { router as authRouter };
