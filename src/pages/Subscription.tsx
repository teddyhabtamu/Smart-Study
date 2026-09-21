
import React, { useState, useEffect } from 'react';
import Dialog from '../components/Dialog';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, X, ShieldCheck, Crown, Calendar, CreditCard, Copy, MessageCircle, Loader2, Gift } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { subscriptionAPI } from '../services/api';
import ReferralCard from '../components/ReferralCard';

const PRO_PLAN = {
// Single source of truth for the Pro plan. Amount/channel must match what
// the admin actually charges — the UI stated three different feature sets
// and fabricated purchase details before this cleanup.
  name: 'Student Pro',
  priceLabel: '100 Birr',
  billingLabel: 'One-time payment · yours forever',
  channel: 'Telebirr',
  // The merchant number customers pay to (shown with a copy button
  // so single-phone users who can't scan the QR can still pay).
  merchantNumber: '0960967099',
  telegramUrl: 'https://t.me/ethio_smartstudy',
  telegramHandle: '@ethio_smartstudy',
};

// The honest Pro feature set — identical list as Profile Member Hub. Sized
// to what's actually there (14 documents, ~800 videos, app-side quiz caps:
// free users get a daily window, Pro has none).
const PRO_FEATURES = [
  { title: 'Premium document library', sub: 'Textbooks & study guides' },
  { title: 'Premium video lessons', sub: 'Tutorial library across all grades' },
  { title: 'AI practice quizzes', sub: 'No daily limits on AI quizzes' },
  { title: 'AI Smart Schedule planner', sub: 'Personal plans built around your deadlines' },
];

const FREE_FEATURES = ['Browse the catalog', 'Limited previews', '1 AI quiz & 1 community question per day'];

