import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
            if (response.user.role === 'ADMIN' || response.user.role === 'MODERATOR') {
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="relative h-[12px] w-[48px] flex items-center justify-center mb-4">
        {/* Background gradients */}
        <div 
          className="absolute inset-0"
          style={{
            background: 'no-repeat radial-gradient(farthest-side, #000 90%, transparent) left, no-repeat radial-gradient(farthest-side, #000 90%, transparent) right',
            backgroundSize: '25% 100%',
          }}
        />
        
        {/* First circle - rotates clockwise */}
        <div 
          className="absolute h-[12px] w-[12px] rounded-full bg-zinc-900"
          style={{
            transformOrigin: '-100% 50%',
            animation: 'loaderRotate 1s infinite linear',
          }}
        />
        
        {/* Second circle - rotates counter-clockwise with delay */}
        <div 
          className="absolute h-[12px] w-[12px] rounded-full bg-zinc-900"
          style={{
            transformOrigin: '200% 50%',
            animation: 'loaderRotateReverse 1s infinite linear -0.5s',
          }}
        />
      </div>
      
      {/* SmartStudy Text */}
      <p className="text-sm sm:text-base text-zinc-400 font-medium tracking-wide">
        SmartStudy
      </p>
    </div>
  );
};

export default AuthCallback;
