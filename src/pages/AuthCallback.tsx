import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCap, CheckCircle2 } from 'lucide-react';
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
            navigate('/dashboard', { replace: true });
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
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 mb-2">
          Completing Google Sign-in...
        </h2>
        <p className="text-zinc-500">
          Please wait while we verify your account.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="bg-zinc-900 w-12 h-12 rounded-xl flex items-center justify-center">
            <GraduationCap className="text-white" size={24} />
          </div>
          <span className="font-bold text-xl text-zinc-900">SmartStudy</span>
        </div>

        {/* Loading State */}
        <div className="mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="text-blue-600" size={32} />
          </div>
          <h2 className="text-xl font-semibold text-zinc-900 mb-2">
            Signing you in...
          </h2>
          <p className="text-zinc-500">
            Please wait while we complete your Google sign-in.
          </p>
        </div>

        {/* Loading Spinner */}
        <div className="flex justify-center">
          <div className="w-6 h-6 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
