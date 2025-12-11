import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './src/components/Layout';
import Landing from './src/pages/Landing';
import Library from './src/pages/Library';
import DocumentView from './src/pages/DocumentView';
import Dashboard from './src/pages/Dashboard';
import Auth from './src/pages/Auth';
import AuthCallback from './src/pages/AuthCallback';
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
import Loader from './src/components/Loader';
import { useAuth } from './src/context/AuthContext';
import { UserRole } from './src/types';

const App: React.FC = () => {
  const { user, login, updateUser, isLoading } = useAuth();

  if (isLoading) {
    return <Loader />;
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

          {/* Protected Practice Route */}
          <Route 
            path="/practice" 
            element={user ? <Practice /> : <Navigate to="/login" />} 
          />
          
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

          {/* Static Pages - Explicitly Defined */}
          <Route path="/about" element={<About />} />
          <Route path="/careers" element={<Careers />} />
          
          {/* Auth Routes */}
          <Route path="/login" element={<Auth type="login" onLogin={login} />} />
          <Route path="/register" element={<Auth type="register" onLogin={login} />} />
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
            element={user ? <Profile user={user} onUpdateUser={updateUser} /> : <Navigate to="/login" />} 
          />
          
          {/* Catch all - Redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;