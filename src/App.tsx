
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import Loader from './components/Loader';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { UserRole } from './types';
import { PublicRoute } from './components/PublicRoute';
import PolicyUpdateNotification from './components/PolicyUpdateNotification';

// Route-level code splitting: each page loads on demand instead of one
// 1.1MB bundle. Landing + auth stay lean; heavy pages (Admin 3.5k lines,
// AITutor + markdown/katex, Planner, Practice) split into own chunks.
const Landing = lazy(() => import('./pages/Landing'));
const Library = lazy(() => import('./pages/Library'));
const PastExams = lazy(() => import('./pages/PastExams'));
const DocumentView = lazy(() => import('./pages/DocumentView'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Auth = lazy(() => import('./pages/Auth'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'));
const Subscription = lazy(() => import('./pages/Subscription'));
const Admin = lazy(() => import('./pages/Admin'));
const AITutor = lazy(() => import('./pages/AITutor'));
const Profile = lazy(() => import('./pages/Profile'));
const VideoLibrary = lazy(() => import('./pages/VideoLibrary'));
const VideoWatch = lazy(() => import('./pages/VideoWatch'));
const Community = lazy(() => import('./pages/Community'));
const CommunityPost = lazy(() => import('./pages/CommunityPost'));
const Planner = lazy(() => import('./pages/Planner'));
const Practice = lazy(() => import('./pages/Practice'));
const About = lazy(() => import('./pages/About'));
const Careers = lazy(() => import('./pages/Careers'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Auth gate that preserves the return URL: expired sessions (and direct
// hits to protected pages) land on /login?next=<path> instead of losing
// the user's place with no explanation.
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <Loader />;
  if (!user) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
};

// Listens for the api layer's session-expired broadcast (refresh definitively
// rejected): one toast + redirect with return URL. Throttled + loop-guarded
// (a burst of 401s must not stack toasts or bounce off the login page).
let lastExpiredToast = 0;
const SessionExpiredHandler: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  React.useEffect(() => {
    const onExpired = () => {
      const now = Date.now();
      if (now - lastExpiredToast < 60_000) return;
      lastExpiredToast = now;
      const path = window.location.pathname;
      if (!path.startsWith('/login') && !path.startsWith('/register')) {
        addToast('Your session expired — please sign in again.', 'warning');
        const next = path + window.location.search;
        navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
      }
    };
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, [navigate, addToast]);
  return null;
};

// Admin route guard component
const AdminRouteGuard: React.FC = () => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Wait for auth to load
  if (isLoading) {
    return <Loader />;
  }

  // Handle both enum and string role values
  const userRole = user?.role;
  // Convert both to strings for comparison to handle enum/string mismatch
  const userRoleStr = String(userRole || '').toUpperCase();
  const isAdmin = userRoleStr === 'ADMIN' || userRole === UserRole.ADMIN;
  const isModerator = userRoleStr === 'MODERATOR' || userRole === UserRole.MODERATOR;
  const hasAccess = isAdmin || isModerator;

  if (!hasAccess) {
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <Admin />;
};

const App: React.FC = () => {
  const { user, login, updateUser, isLoading } = useAuth();

  if (isLoading) {
    return <Loader />;
  }

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PolicyUpdateNotification />
      <SessionExpiredHandler />
      <Suspense fallback={<Loader />}>
      <Routes>
        {/* RESET PASSWORD - MUST be first, no authentication required, no Layout wrapper */}
        <Route
          path="/reset-password"
          element={<PublicRoute><ResetPassword /></PublicRoute>}
        />
        <Route
          path="/verify-email"
          element={<PublicRoute><VerifyEmail /></PublicRoute>}
        />
        <Route path="/login" element={<PublicRoute><Auth type="login" /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Auth type="register" /></PublicRoute>} />
        <Route path="/auth/callback" element={<PublicRoute><AuthCallback /></PublicRoute>} />
        <Route path="/accept-invitation" element={<PublicRoute><AcceptInvitation /></PublicRoute>} />

        <Route path="/library" element={<Layout><Library /></Layout>} />
        <Route path="/past-exams" element={<Layout><PastExams /></Layout>} />
        <Route path="/past-exam" element={<Layout><PastExams /></Layout>} />
        <Route path="/document/:id" element={<Layout><DocumentView /></Layout>} />

        <Route path="/videos" element={<Layout><VideoLibrary /></Layout>} />
        <Route path="/video/:id" element={<Layout><VideoWatch /></Layout>} />

        <Route path="/ai-tutor" element={<Layout><AITutor /></Layout>} />

        {/* Protected Planner Route */}
        <Route
          path="/planner"
          element={<Layout><RequireAuth><Planner /></RequireAuth></Layout>}
        />

        <Route path="/practice" element={<Layout><Practice /></Layout>} />

        <Route path="/community" element={<Layout><Community /></Layout>} />
        <Route path="/community/:id" element={<Layout><CommunityPost /></Layout>} />

        <Route
          path="/subscription"
          element={
            <Layout>
              <RequireAuth>
                <Subscription />
              </RequireAuth>
            </Layout>
          }
        />

        {/* Static Pages */}
        <Route path="/about" element={<Layout><About /></Layout>} />
        <Route path="/careers" element={<Layout><Careers /></Layout>} />
        <Route path="/privacy-policy" element={<Layout><PrivacyPolicy /></Layout>} />
        <Route path="/terms-of-service" element={<Layout><TermsOfService /></Layout>} />

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={<Layout><RequireAuth><Dashboard /></RequireAuth></Layout>}
        />
        <Route
          path="/admin"
          element={
            <Layout>
              <AdminRouteGuard />
            </Layout>
          }
        />
        <Route
          path="/profile"
          element={<Layout><RequireAuth><Profile /></RequireAuth></Layout>}
        />

        {/* ROOT ROUTE - MUST BE LAST (index route for exact / only) */}
        <Route
          index
          element={
            <Layout>
              {user ? (
                (() => {
                  const userRole = user.role;
                  const userRoleStr = String(userRole || '').toUpperCase();
                  const isAdmin = userRoleStr === 'ADMIN' || userRole === UserRole.ADMIN;
                  const isModerator = userRoleStr === 'MODERATOR' || userRole === UserRole.MODERATOR;
                  return (isAdmin || isModerator) ? <Navigate to="/admin" replace /> : <Navigate to="/dashboard" replace />;
                })()
              ) : <Landing />}
            </Layout>
          }
        />

        {/* 404 Page - MUST BE LAST */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </Router>
  );
};

export default App;
