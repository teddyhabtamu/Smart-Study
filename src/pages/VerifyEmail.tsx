import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCap, CheckCircle2, Loader2, AlertCircle, Mail } from 'lucide-react';
import { authAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      setError('Invalid or missing verification token. Please check your email link.');
      setIsLoading(false);
    } else {
      verifyEmail(tokenParam);
    }
  }, [searchParams]);

  const handleResend = async () => {
    if (!resendEmail.trim() || resendCooldown > 0) return;
    setIsResending(true);
    try {
      const res = await authAPI.resendVerification(resendEmail.trim());
      addToast(res.message || 'Verification email sent. Check your inbox (and spam).', 'success');
      setResendCooldown(60);
      const timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      addToast(err.message || 'Could not resend. Please try again later.', 'error');
    } finally {
      setIsResending(false);
    }
  };

  const verifyEmail = async (verificationToken: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await authAPI.verifyEmail(verificationToken);
      
      if (response.success && response.user && response.token) {
        setIsSuccess(true);
        
        // Store token
        localStorage.setItem('auth_token', response.token);
        
        // Login the user
        await login(response.user);
        
        addToast('Email verified successfully! Welcome to SmartStudy!', 'success');
        
        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      } else {
        setError(response.message || 'Failed to verify email');
        addToast(response.message || 'Failed to verify email', 'error');
      }
    } catch (error: any) {
      console.error('Verify email error:', error);
      const errorMessage = error.message || 'Failed to verify email. The link may have expired.';
      setError(errorMessage);
      addToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-2">Email Verified Successfully!</h2>
          <p className="text-zinc-600 mb-6">Your email has been verified. Welcome to SmartStudy!</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 px-4 rounded-xl text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-all"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-white">
      <div className="flex-1 flex flex-col justify-center py-8 sm:py-12 md:py-16 px-4 sm:px-6 md:px-8 lg:px-20 xl:px-24 w-full md:w-1/2 lg:w-1/2 bg-white relative z-10 mx-auto">
        <div className="mx-auto w-full max-w-sm md:max-w-md lg:max-w-lg xl:w-96 animate-fade-in">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-6 sm:mb-8 md:mb-10">
            <div className="bg-zinc-900 w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center">
              <GraduationCap className="text-white sm:w-4 sm:h-4 md:w-5 md:h-5" size={14} />
            </div>
            <span className="font-bold text-base sm:text-lg md:text-xl text-zinc-900">SmartStudy</span>
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 mb-2">
              Verify Your Email
            </h2>
            <p className="text-sm sm:text-base text-zinc-500">
              {isLoading ? 'Verifying your email address...' : 'Please wait while we verify your email address.'}
            </p>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800 font-medium mb-1">Verification Failed</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {isLoading && !error && (
            <div className="mt-6 flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-zinc-900 animate-spin mb-4" />
              <p className="text-sm text-zinc-600">Verifying your email...</p>
            </div>
          )}

          {!isLoading && error && (
            <div className="mt-6 space-y-4">
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-zinc-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-900 mb-1">Need a new verification email?</p>
                    <p className="text-xs text-zinc-600 mb-3">
                      Links expire after 24 hours. Enter your account email below and we'll send a fresh one.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        className="flex-1 min-w-0 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-zinc-900 placeholder-zinc-400"
                      />
                      <button
                        onClick={handleResend}
                        disabled={isResending || resendCooldown > 0 || !resendEmail.trim()}
                        className="px-3 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                      >
                        {isResending ? 'Sending…' : resendCooldown > 0 ? `${resendCooldown}s` : 'Resend'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <button
                  onClick={() => navigate('/login')}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 transition-all"
                >
                  Back to Login
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
