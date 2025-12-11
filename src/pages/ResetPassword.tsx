import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCap, Lock, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { authAPI } from '../services/api';
import { useToast } from '../context/ToastContext';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      setError('Invalid or missing reset token');
    } else {
      setToken(tokenParam);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Invalid reset token');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      await authAPI.resetPassword(token, password);
      setIsSuccess(true);
      addToast('Password reset successfully! You can now login with your new password.', 'success');
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (error: any) {
      console.error('Reset password error:', error);
      setError(error.message || 'Failed to reset password. The link may have expired.');
      addToast(error.message || 'Failed to reset password', 'error');
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
          <h2 className="text-2xl font-bold text-zinc-900 mb-2">Password Reset Successful!</h2>
          <p className="text-zinc-600 mb-6">Your password has been reset. Redirecting to login...</p>
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
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-zinc-900">
              Reset Your Password
            </h2>
            <p className="mt-2 text-sm sm:text-base text-zinc-500">
              Enter your new password below.
            </p>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 sm:mt-8 md:mt-10 space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-2">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all text-zinc-900 placeholder-zinc-400"
                  placeholder="Enter new password"
                  disabled={isLoading || !token}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-500">Must be at least 6 characters</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-700 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all text-zinc-900 placeholder-zinc-400"
                  placeholder="Confirm new password"
                  disabled={isLoading || !token}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !token || password.length < 6 || password !== confirmPassword}
              className="w-full bg-zinc-900 text-white font-medium py-3 rounded-xl hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Resetting Password...
                </>
              ) : (
                'Reset Password'
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

