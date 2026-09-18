import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, Loader2, RefreshCw, CheckCircle2, FlaskConical, Zap, Clock3, Plus } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { adminAPI } from '../../services/api';
import { AiKeysSkeleton } from './skeletons';

type KeyState = 'next' | 'idle' | 'cooling' | 'retired';

interface RingKey {
  index: number;
  fingerprint: string;
  state: KeyState;
  cooldownEndsInSec: number | null;
  served: number;
  quotaHits: number;
  invalidHits: number;
  otherErrors: number;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastErrorKind: 'quota' | 'invalid' | 'other' | null;
}

interface RingStatus {
  ringSize: number;
  cursor: number;
  bootedAt: string;
  preferredModel: string | null;
  deadModels: string[];
  keys: RingKey[];
}

const STATE_PILL: Record<KeyState, string> = {
  next: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  idle: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  cooling: 'bg-amber-100 text-amber-700 border-amber-200',
  retired: 'bg-red-100 text-red-600 border-red-200',
};

const STATE_LABEL: Record<KeyState, string> = {
  next: 'Serving next',
  idle: 'Healthy standby',
  cooling: 'Quota cooling',
  retired: 'Invalid — retired',
};

// AI Keys tab (admin-only): live Gemini key-ring health — which key serves
// next, which are cooling/retired, per-key serve/quota counters, and a
// zero-spend Validate button per key. Keys are identified by last-4
// fingerprint only; the backend never sends key material.
const AiKeysTab: React.FC = () => {
  const { addToast } = useToast();
  const [status, setStatus] = useState<RingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState<number | null>(null);

  const fetchStatus = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await adminAPI.getAiKeyRing();
      setStatus(data);
    } catch (error: any) {
      console.error('Failed to fetch AI key status:', error);
      if (!silent) addToast('Failed to load AI key status', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchStatus();
    // Cooldowns tick in minutes, so 30s keeps countdowns fresh without
    // hammering the endpoint. Paused while the browser tab is hidden.
    const timer = setInterval(() => {
      if (document.hidden) return;
      fetchStatus(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const handleValidate = async (index: number, fingerprint: string) => {
    try {
      setValidating(index);
      const result = await adminAPI.validateAiKey(index);
      addToast(result.message, result.ok ? 'success' : 'warning');
      await fetchStatus(true);
    } catch (error: any) {
      console.error('Failed to validate AI key:', error);
      addToast(`Could not validate ${fingerprint}`, 'error');
    } finally {
      setValidating(null);
    }
  };

  const fmtTime = (iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  };

  if (loading && !status) {
    // Layout-holding skeleton (same shape as the cards below): no spinner
    // flash, no content jump when the ring status lands.
    return <AiKeysSkeleton />;
  }

  if (!status) {
    return (
      <div className="text-center py-16 text-zinc-500 text-sm">
        Key status unavailable.
        <button onClick={() => fetchStatus()} className="ml-2 underline font-medium">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {status.ringSize} {status.ringSize === 1 ? 'key' : 'keys'} in rotation
          {status.preferredModel ? <> · prefers <span className="font-mono">{status.preferredModel}</span></> : null}
        </p>
        <button
          onClick={() => fetchStatus()}
          className="p-2 text-zinc-400 hover:text-ink hover:bg-zinc-100 rounded-lg transition-colors"
          title="Refresh now"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {status.ringSize === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          No Gemini keys configured. Set <span className="font-mono font-semibold">GEMINI_API_KEYS</span> in the
          backend Vercel env (comma-separated) and redeploy.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {status.keys.map((key) => (
            <div key={key.index} className="bg-surface border border-zinc-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <KeyRound size={16} className="text-zinc-400 flex-shrink-0" />
                  <span className="font-mono font-bold text-ink text-sm truncate">{key.fingerprint}</span>
                  <span className="text-[11px] text-zinc-400">#{key.index + 1}</span>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border flex-shrink-0 ${STATE_PILL[key.state]}`}>
                  {STATE_LABEL[key.state]}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="bg-zinc-50 rounded-lg py-2">
                  <div className="font-bold text-ink tabular-nums">{key.served}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">served</div>
                </div>
                <div className="bg-zinc-50 rounded-lg py-2">
                  <div className={`font-bold tabular-nums ${key.quotaHits > 0 ? 'text-amber-600' : 'text-ink'}`}>{key.quotaHits}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">quota hits</div>
                </div>
                <div className="bg-zinc-50 rounded-lg py-2">
                  <div className={`font-bold tabular-nums ${key.invalidHits > 0 ? 'text-red-600' : 'text-ink'}`}>{key.invalidHits}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">invalid</div>
                </div>
              </div>

              {key.state === 'cooling' && key.cooldownEndsInSec !== null && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700 mb-2">
                  <Clock3 size={13} /> Back in rotation in ~{key.cooldownEndsInSec}s
                </p>
              )}
              {key.state === 'retired' && (
                <p className="text-xs text-red-600 mb-2">
                  Credential rejected — check the value in Vercel env, or validate below.
                </p>
              )}
              <div className="text-[11px] text-zinc-500 space-y-0.5 mb-3">
                <p>Last served: {fmtTime(key.lastOkAt)}</p>
                {key.lastErrorAt && (
                  <p>Last {key.lastErrorKind} error: {fmtTime(key.lastErrorAt)}</p>
                )}
              </div>

              <button
                onClick={() => handleValidate(key.index, key.fingerprint)}
                disabled={validating === key.index}
                className="w-full py-2 text-xs font-semibold border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {validating === key.index ? (
                  <><Loader2 size={13} className="animate-spin" /> Checking…</>
                ) : (
                  <><FlaskConical size={13} /> Validate (free)</>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {status.deadModels.length > 0 && (
        <p className="text-xs text-zinc-500">
          Retired models (skipped for an hour): <span className="font-mono">{status.deadModels.join(', ')}</span>
        </p>
      )}

      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-xs text-zinc-600 space-y-2">
        <p className="flex items-start gap-1.5">
          <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
          Counters are per server instance since boot ({status.bootedAt ? new Date(status.bootedAt).toLocaleString() : '—'});
          they reset on deploy. Durable per-route totals live under Overview → AI usage.
        </p>
        <p className="flex items-start gap-1.5">
          <Plus size={14} className="text-zinc-400 flex-shrink-0 mt-0.5" />
          <span>
            Add keys in Vercel backend env as <span className="font-mono font-semibold">GEMINI_API_KEYS</span> (comma-separated, any
            count), redeploy — no code changes. Then Validate each one here before students lean on it.
          </span>
        </p>
        <p className="flex items-start gap-1.5">
          <Zap size={14} className="text-zinc-400 flex-shrink-0 mt-0.5" />
          Quota-hit keys cool down automatically and rejoin; invalid keys retire for an hour. Nothing here needs hands.
        </p>
      </div>
    </div>
  );
};

export default AiKeysTab;
