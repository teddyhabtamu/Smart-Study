import type express from 'express';
import { supabaseAdmin } from '../database/config';

export type AdminAuditLogAction =
  | 'user.premium.update'
  | 'user.status.update'
  | 'admin.invite'
  | 'admin.remove'
  | 'document.create'
  | 'document.update'
  | 'document.delete'
  | 'video.create'
  | 'video.update'
  | 'video.delete'
  | 'forum.post.delete'
  | (string & {});

export type AdminAuditTargetType =
  | 'user'
  | 'admin_team'
  | 'document'
  | 'video'
  | 'forum_post'
  | (string & {});

export interface AdminAuditLogEntry {
  action: AdminAuditLogAction;
  target_type?: AdminAuditTargetType;
  target_id?: string;
  summary?: string;
  before?: any;
  after?: any;
  meta?: Record<string, any>;
}

function getClientIp(req: express.Request): string | null {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    const first = forwardedFor.split(',').shift();
    return (first ?? '').trim() || null;
  }
  // Express may return IPv6-mapped IPv4 like ::ffff:127.0.0.1
  return (req.ip || null) as any;
}

function safeJson(value: any): any {
  try {
    // Ensure it's JSON-serializable (avoid BigInt / circulars)
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

export function isAdminActor(req: express.Request): boolean {
  const role = String((req as any).user?.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'MODERATOR';
}

export async function logAdminActivity(req: express.Request, entry: AdminAuditLogEntry): Promise<void> {
  try {
    // Never block core flows if audit logging is unavailable.
    if (!supabaseAdmin) return;
    if (!isAdminActor(req)) return;

    const actor = (req as any).user || null;
    const actorId = actor?.id ?? null;
    const actorEmail = actor?.email ?? null;
    const actorName = actor?.name ?? null;
    const actorRole = actor?.role ?? null;

    const ip = getClientIp(req);
    const ua = String(req.headers['user-agent'] || '');

    const meta = {
      ...(entry.meta || {}),
      route: req.originalUrl || req.url,
      method: req.method,
      ip,
      user_agent: ua,
    };

    const payload = {
      actor_user_id: actorId,
      actor_email: actorEmail,
      actor_name: actorName,
      actor_role: actorRole,
      action: entry.action,
      target_type: entry.target_type ?? null,
      target_id: entry.target_id ?? null,
      summary: entry.summary ?? null,
      before: safeJson(entry.before),
      after: safeJson(entry.after),
      meta: safeJson(meta) ?? {},
    };

    const { error } = await supabaseAdmin.from('admin_activity_logs').insert(payload);
    if (error) {
      // Missing table / RLS / perms etc. should not break admin actions.
      console.warn('Admin audit log insert failed:', error.message);
    }
  } catch (err: any) {
    console.warn('Admin audit log failed:', err?.message || err);
  }
}

