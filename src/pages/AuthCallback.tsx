import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GraduationCap, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const { addToast } = useToast();

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get('token');
      const success = searchParams.get('success');

      if (success === 'true' && token) {
        try {
          // Store the token temporarily and verify it
          localStorage.setItem('auth_token', token);

          // Verify the token by calling the API
          const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/verify`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
              // Refresh user data in auth context
              await refreshUser();
              addToast("Successfully signed in with Google!", "success");

              // Redirect to dashboard
              setTimeout(() => {
                navigate('/dashboard');
              }, 2000);
            } else {
              throw new Error('Invalid user data');
            }
          } else {
            throw new Error('Token verification failed');
          }
        } catch (error) {
          console.error('Auth callback error:', error);
          addToast("Failed to complete Google sign-in. Please try again.", "error");
          setTimeout(() => {
            navigate('/login');
          }, 2000);
        }
      } else {
        // Handle error case
        addToast("Google sign-in failed. Please try again.", "error");
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    };

    handleCallback();
  }, [searchParams, refreshUser, addToast, navigate]);

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
