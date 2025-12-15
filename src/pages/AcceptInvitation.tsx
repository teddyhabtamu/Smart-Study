import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCap, Lock, CheckCircle2, Loader2, AlertCircle, Crown, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const AcceptInvitation: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      setError('Invalid or missing invitation token');
    } else {
      setToken(tokenParam);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Invalid invitation token');
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
      const result = await authAPI.acceptInvitation(token, password);
      setIsSuccess(true);
      
      // Store token
      localStorage.setItem('auth_token', result.token);
      
      // The API returns snake_case, but login method handles transformation
      // Pass the raw user object (as any) to login, which will transform it
      const rawUser = result.user as any;
      
      // Use login method to set user (it accepts User object and handles transformation)
      await login(rawUser);
      
      addToast('Invitation accepted! Your account has been activated.', 'success');
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (error: any) {
      console.error('Accept invitation error:', error);
      setError(error.message || 'Failed to accept invitation. The link may have expired.');
      addToast(error.message || 'Failed to accept invitation', 'error');
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
          <h2 className="text-2xl font-bold text-zinc-900 mb-2">Invitation Accepted!</h2>
          <p className="text-zinc-600 mb-6">Your admin account has been activated. Redirecting to dashboard...</p>
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
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-6 h-6 text-amber-500" />
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-zinc-900">
                Accept Admin Invitation
              </h2>
            </div>
            <p className="text-sm sm:text-base text-zinc-500">
              You've been invited to join the SmartStudy admin team. Set your password to get started.
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
                Set Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-10 py-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all text-zinc-900 placeholder-zinc-400"
                  placeholder="Enter your password"
                  disabled={isLoading || !token}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={isLoading || !token}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
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
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-10 py-3 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all text-zinc-900 placeholder-zinc-400"
                  placeholder="Confirm your password"
                  disabled={isLoading || !token}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  disabled={isLoading || !token}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
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
                  Accepting Invitation...
                </>
              ) : (
                'Accept Invitation'
              )}
            </button>

            <div className="text-center">
              <p className="text-xs text-zinc-500">
                This invitation will expire in 7 days. If you have questions, contact support.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AcceptInvitation;

