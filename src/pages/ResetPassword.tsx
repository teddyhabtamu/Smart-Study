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
      setError('Invalid or missing reset token. Please check your email link.');
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
      addToast('Password reset successful! You can now sign in with your new password.', 'success');
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to reset password. The link may have expired.';
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
          <h2 className="text-2xl font-bold text-zinc-900 mb-2">Password Reset Successful!</h2>
          <p className="text-zinc-600 mb-6">Your password has been updated. Redirecting to login...</p>
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
              Reset Your Password
            </h2>
            <p className="text-sm sm:text-base text-zinc-500">
              Enter your new password below to complete the reset process.
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
              <label htmlFor="password" className="block text-xs font-semibold text-zinc-700 mb-1.5 ml-1">
                New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                  <Lock size={18} />
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="block w-full pl-10 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all placeholder-zinc-400"
                  placeholder="Enter your new password"
                  disabled={isLoading || !token}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-500 ml-1">Must be at least 6 characters</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-semibold text-zinc-700 mb-1.5 ml-1">
                Confirm New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                  <Lock size={18} />
                </div>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className={`block w-full pl-10 pr-3 py-2.5 bg-zinc-50 border rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/5 transition-all placeholder-zinc-400 ${
                    confirmPassword && password !== confirmPassword
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-zinc-200 focus:border-zinc-900'
                  }`}
                  placeholder="Confirm your new password"
                  disabled={isLoading || !token}
                />
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-xs text-red-600 ml-1">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !token || password.length < 6 || password !== confirmPassword}
              className="w-full flex justify-center py-3.5 sm:py-3 md:py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm md:text-base font-medium text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 disabled:opacity-70 disabled:cursor-not-allowed transition-all mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin mr-2" />
                  Resetting Password...
                </>
              ) : (
                'Reset Password'
              )}
            </button>

            <div className="text-center">
              <p className="text-xs text-zinc-500">
                Remember your password?{' '}
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="font-semibold text-zinc-900 hover:underline"
                >
                  Sign in
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
