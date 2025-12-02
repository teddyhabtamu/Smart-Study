
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserRole } from '../types';
import { GraduationCap, Info, ArrowLeft, Send, Mail, Lock, User, CheckCircle2, Loader2, Star } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface AuthProps {
  onLogin: (user: any) => void;
  type: 'login' | 'register';
}

const Auth: React.FC<AuthProps> = ({ onLogin, type: initialType }) => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  
  // Local state to handle 'forgot' view without changing URL necessarily
  const [view, setView] = useState<'login' | 'register' | 'forgot'>(initialType);
  
  // Update view when prop changes (for direct URL navigation)
  React.useEffect(() => {
    if (initialType === 'login' || initialType === 'register') {
      setView(initialType);
    }
  }, [initialType]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      // FORGOT PASSWORD FLOW
      if (view === 'forgot') {
        setIsLoading(false);
        addToast("Password reset link sent to your email.", "success");
        setView('login');
        return;
      }

      // LOGIN / REGISTER FLOW
      let role = UserRole.STUDENT;
      if (email.toLowerCase().includes('admin')) {
        role = UserRole.ADMIN;
      }

      const mockUser = {
        id: '123',
        name: name || (role === UserRole.ADMIN ? 'Admin User' : 'Student User'),
        email,
        role: role,
        isPremium: role === UserRole.ADMIN,
        bookmarks: [],
        avatar: undefined,
        preferences: { emailNotifications: true, studyReminders: true },
        xp: 0,
        level: 1,
        streak: 1,
        lastActiveDate: new Date().toISOString().split('T')[0],
        unlockedBadges: ['b1'],
        notifications: [
             {
                id: 'n1',
                title: 'Welcome to SmartStudy!',
                message: 'We are glad to have you here. Start learning!',
                type: 'success',
                isRead: false,
                date: new Date().toISOString()
             }
        ]
      };
      
      onLogin(mockUser);
      setIsLoading(false);
      
      // Redirect based on role
      if (role === UserRole.ADMIN) {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    }, 1000);
  };

  const handleGoogleLogin = () => {
    setIsGoogleLoading(true);
    // Simulate Google Auth Delay
    setTimeout(() => {
      const mockGoogleUser = {
        id: 'g_' + Math.random().toString(36).substr(2, 9),
        name: 'Google User',
        email: 'google_user@gmail.com',
        role: UserRole.STUDENT,
        isPremium: false,
        bookmarks: [],
        avatar: undefined,
        preferences: { emailNotifications: true, studyReminders: true },
        xp: 500, // Bonus for social login demo
        level: 1,
        streak: 1,
        lastActiveDate: new Date().toISOString().split('T')[0],
        unlockedBadges: ['b1'],
        notifications: [
             {
                id: 'n1',
                title: 'Welcome to SmartStudy!',
                message: 'We are glad to have you here. Start learning!',
                type: 'success',
                isRead: false,
                date: new Date().toISOString()
             }
        ]
      };
      
      onLogin(mockGoogleUser);
      setIsGoogleLoading(false);
      navigate('/dashboard');
    }, 1500);
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left Panel: Form */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24 w-full lg:w-1/2 bg-white relative z-10">
        <div className="mx-auto w-full max-w-sm lg:w-96 animate-fade-in">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-10">
            <div className="bg-zinc-900 w-8 h-8 rounded-lg flex items-center justify-center">
              <GraduationCap className="text-white" size={16} />
            </div>
            <span className="font-bold text-lg text-zinc-900">SmartStudy</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
              {view === 'login' && 'Welcome back'}
              {view === 'register' && 'Create an account'}
              {view === 'forgot' && 'Reset Password'}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              {view === 'login' && 'Please enter your details to sign in.'}
              {view === 'register' && 'Start your learning journey today.'}
              {view === 'forgot' && "Don't worry, we'll send you reset instructions."}
            </p>
          </div>

          <div className="mt-8">
            {view !== 'forgot' && (
              <>
                <button
                  onClick={handleGoogleLogin}
                  disabled={isGoogleLoading || isLoading}
                  className="w-full flex items-center justify-center gap-3 bg-white text-zinc-700 border border-zinc-200 font-medium py-2.5 rounded-xl hover:bg-zinc-50 hover:border-zinc-300 transition-all mb-6 relative group"
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
                      <span className="text-sm">Sign in with Google</span>
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

            <form onSubmit={handleSubmit} className="space-y-5">
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
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
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
                      type="password"
                      required
                      className="block w-full pl-10 pr-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all placeholder-zinc-400"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || isGoogleLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-zinc-900 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 disabled:opacity-70 disabled:cursor-not-allowed transition-all mt-2"
              >
                {isLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  view === 'login' ? 'Sign In' : view === 'register' ? 'Create Account' : 'Send Reset Link'
                )}
              </button>
            </form>

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

            {/* Demo Hint */}
            <div className="mt-8 p-3 bg-zinc-50 border border-zinc-100 rounded-lg flex gap-3 text-xs text-zinc-500">
               <Info size={16} className="text-zinc-400 flex-shrink-0 mt-0.5" />
               <p>
                 <span className="font-semibold text-zinc-700 block mb-0.5">Demo Access:</span> 
                 Use any email to sign in. Include <span className="font-mono bg-zinc-200 px-1 rounded text-zinc-800">admin</span> in the email to access the Admin Dashboard.
               </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel: Visual & Testimonial */}
      <div className="hidden lg:block relative w-0 flex-1 bg-zinc-900 overflow-hidden">
        {/* Abstract Background Pattern */}
        <div className="absolute inset-0 opacity-20">
            <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
               <path d="M0 100 C 20 0 50 0 100 100 Z" fill="none" stroke="white" strokeWidth="0.5" />
               <path d="M0 100 C 50 0 80 0 100 100 Z" fill="none" stroke="white" strokeWidth="0.5" opacity="0.5" />
            </svg>
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/30 rounded-full blur-[100px] -mr-20 -mt-20"></div>
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[100px] -ml-20 -mb-20"></div>
        </div>

        <div className="absolute inset-0 flex flex-col justify-center items-center p-12 text-white z-10">
           <div className="max-w-md space-y-8">
              <div className="space-y-2">
                 <div className="flex gap-1 mb-4">
                    {[1,2,3,4,5].map(i => <Star key={i} size={20} className="fill-amber-400 text-amber-400" />)}
                 </div>
                 <blockquote className="text-2xl font-medium leading-relaxed">
                   "This platform completely changed how I study. The AI tutor explains complex physics concepts in a way that actually makes sense."
                 </blockquote>
              </div>
              
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center font-bold text-lg backdrop-blur-sm border border-white/20">
                    S
                 </div>
                 <div>
                    <div className="font-bold">Samuel K.</div>
                    <div className="text-zinc-400 text-sm">Grade 12 Student • Addis Ababa</div>
                 </div>
              </div>

              <div className="pt-8 border-t border-white/10 flex gap-8">
                 <div>
                    <div className="text-3xl font-bold">10k+</div>
                    <div className="text-zinc-400 text-sm">Active Students</div>
                 </div>
                 <div>
                    <div className="text-3xl font-bold">5k+</div>
                    <div className="text-zinc-400 text-sm">Learning Resources</div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
