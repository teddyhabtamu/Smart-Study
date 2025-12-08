import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
  Home, Search, User, Menu, GraduationCap, Crown, LogOut, Sparkles, 
  LayoutDashboard, Shield, PlaySquare, Users, X, CalendarDays,
  PanelLeftClose, PanelLeftOpen, Bell, Check, BrainCircuit
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SearchPalette from './SearchPalette';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout, markNotificationsAsRead } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  
  const location = useLocation();
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Scroll to top whenever the route changes
  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  // Global Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close notifications on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      <Icon size={20} className={`flex-shrink-0 ${isActive(to) ? 'text-zinc-900' : isPremium ? 'text-zinc-900' : 'text-zinc-400 group-hover:text-zinc-600'}`} />
      
      {!isCollapsed && (
        <span className="whitespace-nowrap overflow-hidden transition-all duration-200">
          {label}
        </span>
      )}

      {/* Active Indicator */}
      {!isCollapsed && isActive(to) && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-zinc-900"></div>}
      
      {/* Premium Indicator for Collapsed State */}
      {isCollapsed && isPremium && (
        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-zinc-900 border border-white"></div>
      )}
    </Link>
  );

  const unreadCount = user?.notifications?.filter(n => !n.isRead).length || 0;

  return (
    <div className="min-h-screen bg-zinc-50/50 flex font-sans">
      <SearchPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      
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
          <div className={`h-20 flex items-center border-b border-zinc-100 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'justify-between px-6'}`}>
            
            {/* Logo - Hidden when collapsed */}
            {!isCollapsed && (
              <div className="flex items-center gap-3 overflow-hidden animate-fade-in-fast pl-1">
                <div className="relative">
                  {/* Subtle glow effect */}
                  <div className="absolute -inset-2 bg-zinc-100 rounded-full blur opacity-40"></div>
                  <div className="relative bg-zinc-900 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-zinc-900/10">
                    <GraduationCap className="text-white" size={18} />
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <span className="font-bold text-lg text-zinc-900 tracking-tight leading-none">
                    SmartStudy
                  </span>
                  <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest mt-0.5">
                    AI Learning
                  </span>
                </div>
              </div>
            )}

            {/* Modern Sidebar Toggle (Desktop) */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:flex p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>

            {/* Close Button (Mobile) */}
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 text-zinc-500 hover:text-zinc-900"
            >
              <X size={20} />
            </button>
          </div>

          {/* Quick Actions (Search Trigger) */}
          <div className={`px-4 mt-4 mb-2 ${isCollapsed ? 'hidden' : 'block'}`}>
             <button 
               onClick={() => setIsSearchOpen(true)}
               className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-400 hover:border-zinc-300 hover:text-zinc-600 transition-all text-left shadow-sm"
             >
               <Search size={16} />
               <span className="flex-1">Search...</span>
               <span className="text-xs border border-zinc-200 rounded px-1.5 py-0.5 bg-white">Ctrl K</span>
             </button>
          </div>

          {/* Navigation */}
          <div className="flex-1 px-3 py-2 space-y-8 overflow-y-auto overflow-x-hidden hide-scrollbar">
            {user?.role === 'ADMIN' ? (
              <>
                <div className="space-y-1">
                  {!isCollapsed && <p className="px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 animate-fade-in">Administration</p>}
                  <NavItem to="/admin" icon={Shield} label="Management Panel" />
                </div>

                <div className="space-y-1">
                  {!isCollapsed && <p className="px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 animate-fade-in">View as Student</p>}
                  <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
                  <NavItem to="/library" icon={Search} label="Library" />
                  <NavItem to="/videos" icon={PlaySquare} label="Video Lessons" />
                  <NavItem to="/practice" icon={BrainCircuit} label="Practice Center" />
                  <NavItem to="/community" icon={Users} label="Community" />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  {!isCollapsed && <p className="px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 animate-fade-in">Platform</p>}
                  <NavItem to="/" icon={Home} label="Overview" />
                  {/* Conditionally render Study Planner only if logged in */}
                  {user && <NavItem to="/planner" icon={CalendarDays} label="Study Planner" />}
                  <NavItem to="/library" icon={Search} label="Library" />
                  <NavItem to="/videos" icon={PlaySquare} label="Video Lessons" />
                  {user && <NavItem to="/practice" icon={BrainCircuit} label="Practice Center" />}
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
                {/* Notification Bell (Only visible if user exists) */}
                <div className="relative" ref={notificationRef}>
                   <button 
                     onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                     className={`p-2 rounded-lg transition-colors relative ${isNotificationsOpen ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50'}`}
                   >
                     <Bell size={20} />
                     {unreadCount > 0 && (
                       <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                     )}
                   </button>
                   
                   {/* Notification Dropdown */}
                   {isNotificationsOpen && (
                     <div className={`absolute bottom-full left-0 mb-2 w-80 bg-white border border-zinc-200 rounded-xl shadow-xl z-50 flex flex-col max-h-96 animate-fade-in-fast ${isCollapsed ? 'left-full ml-2 bottom-0' : ''}`}>
                        <div className="p-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50 rounded-t-xl">
                           <span className="text-xs font-bold text-zinc-900 uppercase tracking-wide">Notifications</span>
                           {unreadCount > 0 && (
                             <button 
                               onClick={markNotificationsAsRead}
                               className="text-[10px] font-medium text-zinc-500 hover:text-zinc-900 flex items-center gap-1"
                             >
                               <Check size={12} /> Mark all read
                             </button>
                           )}
                        </div>
                        <div className="overflow-y-auto p-2 space-y-1">
                           {user.notifications && user.notifications.length > 0 ? (
                             user.notifications.map((notif) => (
                               <div key={notif.id} className={`p-3 rounded-lg flex gap-3 ${notif.isRead ? 'opacity-60 hover:opacity-100' : 'bg-zinc-50'}`}>
                                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                    notif.type === 'success' ? 'bg-emerald-500' : 
                                    notif.type === 'warning' ? 'bg-amber-500' : 'bg-zinc-400'
                                  }`}></div>
                                  <div>
                                     <p className="text-sm font-semibold text-zinc-900 leading-tight">{notif.title}</p>
                                     <p className="text-xs text-zinc-500 mt-0.5">{notif.message}</p>
                                     <p className="text-[10px] text-zinc-400 mt-2">{new Date(notif.date).toLocaleDateString()}</p>
                                  </div>
                               </div>
                             ))
                           ) : (
                             <div className="text-center py-8 text-zinc-400 text-xs">No notifications yet.</div>
                           )}
                        </div>
                     </div>
                   )}
                </div>

                <Link to="/profile" className={`flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer group ${isCollapsed ? 'justify-center w-full' : 'flex-1 overflow-hidden'}`} title={isCollapsed ? user.name : undefined}>
                  <div className="h-9 w-9 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 font-bold text-xs border border-zinc-200 flex-shrink-0 overflow-hidden relative">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      user?.name ? user.name.charAt(0).toUpperCase() : 'U'
                    )}
                  </div>
                  {!isCollapsed && (
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-zinc-900 truncate">{user.name}</span>
                      <div className="flex items-center gap-2">
                         <span className="text-[11px] text-zinc-500 truncate">{user.role === 'ADMIN' ? 'Administrator' : 'Student'}</span>
                         {user.role !== 'ADMIN' && (
                           <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">
                             Lvl {user.level}
                           </span>
                         )}
                      </div>
                    </div>
                  )}
                </Link>
                <button 
                  onClick={() => setShowLogoutConfirm(true)} 
                  className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all" 
                  title="Sign Out"
                >
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
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-white relative">
        
        {/* Modern Watermark - Fixed Background Layer */}
        <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none overflow-hidden select-none">
          {/* We use a very light opacity (0.06) because it sits behind a semi-transparent layer */}
          <h1 className="text-[16vw] md:text-[14rem] font-black text-zinc-900/[0.06] -rotate-12 whitespace-nowrap tracking-tighter blur-[1px]">
            በል ተማር ልጄ
          </h1>
        </div>

        {/* Mobile Header */}
        <header className="lg:hidden h-14 bg-white/80 backdrop-blur-md border-b border-zinc-200 flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="bg-zinc-900 w-7 h-7 rounded-lg flex items-center justify-center">
              <GraduationCap className="text-white" size={14} />
            </div>
            <span className="font-bold text-zinc-900">SmartStudy</span>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={() => setIsSearchOpen(true)} className="p-2 text-zinc-500">
               <Search size={20} />
             </button>
             <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-zinc-500">
               <Menu size={20} />
             </button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div ref={mainContentRef} className="flex-1 overflow-y-auto scroll-smooth bg-zinc-50/60 relative z-10">
          <div className="max-w-6xl mx-auto p-6 md:p-10">
            {children}
          </div>
        </div>
      </main>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative animate-slide-up overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut size={24} />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-2">Sign Out?</h3>
              <p className="text-sm text-zinc-500 mb-6">Are you sure you want to sign out of your account?</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    logout();
                    setShowLogoutConfirm(false);
                  }}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors text-sm"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Layout;