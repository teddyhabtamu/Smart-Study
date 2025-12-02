import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, Search, User, Menu, GraduationCap, Crown, LogOut, Sparkles, 
  LayoutDashboard, Shield, PlaySquare, Users, X, CalendarDays
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const NavItem = ({ to, icon: Icon, label, isPremium }: { to: string; icon: any; label: string; isPremium?: boolean }) => (
    <Link
      to={to}
      title={isCollapsed ? label : undefined}
      onClick={() => setIsSidebarOpen(false)}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium relative ${
        isActive(to)
          ? 'bg-zinc-100 text-zinc-900'
          : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
      } ${isCollapsed ? 'justify-center' : ''}`}
    >
      <Icon size={20} className={`flex-shrink-0 ${isActive(to) ? 'text-zinc-900' : isPremium ? 'text-amber-500' : 'text-zinc-400 group-hover:text-zinc-600'}`} />
      
      {!isCollapsed && (
        <span className="whitespace-nowrap overflow-hidden transition-all duration-200">
          {label}
        </span>
      )}

      {/* Active Indicator */}
      {!isCollapsed && isActive(to) && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-zinc-900"></div>}
      
      {/* Premium Indicator for Collapsed State */}
      {isCollapsed && isPremium && (
        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-500 border border-white"></div>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen bg-zinc-50/50 flex font-sans">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 h-screen bg-white z-50 transition-all duration-300 border-r border-zinc-200 flex flex-col
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
          lg:translate-x-0 
          ${isCollapsed ? 'lg:w-[80px]' : 'lg:w-[260px]'}
          w-[260px]
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className={`h-16 flex items-center border-b border-zinc-100 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'justify-between px-6'}`}>
            
            {/* Logo - Hidden when collapsed */}
            {!isCollapsed && (
              <div className="flex items-center gap-2.5 overflow-hidden animate-fade-in-fast">
                <div className="bg-zinc-900 min-w-[2rem] w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="text-white" size={16} />
                </div>
                <span className="font-bold text-zinc-900 tracking-tight whitespace-nowrap flex items-center gap-2">
                  SmartStudy 
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">LIVE</span>
                </span>
              </div>
            )}

            {/* Hamburger Toggle Button (Desktop) */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:flex p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <Menu size={20} />
            </button>

            {/* Close Button (Mobile) */}
            <div className="lg:hidden flex items-center justify-between w-full">
              <span className="font-bold text-zinc-900">Menu</span>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 text-zinc-500 hover:text-zinc-900"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 px-3 py-6 space-y-8 overflow-y-auto overflow-x-hidden hide-scrollbar">
            {user?.role === 'ADMIN' ? (
              <div className="space-y-1">
                {!isCollapsed && <p className="px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 animate-fade-in">Admin Portal</p>}
                <NavItem to="/admin" icon={Shield} label="Management Panel" />
                <NavItem to="/library" icon={Search} label="View Library" />
                <NavItem to="/videos" icon={PlaySquare} label="Video Lessons" />
                <NavItem to="/community" icon={Users} label="Community" />
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {!isCollapsed && <p className="px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 animate-fade-in">Platform</p>}
                  <NavItem to="/" icon={Home} label="Overview" />
                  {/* Conditionally render Study Planner only if logged in */}
                  {user && <NavItem to="/planner" icon={CalendarDays} label="Study Planner" />}
                  <NavItem to="/library" icon={Search} label="Library" />
                  <NavItem to="/videos" icon={PlaySquare} label="Video Lessons" />
                  <NavItem to="/ai-tutor" icon={Sparkles} label="AI Tutor" />
                  <NavItem to="/community" icon={Users} label="Community" />
                </div>

                {user && (
                  <div className="space-y-1">
                    {!isCollapsed && <p className="px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 mt-6 animate-fade-in">Account</p>}
                    <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
                    <NavItem to="/subscription" icon={Crown} label="Subscription" isPremium />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer / Profile */}
          <div className="p-4 border-t border-zinc-100">
            {user ? (
              <div className={`flex items-center transition-all duration-300 ${isCollapsed ? 'justify-center flex-col gap-4' : 'gap-2'}`}>
                <Link to="/profile" className={`flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer group ${isCollapsed ? 'justify-center w-full' : 'flex-1 overflow-hidden'}`} title={isCollapsed ? user.name : undefined}>
                  <div className="h-9 w-9 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 font-bold text-xs border border-zinc-200 flex-shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  {!isCollapsed && (
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-zinc-900 truncate">{user.name}</span>
                      <span className="text-[11px] text-zinc-500 truncate">{user.role === 'ADMIN' ? 'Administrator' : 'Student'}</span>
                    </div>
                  )}
                </Link>
                <button onClick={logout} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Sign Out">
                  <LogOut size={18} />
                </button>
              </div>
            ) : isCollapsed ? (
              <Link to="/login" className="flex items-center justify-center w-full bg-zinc-900 text-white p-2.5 rounded-lg hover:bg-zinc-800 transition-colors" title="Sign In">
                <User size={18} />
              </Link>
            ) : (
              <Link to="/login" className="flex items-center justify-center w-full bg-zinc-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-white">
        {/* Mobile Header */}
        <header className="lg:hidden h-14 bg-white border-b border-zinc-200 flex items-center justify-between px-4 sticky top-0 z-30">
          <span className="font-bold text-zinc-900">SmartStudy</span>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-zinc-500">
            <Menu size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto scroll-smooth bg-zinc-50/50">
          <div className="max-w-6xl mx-auto p-6 md:p-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Layout;