const Subscription: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'scan' | 'confirm_sent' | 'waiting' | 'success'>('scan');
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Server-side claim (identity-linked receipt queue). Survives modal
  // closes and devices — unlike the old local-only waiting room.
  const [myClaim, setMyClaim] = useState<{ id: string; status: string; transaction_ref: string | null; created_at: string } | null>(null);
  const [txRef, setTxRef] = useState('');
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // If the admin activates the account while the payment modal is open
  // (manual activation takes a few hours — the user may well be staring at
  // the "waiting" step), flip to the success screen instead of leaving them
  // on a stale waiting room. This is also the only path that reaches it.
  useEffect(() => {
    if (isModalOpen && user?.isPremium && (paymentStep === 'waiting' || paymentStep === 'confirm_sent')) {
      setPaymentStep('success');
    }
  }, [isModalOpen, user?.isPremium, paymentStep]);

  // Poll for activation while waiting: without this the flip effect above
  // never fires — nothing re-fetches the profile (refreshUser is cache-gated
  // and the bell poll runs elsewhere). Forced refresh every 20s, modal-only.
  useEffect(() => {
    if (!isModalOpen || user?.isPremium || (paymentStep !== 'waiting' && paymentStep !== 'confirm_sent')) return;
    const id = window.setInterval(() => {
      refreshUser(true).catch(() => {});
    }, 20_000);
    return () => window.clearInterval(id);
  }, [isModalOpen, user?.isPremium, paymentStep, refreshUser]);

  // Manual "I've been activated" check — same forced refresh, user-driven.
  const handleCheckStatus = async () => {
    try {
      setIsCheckingStatus(true);
      await refreshUser(true);
      // Approval auto-settles the claim server-side — re-read it so the
      // ticket below flips without reopening the modal.
      try {
        const claim = await subscriptionAPI.getMyClaim();
        setMyClaim(claim);
      } catch { /* claim read is advisory next to the profile refresh */ }
    } catch {
      addToast('Could not reach the server — please try again.', 'error');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Server truth for the waiting room: a pending claim from any session or
  // device jumps straight to waiting (with ticket), instead of starting
  // over at the QR code.
  useEffect(() => {
    if (!user || user.isPremium) return;
    subscriptionAPI.getMyClaim().then(setMyClaim).catch(() => {});
  }, [user?.id, user?.isPremium]);

  useEffect(() => {
    if (isModalOpen && myClaim?.status === 'pending' && paymentStep === 'scan') {
      setPaymentStep('waiting');
    }
  }, [isModalOpen, myClaim?.status, paymentStep]);

  // "I have sent the receipt" records the identity-linked claim (optional
  // Telebirr transaction ID helps the admin match the receipt) and only
  // then advances — the queue entry is what the admin works from.
  const handleReceiptSent = async () => {
    try {
      setIsSubmittingClaim(true);
      const claim = await subscriptionAPI.submitClaim(txRef.trim() || undefined);
      setMyClaim(claim);
      setPaymentStep('waiting');
    } catch {
      addToast('Could not record your claim — please try again.', 'error');
    } finally {
      setIsSubmittingClaim(false);
    }
  };

  // Retrieve the previous path or default to dashboard
  const from = (location.state as any)?.from || '/dashboard';

  const copyMerchantNumber = async () => {
    try {
      await navigator.clipboard.writeText(PRO_PLAN.merchantNumber);
      setCopiedNumber(true);
      addToast('Number copied to clipboard', 'success');
      setTimeout(() => setCopiedNumber(false), 2000);
    } catch {
      addToast('Could not copy — please type the number manually', 'error');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setPaymentStep('scan');
  };

  const handleSuccessContinue = () => {
    closeModal();
    navigate(from, { replace: true });
  };


  // RENDER: Active Subscription View
  if (user?.isPremium) {
    const memberSince = user.premiumSince
      ? new Date(user.premiumSince).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
      : null;
    return (
      <div className="max-w-4xl mx-auto py-8 sm:py-12 animate-fade-in px-4 sm:px-6">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight mb-3">Student Pro</h1>
          <p className="text-zinc-500 text-sm sm:text-base">Your membership details.</p>
        </div>

        <div className="max-w-xl mx-auto bg-surface rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          {/* Active Plan Header */}
          <div className="bg-zinc-900 p-6 sm:p-8 text-onink relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-gradient-to-bl from-zinc-500/20 to-transparent w-24 h-24 sm:w-32 sm:h-32 rounded-bl-full"></div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4 relative z-10">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-surface/10 rounded-xl backdrop-blur-sm border border-white/10 flex-shrink-0">
                  <Crown size={20} className="sm:w-7 sm:h-7 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold">{PRO_PLAN.name}</h3>
                  <p className="text-zinc-400 text-sm">{PRO_PLAN.billingLabel}</p>
                </div>
              </div>
              <span className="self-start sm:ml-auto bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 px-2 sm:px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck size={10} className="sm:w-3 sm:h-3" /> Active
              </span>
            </div>
          </div>

          {/* Plan Details — only what we actually know */}
          <div className="p-6 sm:p-8 space-y-6 sm:space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 sm:gap-y-6 gap-x-4 pb-6 sm:pb-8 border-b border-zinc-100">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">Billing</p>
                <p className="text-ink font-medium flex items-center gap-2 text-sm sm:text-base">
                  <Calendar size={14} className="sm:w-4 sm:h-4 text-zinc-400" /> {PRO_PLAN.priceLabel} · one-time
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">Member since</p>
                <p className="text-ink font-medium text-sm sm:text-base break-words">
                  {memberSince ?? '—'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">Paid via</p>
                <p className="text-ink font-medium flex items-center gap-2 text-sm sm:text-base">
                  <CreditCard size={14} className="sm:w-4 sm:h-4 text-zinc-400" /> {PRO_PLAN.channel} · manual activation
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-ink text-sm sm:text-base">Your Pro perks</h4>
              <div className="grid grid-cols-1 gap-3">
                {PRO_FEATURES.map((f) => (
                  <div key={f.title} className="flex items-start gap-3">
                    <Check size={14} className="sm:w-4 sm:h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-ink">{f.title}</p>
                      <p className="text-xs text-zinc-500">{f.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>


            <div className="bg-zinc-50 rounded-lg p-3 sm:p-4 flex gap-3 items-start text-xs sm:text-sm text-ink leading-relaxed border border-zinc-200">
               <MessageCircle size={14} className="sm:w-4 sm:h-4 flex-shrink-0 mt-0.5 text-inksoft" />
               <p>
                 Questions about your membership? Message us on Telegram{' '}
                 <a href={PRO_PLAN.telegramUrl} target="_blank" rel="noopener noreferrer" className="underline font-semibold hover:text-zinc-950">
                   {PRO_PLAN.telegramHandle}
                 </a>{' '}
                 and we'll sort it out.
               </p>
          </div>
        </div>
      </div>

      {/* Referral program: visible in the member view too — current Pro
          members are the most credible recruiters. */}
      <ReferralCard />
    </div>
  );
  }

  // RENDER: Upgrade View (For Free Users)
  return (
    <div className="max-w-4xl mx-auto py-8 sm:py-12 animate-fade-in relative px-4 sm:px-6">
      <div className="text-center mb-8 sm:mb-10">
        <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight mb-3">Simple, transparent pricing</h1>
        <p className="text-zinc-500 text-sm sm:text-base">Invest in your education with our premium resources.</p>
        {/* Free-path hook: the full invite card used to sit below the
            pricing grid (below the fold) where nobody saw it. This pill
            catches the eye up top and jumps to the card. */}
        <a
          href="#refer-friends"
          className="inline-flex items-center gap-1.5 mt-3 px-3.5 py-1.5 text-xs font-bold text-amber-700 bg-amber-100/80 border border-amber-200 rounded-full hover:brightness-95 transition-all"
        >
          <span aria-hidden="true" className="inline-flex"><Gift size={13} /></span> Get Pro free — invite 5 friends
        </a>
      </div>

      {/* Free path to Pro first: refer 5 verified friends, admin approves.
          Above the pricing grid (was below the fold) so the free option is
          seen before the paid one. */}
      <div className="mb-8 sm:mb-10">
        <ReferralCard id="refer-friends" />
      </div>

      {/* Persistent pending state: the modal-only waiting room used to
          vanish on close, leaving payers on a free plan with no trace. */}
      {myClaim?.status === 'pending' && (
        <div className="max-w-xl mx-auto mb-6 sm:mb-8 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-amber-900 flex-1">
            <strong>Verification pending</strong> — filed {new Date(myClaim.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. We'll upgrade you as soon as the receipt checks out.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-zinc-900 text-onink text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap"
          >
            View ticket
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        {/* Free */}
        <div className="bg-surface p-6 sm:p-8 rounded-2xl border border-zinc-200 flex flex-col">
           <div className="mb-4 sm:mb-6">
             <h3 className="text-lg font-bold text-ink">Basic</h3>
             <div className="mt-2 flex items-baseline gap-1">
               <span className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">Free</span>
             </div>
             <p className="text-sm text-zinc-500 mt-2">Essential access for every student.</p>
           </div>

            <div className="flex-1 space-y-3 sm:space-y-4 mb-6 sm:mb-8">
              {FREE_FEATURES.map((f, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-inksoft">
                  <Check size={14} className="sm:w-4 sm:h-4 text-zinc-400" /> {f}
                </div>
              ))}
            </div>

           <button className="w-full py-3 bg-zinc-100 text-ink font-medium rounded-lg hover:bg-zinc-200 transition-colors cursor-default text-sm sm:text-base">
             Current Plan
           </button>
        </div>

        {/* Pro */}
        <div className="bg-zinc-900 p-6 sm:p-8 rounded-2xl border border-zinc-800 flex flex-col relative overflow-hidden shadow-2xl">
           <div className="absolute top-0 right-0 bg-gradient-to-bl from-zinc-500/20 to-transparent w-24 h-24 sm:w-32 sm:h-32 rounded-bl-full"></div>
           <div className="mb-4 sm:mb-6 relative z-10">
             <h3 className="text-lg font-bold text-onink">Student Pro</h3>
             <div className="mt-2 flex items-baseline gap-1">
               <span className="text-3xl sm:text-4xl font-bold text-onink tracking-tight">100 Birr</span>
               <span className="text-zinc-400 text-sm">(One-time)</span>
             </div>
             <p className="text-sm text-zinc-400 mt-2">Unlock your full potential.</p>
           </div>

            <div className="flex-1 space-y-3 sm:space-y-4 mb-6 sm:mb-8 relative z-10">
              {PRO_FEATURES.map((f) => (
                 <div key={f.title} className="flex items-start gap-3 text-sm text-white/80">
                  <Check size={14} className="sm:w-4 sm:h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-onink">{f.title}</p>
                    <p className="text-xs text-zinc-400">{f.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full py-3 bg-surface text-ink font-medium rounded-lg hover:bg-zinc-100 transition-colors relative z-10 text-sm sm:text-base"
            >
              Upgrade via Telebirr
            </button>
         </div>
        </div>

        {/* Payment Modal using Portal */}
      {/* Payment dialog: focus-trapped, Esc-dismissible, focus-returning
          (shared Dialog). Backdrop click closes via the default dismissible
          path — same as the old overlay, which closed on backdrop click. */}
      <Dialog
        open={isModalOpen && mounted}
        onClose={closeModal}
        label="Subscribe to Pro"
        size="sm"
        panelClassName="rounded-2xl overflow-hidden"
      >
            <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 flex-shrink-0">
              <span className="font-bold text-ink">Subscribe to Pro</span>
              <button onClick={closeModal} className="p-1 text-zinc-400 hover:text-ink rounded-full hover:bg-zinc-200 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto">
              {paymentStep === 'scan' && (
                <div className="text-center space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-ink">Pay {PRO_PLAN.priceLabel} for Full Access</h3>
                    <p className="text-sm text-zinc-500">One payment via {PRO_PLAN.channel} — no subscription, no renewals.</p>
                  </div>

                  <div className="w-48 h-48 bg-surface border-2 border-zinc-900 rounded-xl mx-auto flex items-center justify-center relative p-2">
                     <img
                       src="/image/qrcode_payment.jpg"
                       alt="Telebirr Payment QR Code"
                       className="w-full h-full object-contain rounded-lg"
                     />
                  </div>

                  {PRO_PLAN.merchantNumber ? (
                    <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 text-left space-y-2">
                      <p className="text-sm text-inksoft">
                        On one phone and can't scan? Pay <strong>{PRO_PLAN.priceLabel}</strong> directly to:
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-ink text-base tracking-wider">{PRO_PLAN.merchantNumber}</span>
                        <button
                          onClick={copyMerchantNumber}
                          className="p-1.5 text-zinc-500 hover:text-ink hover:bg-zinc-200 rounded-lg transition-colors"
                          title="Copy number"
                        >
                          {copiedNumber ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                        </button>
                      </div>
                      <p className="text-xs text-zinc-500">Use your Telebirr app → Send Money, then continue below.</p>
                    </div>
                  ) : null}

                  <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-100 text-left">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Amount:</span>
                      <span className="font-bold text-ink">{PRO_PLAN.priceLabel} ({PRO_PLAN.billingLabel.split('·')[0].trim()})</span>
                    </div>
                  </div>

                  <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 text-left space-y-2">
                    <h4 className="font-semibold text-ink text-sm">After Payment:</h4>
                    <p className="text-inksoft text-sm leading-relaxed">
                      Send your payment receipt to our Telegram channel for account activation.<br/>
                      <strong>Telegram:</strong> <a href={PRO_PLAN.telegramUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">{PRO_PLAN.telegramHandle}</a><br/>
                      <span className="text-xs text-inksoft">Include your account email in the message so we can find you. Activation is manual — usually within a few hours, and you'll get an email confirmation.</span>
                    </p>
                  </div>

                  <button
                    onClick={() => setPaymentStep('confirm_sent')}
                    className="w-full py-3 bg-zinc-900 text-onink font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                  >
                    I have completed payment
                  </button>
                </div>
              )}

              {paymentStep === 'confirm_sent' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-zinc-100 text-inksoft rounded-full flex items-center justify-center mx-auto mb-4">
                      <ShieldCheck size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-ink">Confirm Receipt Sent</h3>
                    <p className="text-sm text-zinc-500">Please send your payment receipt to our Telegram admin for verification.</p>
                  </div>

                  <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 text-left space-y-3">
                    <h4 className="font-semibold text-ink text-sm">Send Receipt To:</h4>
                    <div className="space-y-2">
                      <p className="text-inksoft text-sm">
                        <strong>Telegram:</strong> <a href={PRO_PLAN.telegramUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">{PRO_PLAN.telegramHandle}</a>
                      </p>
                      <p className="text-inksoft text-sm">
                        Or direct link: <span className="font-mono">{PRO_PLAN.telegramUrl.replace('https://', '')}</span>
                      </p>
                    </div>
                    <p className="text-inksoft text-xs mt-3">
                      Make sure to send the complete receipt/screenshot showing the transaction details.
                    </p>
                    <div>
                      <label htmlFor="tx-ref" className="block text-xs font-semibold text-inksoft mb-1.5">
                        Telebirr transaction ID <span className="font-normal text-zinc-400">(optional — helps match your receipt faster)</span>
                      </label>
                      <input
                        id="tx-ref"
                        type="text"
                        value={txRef}
                        onChange={(e) => setTxRef(e.target.value)}
                        placeholder="e.g. TXN9X2KQ4M"
                        maxLength={100}
                        className="w-full px-3 py-2 bg-surface border border-zinc-200 rounded-lg text-sm text-ink placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-400 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={handleReceiptSent}
                      disabled={isSubmittingClaim}
                      className="w-full py-3 bg-zinc-900 text-onink font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmittingClaim ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> Recording…
                        </>
                      ) : (
                        'I have sent the receipt'
                      )}
                    </button>
                    <button onClick={() => setPaymentStep('scan')} className="w-full text-sm text-zinc-500 hover:text-ink">
                      Back to QR Code
                    </button>
                  </div>
                </div>
              )}

              {paymentStep === 'waiting' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-zinc-100 text-inksoft rounded-full flex items-center justify-center mx-auto mb-4">
                      <ShieldCheck size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-ink">Receipt Submitted</h3>
                    <p className="text-sm text-zinc-500">Your payment receipt has been submitted for verification.</p>
                  </div>

                  {/* Claim ticket: server truth, survives modal closes. The
                      payer identity is linked — no email matching needed. */}
                  {myClaim && (
                    <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 text-left text-sm space-y-1">
                      <p className="text-inksoft">
                        <strong>Ticket:</strong>{' '}
                        <span className="font-mono text-xs">{myClaim.id.slice(0, 8)}</span>
                        <span className="ml-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">
                          {myClaim.status}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500">
                        Filed {new Date(myClaim.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} as {user?.email}
                        {myClaim.transaction_ref ? ` · ref ${myClaim.transaction_ref}` : ''}
                      </p>
                    </div>
                  )}

                  <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 text-left">
                    <p className="text-inksoft text-sm leading-relaxed">
                      <strong>What happens next?</strong><br/>
                      • Our admin will verify your payment receipt<br/>
                      • Your account will be manually upgraded to Student Pro<br/>
                      • You'll receive an email confirmation once upgraded<br/>
                      • You'll get full access to premium features immediately<br/>
                      <span className="text-xs text-inksoft mt-2 block">Thank you for using SmartStudy. You can continue using free features while waiting.</span>
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={handleSuccessContinue}
                      className="w-full py-3 bg-zinc-900 text-onink font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                    >
                      Done
                    </button>
                    <button
                      onClick={handleCheckStatus}
                      disabled={isCheckingStatus}
                      className="w-full py-2.5 bg-surface border border-zinc-200 text-inksoft text-sm font-medium rounded-lg hover:bg-zinc-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {isCheckingStatus ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Checking…
                        </>
                      ) : (
                        'I’ve been activated — check status'
                      )}
                    </button>
                    <button onClick={() => setPaymentStep('confirm_sent')} className="w-full text-sm text-zinc-500 hover:text-ink">
                      Back
                    </button>
                  </div>
                </div>
              )}

              {paymentStep === 'success' && (
                <div className="text-center space-y-6">
                  <div className="w-16 h-16 bg-zinc-100 text-inksoft rounded-full flex items-center justify-center mx-auto animate-fade-in">
                    <Check size={32} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-ink">Welcome to Student Pro</h3>
                    <p className="text-zinc-500">Your account has been successfully upgraded. Enjoy full access to all premium features!</p>
                  </div>
                  <button 
                    onClick={handleSuccessContinue}
                    className="w-full py-3 bg-zinc-900 text-onink font-medium rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
      </Dialog>
    </div>
  );
};

export default Subscription;
