import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authAPI } from '../services/api';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const { addToast } = useToast();
  // Single-use tokens: the effect re-fires when `login` identity changes
  // (AuthProvider re-renders), which would re-verify / re-burn the token.
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const token = searchParams.get('token');
    const refreshToken = searchParams.get('refreshToken');
    const success = searchParams.get('success');
    const incomingError = searchParams.get('error');
    const incomingStatus = searchParams.get('status');

    // Scrub secrets from the URL immediately: JWTs in the query string
    // persist in history, logs and Referer headers. All navigations below
    // use replace:true so the token URL never survives in history.
    window.history.replaceState(null, '', window.location.pathname);

    const fail = (reason: 'cancelled' | 'invalid' | 'verify_failed') => {
      // Dead tokens must not linger: the next boot would retry them first,
      // delaying the login screen with a doomed verify.
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      // Pass the reason to login so it renders inline (toasts disappear)
      navigate(`/login?error=${reason}`, { replace: true });
    };

    if (success === 'true') {
      if (!token) {
        // Backend claimed success but sent no token — a backend glitch, not
        // a user cancellation (previously mislabeled as 'cancelled').
        fail('verify_failed');
        return;
      }
      // Save tokens
      localStorage.setItem('auth_token', token);
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
      }

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
            fail('verify_failed');
          });
        } else {
          fail('verify_failed');
        }
      }).catch(error => {
        console.error('Verify error:', error);
        fail('verify_failed');
      });
    } else if (incomingError) {
      // Backend rejected (e.g. banned account) — forward its code + status
      // instead of collapsing everything to generic 'invalid', so the login
      // page can render the specific message it already supports.
      const qp = new URLSearchParams({ error: incomingError });
      if (incomingStatus) qp.set('status', incomingStatus);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      navigate(`/login?${qp.toString()}`, { replace: true });
    } else {
      // User cancelled at Google, or no token returned
      fail('cancelled');
    }
  }, [searchParams, login, navigate]);

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
      <p className="text-sm sm:text-base text-ink font-semibold tracking-wide" role="status">
        Signing you in with Google…
      </p>
      <p className="text-xs sm:text-sm text-zinc-400 font-medium tracking-wide mt-1">
        Please keep this page open — it only takes a moment.
      </p>
    </div>
  );
};

export default AuthCallback;
