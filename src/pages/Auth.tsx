
import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { UserRole } from '../types';
import { GraduationCap, ArrowLeft, Send, Mail, Lock, User, CheckCircle2, Loader2, Star, Eye, EyeOff, MailCheck, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { getPasswordStrength, PasswordStrengthMeter } from '../components/PasswordStrength';

interface AuthProps {
  type: 'login' | 'register';
}

type AuthView = 'login' | 'register' | 'forgot' | 'pending' | 'forgot-sent';

const Auth: React.FC<AuthProps> = ({ type: initialType }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addToast } = useToast();
  const { login, register, user } = useAuth();

  // Local state to handle 'forgot' view without changing URL necessarily
  const [view, setView] = useState<AuthView>(() => {
    // Deep-linkable forgot view: /login?view=forgot survives back/refresh
    if (searchParams.get('view') === 'forgot') return 'forgot';
    return initialType;
  });
  
  // Update view when prop changes (for direct URL navigation)
  React.useEffect(() => {
    if (initialType === 'login' || initialType === 'register') {
      setView(initialType);
    }
  }, [initialType]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Inline form error (persists on screen, unlike toasts)
  const [formError, setFormError] = useState<string | null>(null);
  // Unverified-login recovery: offer resend right where the error appears
  const [showResend, setShowResend] = useState(false);
  // Resend cooldown countdown (seconds remaining)
  const [resendCooldown, setResendCooldown] = useState(0);

  // Google OAuth failure reasons land here as ?error=... — render inline
  // (with retry) instead of a vanishing toast, then clear the param.
  const oauthError = searchParams.get('error');
  const oauthErrorCopy: Record<string, string> = {
    cancelled: 'Google sign-in was cancelled before completing. Please try again.',
    invalid: 'Google sign-in failed. Please try again or use email instead.',
    verify_failed: 'We could not verify your Google account. Please try again.',
  };

  const clearOauthError = () => {
    searchParams.delete('error');
    setSearchParams(searchParams, { replace: true });
  };

  // Resend verification email with a 60s client cooldown (backend also
  // throttles at 3 per 15 min and returns 429 with a clear message).
  const handleResendVerification = async (targetEmail: string) => {
    if (!targetEmail || resendCooldown > 0) return;
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
    try {
      const res = await authAPI.resendVerification(targetEmail);
      addToast(res.message || 'Verification email sent. Please check your inbox (and spam folder).', 'success');
    } catch (error: any) {
      addToast(error.message || 'Could not resend. Please try again later.', 'error');
    }
  };

  // Password strength checker (shared component — same rules on reset page)
  const passwordStrength = password ? getPasswordStrength(password) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError(null);
    setShowResend(false);

    try {
      // FORGOT PASSWORD FLOW — stay on a confirmation panel, keep the email
      if (view === 'forgot') {
        await authAPI.forgotPassword(email);
        setView('forgot-sent');
        return;
      }

      // LOGIN FLOW
      if (view === 'login') {
        const loggedInUser = await login(email, password);
        addToast("Login successful!", "success");

        // Redirect admin to management panel, others to dashboard
        // Check if user is admin (compare as string to avoid type narrowing issues)
        if (loggedInUser && (String(loggedInUser.role) === 'ADMIN' || String(loggedInUser.role) === 'MODERATOR')) {
          navigate('/admin');
        } else {
          navigate('/dashboard');
        }
      }

      // REGISTER FLOW
      else if (view === 'register') {
        if (password !== confirmPassword) {
          setFormError("Passwords do not match. Please try again.");
          setIsLoading(false);
          return;
        }

        if (passwordStrength && passwordStrength.strength === 'weak') {
          setFormError("Password is too weak — use at least 8 characters with a mix of letters and numbers.");
          setIsLoading(false);
          return;
        }

        await register(name, email, password, grade ? Number(grade) : undefined);

        // Registration requires email verification — move to a dedicated
        // pending screen that KEEPS the email (no retyping) and offers resend.
        // Only clear secrets, never the email address.
        setPassword('');
        setConfirmPassword('');
        setView('pending');
      }

    } catch (error: any) {
      console.error('Auth error:', error);
      const message = error.message || "Authentication failed. Please try again.";
      setFormError(message);
      // Unverified account? Offer the fix right here instead of a dead end.
      if (message.toLowerCase().includes('verif')) {
        setShowResend(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) {
      addToast("Google login is not configured. Please use email instead.", "error");
      return;
    }
    setIsGoogleLoading(true);
    try {
      // Redirect to Google OAuth
      window.location.href = `${apiUrl}/auth/google`;
    } catch (error) {
      console.error('Google login error:', error);
      addToast("Failed to initiate Google login. Please try again.", "error");
      setIsGoogleLoading(false);
    }
  };
  const googleLabel = view === 'register' ? 'Sign up with Google' : 'Sign in with Google';

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left Panel: Form */}
      <div className="flex-1 flex flex-col justify-center py-8 sm:py-12 md:py-16 px-4 sm:px-6 md:px-8 lg:px-20 xl:px-24 w-full md:w-1/2 lg:w-1/2 bg-white relative z-10">
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
              {view === 'login' && 'Welcome back'}
              {view === 'register' && 'Create an account'}
              {view === 'forgot' && 'Reset Password'}
              {view === 'pending' && 'Check your inbox'}
              {view === 'forgot-sent' && 'Check your inbox'}
            </h2>
            <p className="mt-2 text-sm sm:text-base text-zinc-500">
              {view === 'login' && 'Please enter your details to sign in.'}
              {view === 'register' && 'Start your learning journey today.'}
              {view === 'forgot' && "Don't worry, we'll send you reset instructions."}
              {view === 'pending' && 'One last step — verify your email to activate your account.'}
              {view === 'forgot-sent' && 'If an account exists for that email, a reset link is on its way.'}
            </p>
          </div>

          <div className="mt-6 sm:mt-8 md:mt-10">
            {view === 'login' && oauthError && oauthErrorCopy[oauthError] && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 leading-relaxed flex items-start gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  {oauthErrorCopy[oauthError]}
                  <button
                    type="button"
                    onClick={clearOauthError}
                    className="ml-2 font-semibold underline hover:text-amber-950"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {(view === 'pending' || view === 'forgot-sent') ? (
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <MailCheck size={28} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {view === 'pending' ? (
                      <>We sent a verification link to <span className="font-bold text-zinc-900 break-all">{email}</span>.<br />Click it to activate your account, then come back and sign in.</>
                    ) : (
                      <>If an account exists for <span className="font-bold text-zinc-900 break-all">{email}</span>, a reset link is on its way — check spam too.</>
                    )}
                  </p>
                </div>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleResendVerification(email)}
                    disabled={resendCooldown > 0}
                    className="w-full py-3 bg-zinc-900 text-white font-medium rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base"
                  >
                    {resendCooldown > 0
                      ? `Resend email in ${resendCooldown}s`
                      : view === 'pending' ? 'Resend verification email' : 'Resend reset email'}
                  </button>
                  {view === 'pending' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { setView('login'); }}
                        className="w-full py-3 bg-white border border-zinc-200 text-zinc-900 font-medium rounded-xl hover:bg-zinc-50 transition-all text-sm sm:text-base"
                      >
                        I've verified — Sign In
                      </button>
                      <button
                        type="button"
                        onClick={() => { setView('register'); }}
                        className="w-full text-sm text-zinc-500 hover:text-zinc-900"
                      >
                        Wrong email? Start over
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setView('login'); }}
                      className="w-full text-center text-sm font-medium text-zinc-500 hover:text-zinc-900 flex items-center justify-center gap-1 transition-colors"
                    >
                      <ArrowLeft size={16} /> Back to Sign In
                    </button>
                  )}
                </div>
              </div>
            ) : (
            <>
            {view !== 'forgot' && (
              <>
                <button
                  onClick={handleGoogleLogin}
                  disabled={isGoogleLoading || isLoading}
                  className="w-full flex items-center justify-center gap-3 bg-white text-zinc-700 border border-zinc-200 font-medium py-3 sm:py-2.5 md:py-3 rounded-xl hover:bg-zinc-50 hover:border-zinc-300 transition-all mb-6 relative group"
                >
                  {isGoogleLoading ? (
                    <Loader2 size={20} className="animate-spin text-zinc-400" />
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      <span className="text-sm">{googleLabel}</span>
                    </>
                  )}
                </button>

                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-white px-2 text-zinc-400">Or continue with</span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 md:space-y-6">
              {view === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5 ml-1">Full Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                      <User size={18} />
                    </div>
                    <input
                      type="text"
                      required
                      className="block w-full pl-10 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all placeholder-zinc-400"
                      placeholder="e.g. Hana Tesfaye"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {view === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5 ml-1">School Grade</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                      <GraduationCap size={18} />
                    </div>
                    <select
                      className="block w-full pl-10 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all text-zinc-700"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                    >
                      <option value="">Select your grade (optional)</option>
                      <option value="9">Grade 9</option>
                      <option value="10">Grade 10</option>
                      <option value="11">Grade 11</option>
                      <option value="12">Grade 12</option>
                    </select>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 ml-1">Used to tailor AI Tutor answers to your level. You can change it later in your profile.</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5 ml-1">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    required
                    className="block w-full pl-10 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all placeholder-zinc-400"
                    placeholder="student@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {view !== 'forgot' && (
                <>
                  <div>
                    <div className="flex justify-between items-center mb-1.5 ml-1">
                      <label className="block text-xs font-semibold text-zinc-700">Password</label>
                      {view === 'login' && (
                        <button 
                          type="button" 
                          onClick={() => setView('forgot')} 
                          className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                        <Lock size={18} />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        className="block w-full pl-10 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all placeholder-zinc-400"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 transition-colors"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {view === 'register' && password && (
                      <PasswordStrengthMeter password={password} />
                    )}
                  </div>

                  {view === 'register' && (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5 ml-1">Confirm Password</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                          <Lock size={18} />
                        </div>
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          required
                          className={`block w-full pl-10 pr-10 py-2.5 bg-zinc-50 border rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/5 transition-all placeholder-zinc-400 ${
                            confirmPassword && password !== confirmPassword
                              ? 'border-red-300 focus:border-red-500'
                              : 'border-zinc-200 focus:border-zinc-900'
                          }`}
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 transition-colors"
                          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        >
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      {confirmPassword && password !== confirmPassword && (
                        <p className="mt-1 text-xs text-red-600 ml-1">Passwords do not match</p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Inline error box (persists; toasts disappear) */}
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 leading-relaxed">
                  {formError}
                  {showResend && (
                    <button
                      type="button"
                      onClick={() => handleResendVerification(email)}
                      disabled={resendCooldown > 0}
                      className="mt-2 w-full py-2 bg-white border border-red-200 text-red-800 font-medium rounded-lg hover:bg-red-100/50 disabled:opacity-50 transition-all text-sm"
                    >
                      {resendCooldown > 0 ? `Resend email in ${resendCooldown}s` : 'Resend verification email'}
                    </button>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || isGoogleLoading}
                className="w-full flex justify-center items-center gap-2 py-3.5 sm:py-3 md:py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm md:text-base font-medium text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 disabled:opacity-70 disabled:cursor-not-allowed transition-all mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    {view === 'login' ? 'Signing in…' : view === 'register' ? 'Creating account…' : 'Sending…'}
                  </>
                ) : (
                  view === 'login' ? 'Sign In' : view === 'register' ? 'Create Account' : 'Send Reset Link'
                )}
              </button>
              {view === 'register' && (
                <p className="text-center text-xs text-zinc-400 leading-relaxed">
                  By creating an account you agree to our{' '}
                  <Link to="/terms-of-service" className="underline hover:text-zinc-700">Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/privacy-policy" className="underline hover:text-zinc-700">Privacy Policy</Link>.
                </p>
              )}
            </form>
            </>)}

            {(view === 'login' || view === 'register' || view === 'forgot') && (
            <div className="mt-6">
              {view === 'login' ? (
                <p className="text-center text-sm text-zinc-500">
                  Don't have an account?{' '}
                  <button onClick={() => { setView('register'); navigate('/register'); }} className="font-semibold text-zinc-900 hover:underline">
                    Sign up
                  </button>
                </p>
              ) : view === 'register' ? (
                <p className="text-center text-sm text-zinc-500">
                  Already have an account?{' '}
                  <button onClick={() => { setView('login'); navigate('/login'); }} className="font-semibold text-zinc-900 hover:underline">
                    Sign in
                  </button>
                </p>
              ) : (
                <button 
                  onClick={() => setView('login')}
                  className="w-full text-center text-sm font-medium text-zinc-500 hover:text-zinc-900 flex items-center justify-center gap-1 transition-colors"
                >
                  <ArrowLeft size={16} /> Back to Sign In
                </button>
              )}
            </div>
            )}

            {/* Mobile Testimonial */}
            <div className="mt-6 sm:mt-8 lg:hidden p-4 bg-zinc-900 text-white rounded-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/20 rounded-full blur-2xl -mr-4 -mt-4"></div>
               <div className="relative z-10">
                  <div className="flex gap-1 mb-3">
                     {[1,2,3,4,5].map(i => <Star key={i} size={12} className="fill-amber-400 text-amber-400" />)}
                  </div>
                  <blockquote className="text-sm font-medium leading-relaxed mb-4">
                    "This platform completely changed how I study. The AI tutor explains complex physics concepts in a way that actually makes sense."
                  </blockquote>
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center font-bold text-sm backdrop-blur-sm border border-white/20">
                        S
                     </div>
                     <div>
                        <div className="font-bold text-xs">Samuel K.</div>
                        <div className="text-zinc-400 text-xs">Grade 12 Student</div>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: Visual & Testimonial */}
      <div className="hidden md:block relative w-0 flex-1 bg-zinc-900 overflow-hidden">
        {/* Abstract Background Pattern */}
        <div className="absolute inset-0 opacity-20">
            <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
               <path d="M0 100 C 20 0 50 0 100 100 Z" fill="none" stroke="white" strokeWidth="0.5" />
               <path d="M0 100 C 50 0 80 0 100 100 Z" fill="none" stroke="white" strokeWidth="0.5" opacity="0.5" />
            </svg>
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/30 rounded-full blur-[100px] -mr-20 -mt-20"></div>
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[100px] -ml-20 -mb-20"></div>
        </div>

        <div className="absolute inset-0 flex flex-col justify-center items-center p-6 md:p-8 lg:p-12 text-white z-10">
           <div className="max-w-md md:max-w-lg space-y-6 md:space-y-8">
              <div className="space-y-2">
                 <div className="flex gap-1 mb-3 md:mb-4">
                    {[1,2,3,4,5].map(i => <Star key={i} size={18} className="md:w-5 md:h-5 fill-amber-400 text-amber-400" />)}
                 </div>
                 <blockquote className="text-lg md:text-xl lg:text-2xl font-medium leading-relaxed">
                   "This platform completely changed how I study. The AI tutor explains complex physics concepts in a way that actually makes sense."
                 </blockquote>
              </div>
              
              <div className="flex items-center gap-3 md:gap-4">
                 <div className="w-10 h-10 md:w-12 md:h-12 bg-white/10 rounded-full flex items-center justify-center font-bold text-base md:text-lg backdrop-blur-sm border border-white/20">
                    S
                 </div>
                 <div>
                    <div className="font-bold text-sm md:text-base">Samuel K.</div>
                    <div className="text-zinc-400 text-xs md:text-sm">Grade 12 Student • Addis Ababa</div>
                 </div>
              </div>

              <div className="pt-6 md:pt-8 border-t border-white/10 flex gap-6 md:gap-8">
                 <div>
                    <div className="text-2xl md:text-3xl font-bold">10k+</div>
                    <div className="text-zinc-400 text-xs md:text-sm">Active Students</div>
                 </div>
                 <div>
                    <div className="text-2xl md:text-3xl font-bold">5k+</div>
                    <div className="text-zinc-400 text-xs md:text-sm">Learning Resources</div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
