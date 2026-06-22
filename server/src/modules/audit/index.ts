import { Router, Response } from 'express';
import { config } from '../../config';
import { getMetadataIndex } from '../metadata';
import { authMiddleware, requireRole } from '../auth';
import type {
  AuditLog,
  AuditAction,
  AuditLogQuery,
  AuthenticatedRequest,
  User,
  UserRole,
} from '../../types';

interface LogEntry {
  userId?: number;
  username: string;
  userRole: UserRole;
  action: AuditAction;
  target?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

export class AuditLogger {
  private metadata: ReturnType<typeof getMetadataIndex>;

  constructor() {
    this.metadata = getMetadataIndex();
  }

  log(entry: LogEntry): void {
    if (!config.audit.enabled) return;

    const log: AuditLog = {
      id: 0,
      userId: entry.userId || 0,
      username: entry.username,
      userRole: entry.userRole,
      action: entry.action,
      target: entry.target,
      details: entry.details,
      ip: entry.ip,
      userAgent: entry.userAgent,
      timestamp: Date.now(),
      success: entry.success,
      errorMessage: entry.errorMessage,
    };

    this.metadata.addAuditLog(log);
  }

  logUserAction(
    user: User,
    action: AuditAction,
    req: AuthenticatedRequest,
    options: { target?: string; details?: Record<string, unknown>; success?: boolean; errorMessage?: string } = {}
  ): void {
    this.log({
      userId: user.id,
      username: user.username,
      userRole: user.role,
      action,
      target: options.target,
      details: options.details,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      success: options.success !== undefined ? options.success : true,
      errorMessage: options.errorMessage,
    });
  }

  query(query: AuditLogQuery): { logs: AuditLog[]; total: number } {
    return this.metadata.queryAuditLogs(query);
  }
}

let auditInstance: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!auditInstance) {
    auditInstance = new AuditLogger();
  }
  return auditInstance;
}

const router = Router();

router.get('/audit/logs', authMiddleware, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  const audit = getAuditLogger();
  const query: AuditLogQuery = {};

  if (typeof req.query.userId === 'string') {
    query.userId = parseInt(req.query.userId, 10);
  }
  if (typeof req.query.action === 'string') {
    query.action = req.query.action as AuditAction;
  }
  if (typeof req.query.startDate === 'string') {
    query.startDate = parseInt(req.query.startDate, 10);
  }
  if (typeof req.query.endDate === 'string') {
    query.endDate = parseInt(req.query.endDate, 10);
  }
  if (typeof req.query.limit === 'string') {
    query.limit = Math.min(500, parseInt(req.query.limit, 10));
  }
  if (typeof req.query.offset === 'string') {
    query.offset = parseInt(req.query.offset, 10);
  }
  if (typeof req.query.success === 'string') {
    query.success = req.query.success === 'true';
  }

  const result = audit.query(query);
  res.json(result);
});

router.get('/audit/actions', authMiddleware, requireRole('admin'), (_req: AuthenticatedRequest, res: Response) => {
  const actions: AuditAction[] = [
    'user.login',
    'user.logout',
    'user.create',
    'user.delete',
    'package.upload',
    'package.delete',
    'package.version.delete',
    'package.cleanup',
    'config.update',
    'cache.cleanup',
    'cache.snapshot',
  ];
  res.json({ actions });
});

export { router as auditRouter };
