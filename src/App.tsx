
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Library from './pages/Library';
import DocumentView from './pages/DocumentView';
import Dashboard from './pages/Dashboard';
import Auth from './pages/Auth';
import AuthCallback from './pages/AuthCallback';
import ResetPassword from './pages/ResetPassword';
import AcceptInvitation from './pages/AcceptInvitation';
import Subscription from './pages/Subscription';
import Admin from './pages/Admin';
import AITutor from './pages/AITutor';
import Profile from './pages/Profile';
import VideoLibrary from './pages/VideoLibrary';
import VideoWatch from './pages/VideoWatch';
import Community from './pages/Community';
import CommunityPost from './pages/CommunityPost';
import Planner from './pages/Planner';
import Practice from './pages/Practice';
import About from './pages/About';
import Careers from './pages/Careers';
import NotFound from './pages/NotFound';
import Loader from './components/Loader';
import { useAuth } from './context/AuthContext';
import { UserRole } from './types';
import { PublicRoute } from './components/PublicRoute';

const App: React.FC = () => {
  const { user, login, updateUser, isLoading } = useAuth();

  if (isLoading) {
    return <Loader />;
  }

  return (
    <Router>
      <Routes>
        {/* RESET PASSWORD - MUST be first, no authentication required, no Layout wrapper */}
        <Route
          path="/reset-password"
          element={<PublicRoute><ResetPassword /></PublicRoute>}
        />
        <Route path="/login" element={<PublicRoute><Auth type="login" /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Auth type="register" /></PublicRoute>} />
        <Route path="/auth/callback" element={<PublicRoute><AuthCallback /></PublicRoute>} />
        <Route path="/accept-invitation" element={<PublicRoute><AcceptInvitation /></PublicRoute>} />

        <Route path="/library" element={<Layout><Library /></Layout>} />
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

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={<Layout>{user ? <Dashboard /> : <Navigate to="/login" />}</Layout>}
        />
        <Route
          path="/admin"
          element={<Layout>{user?.role === UserRole.ADMIN ? <Admin /> : <Navigate to="/" />}</Layout>}
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
                user.role === UserRole.ADMIN ? <Navigate to="/admin" replace /> : <Navigate to="/dashboard" replace />
              ) : <Landing />}
            </Layout>
          }
        />

        {/* 404 Page - MUST BE LAST */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
};

export default App;
