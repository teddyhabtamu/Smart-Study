import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { adminAPI } from '../../services/api';

// Audit log tab (extracted from Admin.tsx, admin-only): who changed what,
// with search, expandable before/after diffs, and pagination.
const AuditTab: React.FC = () => {
  const { addToast } = useToast();
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditExpandedId, setAuditExpandedId] = useState<string | null>(null);
  const [auditPagination, setAuditPagination] = useState<{ total: number; limit: number; offset: number; hasMore: boolean }>({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false
  });

  const fetchAuditLogs = useCallback(async (opts?: { offset?: number }) => {
    try {
      setAuditLoading(true);
      const limit = 50;
      const offset = opts?.offset ?? 0;
      const result = await adminAPI.getAuditLogs({ limit, offset, search: auditSearch.trim() || undefined });
      setAuditLogs(result.logs || []);
      setAuditPagination(result.pagination || { total: 0, limit, offset, hasMore: false });
    } catch (error: any) {
      console.error('Failed to fetch audit logs:', error);
      addToast('Failed to load audit logs', 'error');
    } finally {
      setAuditLoading(false);
    }
  }, [addToast, auditSearch]);

  const formatAuditValue = useCallback((value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }, []);

  const computeAuditChanges = useCallback((before: any, after: any) => {
    const b = (before && typeof before === 'object') ? before : null;
    const a = (after && typeof after === 'object') ? after : null;

    // Create
    if (!b && a) {
      return Object.keys(a).sort().map((key) => ({ key, before: undefined, after: a[key] }));
    }
    // Delete
    if (b && !a) {
      return Object.keys(b).sort().map((key) => ({ key, before: b[key], after: undefined }));
    }
    // Unknown / nothing
    if (!b && !a) return [];

    const keys = new Set<string>([...Object.keys(b!), ...Object.keys(a!)]);
    const changes: Array<{ key: string; before: any; after: any }> = [];

    Array.from(keys).sort().forEach((key) => {
      const bv = (b as any)[key];
      const av = (a as any)[key];
      // Compare via stable-ish JSON for primitives/objects
      const bs = (() => { try { return JSON.stringify(bv); } catch { return String(bv); } })();
      const as = (() => { try { return JSON.stringify(av); } catch { return String(av); } })();
      if (bs !== as) changes.push({ key, before: bv, after: av });
    });

    return changes;
  }, []);

  useEffect(() => {
    fetchAuditLogs({ offset: 0 });
  }, [fetchAuditLogs]);

  return (
        <div className="space-y-4 sm:space-y-6 animate-fade-in">
          <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-zinc-100 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-900">Admin Activity Log</h2>
                <p className="text-xs sm:text-sm text-zinc-500">Who changed what (premium, status, content, team).</p>
              </div>
              <div className="flex gap-2 sm:gap-3 items-center w-full sm:w-auto">
                <div className="relative w-full sm:w-80">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-zinc-400" />
                  </div>
                  <input
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search (action, email, target, summary)..."
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-300 transition-all"
                  />
                </div>
                <button
                  onClick={() => fetchAuditLogs({ offset: 0 })}
                  disabled={auditLoading}
                  className="px-3 py-2.5 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  title="Refresh"
                >
                  {auditLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 sm:px-6 py-3">Time</th>
                    <th className="px-4 sm:px-6 py-3">Actor</th>
                    <th className="px-4 sm:px-6 py-3">Action</th>
                    <th className="px-4 sm:px-6 py-3">Target</th>
                    <th className="px-4 sm:px-6 py-3">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {auditLoading ? (
                    <tr>
                      <td className="px-4 sm:px-6 py-6 text-zinc-500" colSpan={5}>Loading audit logs...</td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td className="px-4 sm:px-6 py-6 text-zinc-500" colSpan={5}>No audit logs found.</td>
                    </tr>
                  ) : (
                    auditLogs.map((row: any) => {
                      const id = String(row.id);
                      const expanded = auditExpandedId === id;
                      const changes = expanded ? computeAuditChanges(row.before, row.after) : [];
                      return (
                        <React.Fragment key={id}>
                          <tr
                            className="hover:bg-zinc-50 cursor-pointer"
                            onClick={() => setAuditExpandedId(expanded ? null : id)}
                          >
                            <td className="px-4 sm:px-6 py-4 text-xs text-zinc-600 whitespace-nowrap">
                              {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                            </td>
                            <td className="px-4 sm:px-6 py-4">
                              <div className="text-zinc-900 font-medium">{row.actor_name || row.actor_email || 'Unknown'}</div>
                              <div className="text-[11px] text-zinc-500">{row.actor_role || ''}</div>
                            </td>
                            <td className="px-4 sm:px-6 py-4 font-mono text-xs text-zinc-700">{row.action || '-'}</td>
                            <td className="px-4 sm:px-6 py-4 text-xs text-zinc-600">
                              <div>{row.target_type || '-'}</div>
                              <div className="font-mono text-[11px] text-zinc-400">{row.target_id || ''}</div>
                            </td>
                            <td className="px-4 sm:px-6 py-4 text-zinc-700">{row.summary || '-'}</td>
                          </tr>
                          {expanded && (
                            <tr className="bg-zinc-50/50">
                              <td className="px-4 sm:px-6 py-4" colSpan={5}>
                                <div className="space-y-3 sm:space-y-4">
                                  <div className="bg-white border border-zinc-200 rounded-lg p-3">
                                    <div className="text-xs font-semibold text-zinc-700 mb-2">Changes</div>
                                    {changes.length === 0 ? (
                                      <div className="text-xs text-zinc-500">No field-level changes available.</div>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead className="text-[11px] text-zinc-500 uppercase">
                                            <tr>
                                              <th className="text-left py-2 pr-3">Field</th>
                                              <th className="text-left py-2 pr-3">Before</th>
                                              <th className="text-left py-2">After</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-zinc-100">
                                            {changes.slice(0, 30).map((c) => (
                                              <tr key={c.key}>
                                                <td className="py-2 pr-3 font-mono text-zinc-700">{c.key}</td>
                                                <td className="py-2 pr-3 text-zinc-600 break-words">{formatAuditValue(c.before)}</td>
                                                <td className="py-2 text-zinc-600 break-words">{formatAuditValue(c.after)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                        {changes.length > 30 && (
                                          <div className="mt-2 text-[11px] text-zinc-500">Showing first 30 changes.</div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                                    <details className="bg-white border border-zinc-200 rounded-lg p-3">
                                      <summary className="text-xs font-semibold text-zinc-700 cursor-pointer select-none">Raw Before JSON</summary>
                                      <pre className="mt-2 text-[11px] text-zinc-700 whitespace-pre-wrap break-words max-h-[320px] overflow-auto">{JSON.stringify(row.before ?? null, null, 2)}</pre>
                                    </details>
                                    <details className="bg-white border border-zinc-200 rounded-lg p-3">
                                      <summary className="text-xs font-semibold text-zinc-700 cursor-pointer select-none">Raw After JSON</summary>
                                      <pre className="mt-2 text-[11px] text-zinc-700 whitespace-pre-wrap break-words max-h-[320px] overflow-auto">{JSON.stringify(row.after ?? null, null, 2)}</pre>
                                    </details>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 sm:p-6 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
              <div>
                Showing <span className="font-medium text-zinc-700">{auditLogs.length}</span> of{' '}
                <span className="font-medium text-zinc-700">{auditPagination.total}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchAuditLogs({ offset: Math.max(0, auditPagination.offset - auditPagination.limit) })}
                  disabled={auditLoading || auditPagination.offset === 0}
                  className="px-3 py-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  onClick={() => fetchAuditLogs({ offset: auditPagination.offset + auditPagination.limit })}
                  disabled={auditLoading || !auditPagination.hasMore}
                  className="px-3 py-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
  );
};

export default AuditTab;
