import React, { useState, useEffect } from 'react';
import { Gift, Copy, Send, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { subscriptionAPI } from '../services/api';
import { openTelegramShare, copyShareLink, shareUrl } from '../utils/share';

interface ReferralState {
  code: string | null;
  required: number;
  rewardMonths: number;
  qualifiedCount: number;
  pendingReward: { id: string; status: string; created_at: string } | null;
  latestReward: { id: string; status: string; created_at: string; decided_at: string | null } | null;
  referees: Array<{ email: string; qualified: boolean }>;
}

// "Refer 5 friends, earn Pro" card for the Subscription page (rendered in
// both the upgrade and member views — current Pro members are the best
// recruiters). Server truth: code, qualified progress, reward state.
const ReferralCard: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [state, setState] = useState<ReferralState | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    subscriptionAPI.getMyReferrals().then(setState).catch(() => {});
  }, [user?.id]);

  if (!user || !state?.code) return null;

  const link = shareUrl(`/register?ref=${state.code}`);
  const pct = Math.min(100, Math.round((state.qualifiedCount / state.required) * 100));

  const handleCopy = async () => {
    const ok = await copyShareLink(link);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      addToast('Could not copy — long-press the link to copy it manually.', 'error');
    }
  };

  const handleTelegram = () => {
    const ok = openTelegramShare(
      'Join me on SmartStudy — free EGSECE + entrance prep (past papers, AI tutor, quizzes):',
      link
    );
    if (!ok) addToast('Popup blocked — copy the link below instead.', 'info');
  };

  return (
    <div className="max-w-xl mx-auto mt-6 sm:mt-8 bg-surface rounded-2xl border border-zinc-200 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
          <Gift size={20} />
        </div>
        <h3 className="text-lg font-bold text-ink">Get Pro free — invite friends</h3>
      </div>
      <p className="text-sm text-zinc-500 mb-4 leading-relaxed">
        Share your link. When <strong className="text-ink">{state.required} friends</strong> sign up and verify
        their email, you earn <strong className="text-ink">{state.rewardMonths} month of Student Pro</strong>,
        approved by our team.
      </p>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
          <span className="text-inksoft">
            {state.qualifiedCount} of {state.required} verified
          </span>
          {state.pendingReward ? (
            <span className="text-amber-700">Under review 🎉</span>
          ) : state.latestReward?.status === 'approved' ? (
            <span className="text-emerald-600">Reward granted — invite {state.required} more!</span>
          ) : null}
        </div>
        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={state.qualifiedCount} aria-valuemin={0} aria-valuemax={state.required}>
          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Link + share */}
      <div className="flex items-center gap-2 p-2 pl-3 bg-zinc-50 border border-zinc-200 rounded-lg mb-3">
        <span className="font-mono text-xs text-inksoft truncate flex-1">{link}</span>
        <button
          onClick={handleCopy}
          title="Copy invite link"
          aria-label="Copy invite link"
          className="p-2 rounded-lg hover:bg-zinc-200 transition-colors text-inksoft flex-shrink-0"
        >
          {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={handleTelegram}
          className="px-4 py-2 bg-[#229ED9] text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all inline-flex items-center gap-1.5"
        >
          <Send size={14} /> Share on Telegram
        </button>
      </div>

      {/* Referees (masked) */}
      {state.referees.length > 0 && (
        <div className="border-t border-zinc-100 pt-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Your invites</p>
          <div className="space-y-1.5">
            {state.referees.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-inksoft">{r.email}</span>
                {r.qualified ? (
                  <span className="text-[11px] font-bold text-emerald-600 inline-flex items-center gap-1">
                    <Check size={12} /> verified
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-zinc-400">signed up — not verified yet</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {state.latestReward?.status === 'rejected' && !state.pendingReward && (
        <p className="text-xs text-zinc-500 mt-3">
          Your last reward was declined after review. Keep inviting — new verified friends still count.
        </p>
      )}
    </div>
  );
};

export default ReferralCard;
