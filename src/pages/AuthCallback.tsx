import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCap, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authAPI } from '../services/api';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const { addToast } = useToast();

  useEffect(() => {
    const token = searchParams.get('token');
    const success = searchParams.get('success');

    if (success === 'true' && token) {
      // Save token
      localStorage.setItem('auth_token', token);

      // Verify user
      authAPI.verify().then(response => {
        if (response?.user) {
          login(response.user).then(() => {
            // Redirect admin to management panel, others to dashboard
            if (response.user.role === 'ADMIN') {
              navigate('/admin', { replace: true });
            } else {
              navigate('/dashboard', { replace: true });
            }
          }).catch(err => {
            console.error('Login error:', err);
            addToast("Login failed", "error");
            navigate('/login');
          });
        } else {
          addToast("Login failed", "error");
          navigate('/login');
        }
      }).catch(error => {
        console.error('Verify error:', error);
        addToast("Login failed", "error");
        navigate('/login');
      });
    } else {
      addToast("Login failed", "error");
      navigate('/login');
    }
  }, [searchParams, login, addToast, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 sm:p-10 text-center animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="bg-zinc-900 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center">
            <GraduationCap className="text-white" size={20} />
          </div>
          <span className="font-bold text-xl sm:text-2xl text-zinc-900">SmartStudy</span>
        </div>

        {/* Loading Spinner */}
        <div className="mb-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-600 animate-spin" />
          </div>
          
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-2 tracking-tight">
            Completing Google Sign-in...
          </h2>
          <p className="text-sm sm:text-base text-zinc-500 font-light">
            Please wait while we verify your account.
          </p>
        </div>

        {/* Subtle progress indicator */}
        <div className="mt-8 pt-6 border-t border-zinc-100">
          <div className="flex items-center justify-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
