
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { Check, X, ShieldCheck, Loader2, Crown, Calendar, CreditCard, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SubscriptionProps {
  onUpgrade?: () => void;
}

const Subscription: React.FC<SubscriptionProps> = ({ onUpgrade }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'scan' | 'verify' | 'success'>('scan');
  const [transactionId, setTransactionId] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Retrieve the previous path or default to dashboard
  const from = (location.state as any)?.from || '/dashboard';

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    
    // Simulate API verification
    setTimeout(() => {
      setIsVerifying(false);
      setPaymentStep('success');
      
      // Update global user state
      if (onUpgrade) {
        onUpgrade();
      }
    }, 2000);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setPaymentStep('scan');
    setTransactionId('');
  };

  const handleSuccessContinue = () => {
    closeModal();
    navigate(from, { replace: true });
  };

  const handleCancelSubscription = () => {
    if(window.confirm("Are you sure you want to cancel your subscription? You will lose access to premium features at the end of the billing period.")) {
      alert("Subscription scheduled for cancellation.");
    }
  };

  // RENDER: Active Subscription View
  if (user?.isPremium) {
    return (
      <div className="max-w-4xl mx-auto py-12 animate-fade-in px-6">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight mb-3">Manage Subscription</h1>
          <p className="text-zinc-500">View your plan details and billing history.</p>
        </div>

        <div className="max-w-xl mx-auto bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          {/* Active Plan Header */}
          <div className="bg-zinc-900 p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-gradient-to-bl from-zinc-500/20 to-transparent w-32 h-32 rounded-bl-full"></div>
            <div className="flex items-center gap-4 mb-4 relative z-10">
              <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/10">
                <Crown size={28} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Student Pro</h3>
                <p className="text-zinc-400 text-sm">Active Subscription</p>
              </div>
              <span className="ml-auto bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck size={12} /> Active
              </span>
            </div>
          </div>
          
          {/* Plan Details */}
          <div className="p-8 space-y-8">
            <div className="grid grid-cols-2 gap-y-6 gap-x-4 pb-8 border-b border-zinc-100">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">Billing Cycle</p>
                <p className="text-zinc-900 font-medium flex items-center gap-2">
                  <Calendar size={16} className="text-zinc-400" /> Monthly
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">Next Payment</p>
                <p className="text-zinc-900 font-medium">
                  {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">Payment Method</p>
                <p className="text-zinc-900 font-medium flex items-center gap-2">
                  <CreditCard size={16} className="text-zinc-400" /> Telebirr (**92)
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">Amount</p>
                <p className="text-zinc-900 font-medium">100 ETB</p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-zinc-900 text-sm">Active Plan Features</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {['Unlimited Downloads', 'AI Tutor (Deep Think)', 'Offline Access', 'Priority Support', 'Ad-free Experience', 'Exclusive Content'].map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-zinc-600">
                    <Check size={14} className="text-emerald-500 flex-shrink-0" /> {f}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-100 flex flex-col sm:flex-row gap-4">
              <button 
                onClick={handleCancelSubscription}
                className="flex-1 py-2.5 bg-white border border-zinc-200 text-red-600 font-medium rounded-lg hover:bg-red-50 hover:border-red-100 transition-colors text-sm"
              >
                Cancel Subscription
              </button>
              <button className="flex-1 py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors text-sm">
                Update Payment Method
              </button>
            </div>
            
            <div className="bg-zinc-50 rounded-lg p-4 flex gap-3 items-start text-xs text-zinc-800 leading-relaxed border border-zinc-200">
               <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-zinc-600" />
               <p>
                 Need an invoice for reimbursement? <a href="#" className="underline font-semibold hover:text-zinc-950">Download latest invoice</a>.
               </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: Upgrade View (For Free Users)
  return (
    <div className="max-w-4xl mx-auto py-12 animate-fade-in relative px-6">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-zinc-900 tracking-tight mb-3">Simple, transparent pricing</h1>
        <p className="text-zinc-500">Invest in your education with our premium resources.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Free */}
        <div className="bg-white p-8 rounded-2xl border border-zinc-200 flex flex-col">
           <div className="mb-6">
             <h3 className="text-lg font-bold text-zinc-900">Basic</h3>
             <div className="mt-2 flex items-baseline gap-1">
               <span className="text-4xl font-bold text-zinc-900 tracking-tight">Free</span>
             </div>
             <p className="text-sm text-zinc-500 mt-2">Essential access for every student.</p>
           </div>
           
           <div className="flex-1 space-y-4 mb-8">
             {['Browse entire catalog', 'Limited previews', 'Community access'].map((f, i) => (
               <div key={i} className="flex items-center gap-3 text-sm text-zinc-600">
                 <Check size={16} className="text-zinc-400" /> {f}
               </div>
             ))}
           </div>
           
           <button className="w-full py-3 bg-zinc-100 text-zinc-900 font-medium rounded-lg hover:bg-zinc-200 transition-colors cursor-default">
             Current Plan
           </button>
        </div>

        {/* Pro */}
        <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 flex flex-col relative overflow-hidden shadow-2xl">
           <div className="absolute top-0 right-0 bg-gradient-to-bl from-zinc-500/20 to-transparent w-32 h-32 rounded-bl-full"></div>
           <div className="mb-6 relative z-10">
             <h3 className="text-lg font-bold text-white">Student Pro</h3>
             <div className="mt-2 flex items-baseline gap-1">
               <span className="text-4xl font-bold text-white tracking-tight">100 ETB</span>
               <span className="text-zinc-400 text-sm">/mo</span>
             </div>
             <p className="text-sm text-zinc-400 mt-2">Unlock your full potential.</p>
           </div>
           
           <div className="flex-1 space-y-4 mb-8 relative z-10">
             {['Unlimited downloads', 'Full AI Tutor access', 'Offline mode', 'Priority support'].map((f, i) => (
               <div key={i} className="flex items-center gap-3 text-sm text-zinc-300">
                 <Check size={16} className="text-emerald-500" /> {f}
               </div>
             ))}
           </div>
           
           <button 
             onClick={() => setIsModalOpen(true)}
             className="w-full py-3 bg-white text-zinc-900 font-medium rounded-lg hover:bg-zinc-100 transition-colors relative z-10"
           >
             Upgrade via Telebirr
           </button>
        </div>
      </div>

      {/* Payment Modal using Portal */}
      {isModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col animate-slide-up">
            <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <span className="font-bold text-zinc-900">Subscribe to Pro</span>
              <button onClick={closeModal} className="p-1 text-zinc-400 hover:text-zinc-900 rounded-full hover:bg-zinc-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8">
              {paymentStep === 'scan' && (
                <div className="text-center space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-zinc-900">Pay via Telebirr</h3>
                    <p className="text-sm text-zinc-500">Scan the QR code or use the merchant ID.</p>
                  </div>

                  <div className="w-48 h-48 bg-white border-2 border-zinc-900 rounded-xl mx-auto flex items-center justify-center relative p-2">
                     <div className="w-full h-full bg-zinc-900 pattern-grid-lg flex items-center justify-center text-white text-xs font-mono">
                       [QR CODE PLACEHOLDER]
                     </div>
                  </div>

                  <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-100 text-left space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Merchant ID:</span>
                      <span className="font-mono font-bold text-zinc-900">849201</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Amount:</span>
                      <span className="font-bold text-zinc-900">100 ETB</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => setPaymentStep('verify')}
                    className="w-full py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                  >
                    I have completed payment
                  </button>
                </div>
              )}

              {paymentStep === 'verify' && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-zinc-100 text-zinc-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <ShieldCheck size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-zinc-900">Verify Transaction</h3>
                    <p className="text-sm text-zinc-500">Enter the transaction ID from your SMS.</p>
                  </div>

                  <form onSubmit={handleVerify} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Transaction ID / Reference Number</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. 8H2K92L1"
                        className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 uppercase"
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={!transactionId || isVerifying}
                      className="w-full py-3 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                      {isVerifying && <Loader2 size={16} className="animate-spin" />}
                      {isVerifying ? 'Verifying...' : 'Verify Payment'}
                    </button>
                  </form>
                  
                  <button onClick={() => setPaymentStep('scan')} className="w-full text-sm text-zinc-500 hover:text-zinc-900">
                    Back to QR Code
                  </button>
                </div>
              )}

              {paymentStep === 'success' && (
                <div className="text-center space-y-6">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-fade-in">
                    <Check size={32} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-zinc-900">Payment Successful!</h3>
                    <p className="text-zinc-500">Your account has been upgraded to Student Pro.</p>
                  </div>
                  <button 
                    onClick={handleSuccessContinue}
                    className="w-full py-3 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Subscription;
