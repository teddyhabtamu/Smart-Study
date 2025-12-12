import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './src/components/Layout';
import Landing from './src/pages/Landing';
import Library from './src/pages/Library';
import DocumentView from './src/pages/DocumentView';
import Dashboard from './src/pages/Dashboard';
import Auth from './src/pages/Auth';
import AuthCallback from './src/pages/AuthCallback';
import ResetPassword from './src/pages/ResetPassword';
import AcceptInvitation from './src/pages/AcceptInvitation';
import Subscription from './src/pages/Subscription';
import Admin from './src/pages/Admin';
import AITutor from './src/pages/AITutor';
import Profile from './src/pages/Profile';
import VideoLibrary from './src/pages/VideoLibrary';
import VideoWatch from './src/pages/VideoWatch';
import Community from './src/pages/Community';
import CommunityPost from './src/pages/CommunityPost';
import Planner from './src/pages/Planner';
import Practice from './src/pages/Practice';
import About from './src/pages/About';
import Careers from './src/pages/Careers';
import NotFound from './src/pages/NotFound';
import Loader from './src/components/Loader';
import { useAuth } from './src/context/AuthContext';
import { UserRole } from './src/types';
import { PublicRoute } from './src/components/PublicRoute';

const App: React.FC = () => {
  const { user, login, updateUser, isLoading } = useAuth();

  if (isLoading) {
    return <Loader />;
  }

  return (
    <Router>
      <Routes>
        {/* PUBLIC ROUTES - No Layout wrapper */}
        <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
        <Route path="/login" element={<PublicRoute><Auth type="login" /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Auth type="register" /></PublicRoute>} />
        <Route path="/auth/callback" element={<PublicRoute><AuthCallback /></PublicRoute>} />
        <Route path="/accept-invitation" element={<PublicRoute><AcceptInvitation /></PublicRoute>} />

        {/* ROUTES WITH LAYOUT */}
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

        {/* Protected Practice Route */}
        <Route 
          path="/practice" 
          element={<Layout><Practice /></Layout>} 
        />
        
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
          element={<Layout>{user ? <Profile user={user} onUpdateUser={updateUser} /> : <Navigate to="/login" />}</Layout>} 
        />

        {/* ROOT ROUTE - With Layout */}
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
        
        {/* 404 Page */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
};

export default App;