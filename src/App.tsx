
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Loader from './components/Loader';
import { useAuth } from './context/AuthContext';
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
          element={<Layout>{user ? <Planner /> : <Navigate to="/login" />}</Layout>}
        />

        <Route path="/practice" element={<Layout><Practice /></Layout>} />

        <Route path="/community" element={<Layout><Community /></Layout>} />
        <Route path="/community/:id" element={<Layout><CommunityPost /></Layout>} />

        <Route
          path="/subscription"
          element={
            <Layout>
              {user ? (
                <Subscription onUpgrade={() => updateUser({ isPremium: true })} />
              ) : (
                <Navigate to="/login" />
              )}
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
          element={<Layout>{user ? <Dashboard /> : <Navigate to="/login" />}</Layout>}
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
          element={<Layout>{user ? <Profile /> : <Navigate to="/login" />}</Layout>}
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
