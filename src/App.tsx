
import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Library from './pages/Library';
import DocumentView from './pages/DocumentView';
import Dashboard from './pages/Dashboard';
import Auth from './pages/Auth';
import AuthCallback from './pages/AuthCallback';
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
import { useAuth } from './context/AuthContext';
import { UserRole } from './types';

const App: React.FC = () => {
  const { user, login, updateUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-8 h-8 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Router>
      <Layout>
        <Routes>
          {/* Default Route: Redirects to Dashboard (Overview) if logged in, otherwise Landing */}
          <Route 
            path="/" 
            element={
              user ? (
                user.role === UserRole.ADMIN ? <Navigate to="/admin" replace /> : <Navigate to="/dashboard" replace />
              ) : <Landing />
            } 
          />
          
          <Route path="/library" element={<Library />} />
          <Route path="/document/:id" element={<DocumentView />} />
          
          <Route path="/videos" element={<VideoLibrary />} />
          <Route path="/video/:id" element={<VideoWatch />} />

          <Route path="/ai-tutor" element={<AITutor />} />
          
          {/* Protected Planner Route */}
          <Route 
            path="/planner" 
            element={user ? <Planner /> : <Navigate to="/login" />} 
          />

          <Route path="/practice" element={<Practice />} />
          
          <Route path="/community" element={<Community />} />
          <Route path="/community/:id" element={<CommunityPost />} />

          <Route 
            path="/subscription" 
            element={
              user ? (
                <Subscription onUpgrade={() => updateUser({ isPremium: true })} />
              ) : (
                <Navigate to="/login" />
              )
            } 
          />
          
          {/* Static Pages */}
          <Route path="/about" element={<About />} />
          <Route path="/careers" element={<Careers />} />

          {/* Auth Routes */}
          <Route path="/login" element={<Auth type="login" />} />
          <Route path="/register" element={<Auth type="register" />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          
          {/* Protected Routes */}
          <Route 
            path="/dashboard" 
            element={user ? <Dashboard /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin" 
            element={user?.role === UserRole.ADMIN ? <Admin /> : <Navigate to="/" />} 
          />
          <Route 
            path="/profile" 
            element={user ? <Profile /> : <Navigate to="/login" />} 
          />
          
          {/* 404 Page */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
