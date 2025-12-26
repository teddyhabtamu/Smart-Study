import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Search, User, Menu, GraduationCap, Crown, LogOut, Sparkles,
  LayoutDashboard, Shield, PlaySquare, Users, X, CalendarDays,
  PanelLeftClose, PanelLeftOpen, Bell, Check, BrainCircuit, Trash2,
  Info, AlertTriangle, CheckCircle, AlertCircle, Clock, Filter, ExternalLink, Loader2, FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SearchPalette from './SearchPalette';
import { formatRelativeTime, getNotificationActionUrl } from '../utils/dateUtils';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout, markNotificationsAsRead, deleteNotification, refreshUser, isLoading } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [isDeletingNotification, setIsDeletingNotification] = useState<string | null>(null);
  const [isMarkingRead, setIsMarkingRead] = useState<string | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const mobileNotificationRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const mainContentRef = useRef<HTMLDivElement>(null);


  // Redirect unauthorized users only when they're on protected pages (and auth is loaded)
  useEffect(() => {
    // Public paths that should NOT use Layout component at all
    const publicPathsWithoutLayout = ["/login", "/register", "/forgot-password", "/reset-password", "/auth/callback", "/accept-invitation"];
    
    // If we're on a public path that shouldn't have Layout, something is wrong
    // Don't redirect, just return early (Layout shouldn't be rendered for these paths)
    if (publicPathsWithoutLayout.includes(location.pathname)) {
      return; // Early return - don't do any redirect logic
    }

    // Public paths that CAN use Layout (accessible without authentication)
    // These are content pages that should be viewable by everyone
    const publicPathsWithLayout = [
      "/",                    // Landing page
      "/library",             // Library - public content
      "/past-exams",          // Past Exams - public content
      "/videos",              // Video library - public content
      "/ai-tutor",            // AI Tutor - public feature
      "/community",            // Community - public forum
      "/about",               // About page
      "/careers",             // Careers page
      "/privacy-policy",      // Privacy Policy page
      "/terms-of-service",    // Terms of Service page
    ];
    
    // Also allow document and video detail pages (they handle their own auth if needed)
    const isPublicContentPage = publicPathsWithLayout.includes(location.pathname) ||
      location.pathname.startsWith('/document/') ||
      location.pathname.startsWith('/video/') ||
      location.pathname.startsWith('/community/');

    // Don't redirect if:
    // 1. Still loading
    // 2. User is authenticated
    // 3. Path is public content page (accessible without authentication)

    if (!isLoading && !user && !isPublicContentPage) {
      console.log('Redirecting to home from:', location.pathname);
      navigate("/");
    }
  }, [user, isLoading, location.pathname, navigate]);

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
      const target = event.target as HTMLElement;
      // Check if click is outside notification button and dropdown
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        const dropdown = document.querySelector('[data-notification-dropdown]');
        if (dropdown && !dropdown.contains(target)) {
          setIsNotificationsOpen(false);
        } else if (!dropdown) {
          setIsNotificationsOpen(false);
        }
      }
    };
    
    if (isNotificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      
      // Only close on main window scroll, not dropdown scroll
      const handleScroll = (event: Event) => {
        const target = event.target as HTMLElement;
        // Don't close if scrolling inside the notification dropdown
        if (!target.closest('[data-notification-dropdown]')) {
          setIsNotificationsOpen(false);
        }
      };
      window.addEventListener('scroll', handleScroll, true);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isNotificationsOpen]);

  const isActive = (path: string) => location.pathname === path;

  const NavItem = ({ to, icon: Icon, label, isPremium }: { to: string; icon: any; label: string; isPremium?: boolean }) => {
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      setIsSidebarOpen(false);
    };
    
    return (
      <Link
        to={to}
        title={isCollapsed ? label : undefined}
        onClick={handleClick}
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
  };

  const unreadCount = user?.notifications?.filter(n => !n.isRead).length || 0;
  
  // Filter notifications based on current filter
  const filteredNotifications = user?.notifications?.filter(notif => {
    if (notificationFilter === 'unread') {
      return !notif.isRead;
    }
    return true;
  }) || [];

  // Group notifications by date (today, yesterday, older)
  const groupedNotifications = filteredNotifications.reduce((acc, notif) => {
    const date = new Date(notif.date);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let groupKey: string;
    if (date >= today) {
      groupKey = 'Today';
    } else if (date >= yesterday) {
      groupKey = 'Yesterday';
    } else {
      const diffInDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffInDays < 7) {
        groupKey = 'This Week';
      } else if (diffInDays < 30) {
        groupKey = 'This Month';
      } else {
        groupKey = 'Older';
      }
    }

    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(notif);
    return acc;
  }, {} as Record<string, typeof filteredNotifications>);

  // Handle notification click
  const handleNotificationClick = async (notif: any) => {
    // Mark as read if unread
    if (!notif.isRead) {
      try {
        await markNotificationsAsRead([notif.id]);
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
      }
    }
    
    const actionUrl = getNotificationActionUrl(notif);
    if (actionUrl) {
      setIsNotificationsOpen(false);
      navigate(actionUrl);
    }
  };


  return (
    <div className="min-h-screen bg-zinc-50/50 flex font-sans">
      <SearchPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      
      {/* Mobile Header - Single Header with Logo, Notification & Profile */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-zinc-200 z-50 flex items-center justify-between px-4">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>

        {/* SmartStudy Logo - Center */}
        <Link to="/" className="flex items-center gap-2 flex-1 justify-center" onClick={() => setIsSidebarOpen(false)}>
          <div className="bg-zinc-900 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
            <GraduationCap className="text-white" size={16} />
          </div>
          <span className="font-bold text-base text-zinc-900 tracking-tight">SmartStudy</span>
        </Link>

        <div className="flex items-center gap-3">
          {/* Notification Bell (Mobile) */}
          {user && (
            <div className="relative" ref={mobileNotificationRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsNotificationsOpen(!isNotificationsOpen);
                  if (!isNotificationsOpen && user) {
                    refreshUser().catch(error => {
                      console.error('Failed to fetch notifications:', error);
                    });
                  }
                }}
                className={`p-2 rounded-lg transition-colors relative ${isNotificationsOpen ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'}`}
                aria-label="Notifications"
              >
                <Bell size={22} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                )}
              </button>
            </div>
          )}

          {/* Profile Icon (Mobile) */}
          {user ? (
            <Link
              to="/profile"
              onClick={() => setIsSidebarOpen(false)}
              className="h-9 w-9 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 font-bold text-xs border border-zinc-200 overflow-hidden relative"
              aria-label="Profile"
            >
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user?.name ? user.name.charAt(0).toUpperCase() : 'U'
              )}
            </Link>
          ) : (
            <Link
              to="/login"
              className="p-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-lg transition-colors"
              aria-label="Login"
            >
              <User size={22} />
            </Link>
          )}
        </div>
      </header>
      
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 h-screen bg-white z-50 transition-all duration-300 border-r border-zinc-200 flex flex-col overflow-visible
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
            {(user?.role === 'ADMIN' || user?.role === 'MODERATOR') ? (
              <>
                <div className="space-y-1">
                  {!isCollapsed && <p className="px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 animate-fade-in">Administration</p>}
                  <NavItem to="/admin" icon={Shield} label="Management Panel" />
                </div>

                <div className="space-y-1">
                  {!isCollapsed && <p className="px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 animate-fade-in">View as Student</p>}
                  <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
                  <NavItem to="/library" icon={Search} label="Library" />
                  <NavItem to="/past-exams" icon={FileText} label="Past Exams" />
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
                  <NavItem to="/past-exams" icon={FileText} label="Past Exams" />
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

          {/* Footer / Profile - Hidden on mobile (moved to header) */}
          <div className="hidden lg:block p-4 border-t border-zinc-100 relative overflow-visible">
            {user ? (
              <div className={`flex items-center transition-all duration-300 ${isCollapsed ? 'justify-center flex-col gap-4' : 'gap-2'} relative`}>
                {/* Notification Bell (Desktop only) */}
                <div className="relative z-50" ref={notificationRef}>
                   <button
                     onClick={(e) => {
                       e.stopPropagation();
                       // Open dropdown immediately
                       setIsNotificationsOpen(!isNotificationsOpen);
                       
                       // Fetch fresh notifications in background (non-blocking)
                       if (!isNotificationsOpen && user) {
                         refreshUser().catch(error => {
                           console.error('Failed to fetch notifications:', error);
                         });
                       }
                     }}
                     className={`p-2 rounded-lg transition-colors relative ${isNotificationsOpen ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50'}`}
                   >
                     <Bell size={20} />
                     {unreadCount > 0 && (
                       <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                     )}
                   </button>
                   
                   {/* Notification Dropdown */}
                   {isNotificationsOpen && (notificationRef.current || mobileNotificationRef.current) && createPortal(
                     <div
                       data-notification-dropdown
                       className={`fixed bg-white border border-zinc-200 rounded-xl shadow-2xl z-[9999] flex flex-col animate-fade-in-fast overflow-hidden ${
                         window.innerWidth < 1024 
                           ? 'w-[calc(100vw-2rem)] max-w-sm right-4 top-20' 
                           : 'w-96'
                       }`}
                       style={
                         window.innerWidth >= 1024 && notificationRef.current
                           ? {
                               bottom: `${window.innerHeight - notificationRef.current.getBoundingClientRect().top + 8}px`,
                               left: `${notificationRef.current.getBoundingClientRect().right + 8}px`,
                               maxHeight: `${Math.min(600, notificationRef.current.getBoundingClientRect().top - 16)}px`,
                               minHeight: '200px'
                             }
                           : {
                               maxHeight: 'calc(100vh - 6rem)',
                               minHeight: '200px'
                             }
                       }
                       onClick={(e) => e.stopPropagation()}
                       onMouseDown={(e) => e.stopPropagation()}
                     >
                        {/* Header */}
                        <div className="p-4 border-b border-zinc-200 bg-zinc-900">
                           <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                 <Bell size={16} className="text-white" />
                                 <span className="text-sm font-bold text-white">Notifications</span>
                                 {unreadCount > 0 && (
                                   <span className="px-2 py-0.5 bg-white text-zinc-900 text-[10px] font-bold rounded-full">
                                     {unreadCount}
                                   </span>
                                 )}
                              </div>
                              {unreadCount > 0 && (
                                 <button 
                                   onClick={async () => {
                                     setIsMarkingAllRead(true);
                                     try {
                                       await markNotificationsAsRead();
                                     } catch (error) {
                                       console.error('Failed to mark all as read:', error);
                                     } finally {
                                       setIsMarkingAllRead(false);
                                     }
                                   }}
                                   disabled={isMarkingAllRead}
                                   className="text-[10px] font-medium text-zinc-300 hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                 >
                                   {isMarkingAllRead ? (
                                     <>
                                       <Loader2 size={12} className="animate-spin" />
                                       Marking...
                                     </>
                                   ) : (
                                     <>
                                       <Check size={12} /> Mark all read
                                     </>
                                   )}
                                 </button>
                              )}
                           </div>
                           
                           {/* Filter Tabs */}
                           <div className="flex gap-2">
                              <button
                                onClick={() => setNotificationFilter('all')}
                                className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
                                  notificationFilter === 'all'
                                    ? 'bg-white text-zinc-900'
                                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                }`}
                              >
                                All ({user?.notifications?.length || 0})
                              </button>
                              <button
                                onClick={() => setNotificationFilter('unread')}
                                className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
                                  notificationFilter === 'unread'
                                    ? 'bg-white text-zinc-900'
                                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                }`}
                              >
                                Unread ({unreadCount})
                              </button>
                           </div>
                        </div>
                        
                        {/* Notifications List */}
                        <div className="overflow-y-auto flex-1 overscroll-contain">
                           {filteredNotifications.length > 0 ? (
                             <div className="p-2 space-y-3">
                               {Object.entries(groupedNotifications).map(([groupKey, groupNotifs]) => (
                                 <div key={groupKey} className="space-y-2">
                                   <div className="px-2 py-1">
                                     <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                       {groupKey}
                                     </span>
                                   </div>
                                   {groupNotifs.map((notif) => {
                                     const getTypeIcon = (type: string) => {
                                       switch (type) {
                                         case 'success': return <CheckCircle size={16} className="text-zinc-700" />;
                                         case 'warning': return <AlertTriangle size={16} className="text-zinc-600" />;
                                         case 'error': return <AlertCircle size={16} className="text-zinc-800" />;
                                         default: return <Info size={16} className="text-zinc-600" />;
                                       }
                                     };

                                     const getTypeColor = (type: string) => {
                                       switch (type) {
                                         case 'success': return 'border-l-zinc-700 bg-zinc-50';
                                         case 'warning': return 'border-l-zinc-500 bg-zinc-50';
                                         case 'error': return 'border-l-zinc-900 bg-zinc-100';
                                         default: return 'border-l-zinc-600 bg-zinc-50';
                                       }
                                     };

                                     const actionUrl = getNotificationActionUrl(notif);
                                     const isClickable = !!actionUrl;

                                     return (
                                       <div
                                         key={notif.id}
                                         onClick={() => {
                                           if (isClickable) {
                                             handleNotificationClick(notif);
                                           }
                                         }}
                                         className={`group relative p-3 rounded-lg border-l-4 transition-all duration-200 ${
                                           notif.isRead
                                             ? 'opacity-60 hover:opacity-100 bg-white hover:bg-zinc-50 border-l-zinc-300'
                                             : `${getTypeColor(notif.type)} hover:shadow-md`
                                         } ${isClickable ? 'cursor-pointer hover:border-l-zinc-900 active:scale-[0.98]' : ''}`}
                                       >
                                         {!notif.isRead && (
                                           <div className="absolute top-3 right-3 w-2 h-2 bg-zinc-900 rounded-full animate-pulse"></div>
                                         )}
                                         <div className="flex gap-3">
                                           <div className="flex-shrink-0 mt-0.5">
                                             {getTypeIcon(notif.type)}
                                           </div>
                                           <div className="flex-1 min-w-0">
                                             <div className="flex items-start justify-between gap-2">
                                                <p className="text-sm font-semibold text-zinc-900 leading-tight">{notif.title}</p>
                                                {isClickable && (
                                                  <ExternalLink size={12} className="text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                                                )}
                                             </div>
                                             <p className="text-xs text-zinc-600 mt-1 leading-relaxed line-clamp-2">{notif.message}</p>
                                             <div className="flex items-center gap-2 mt-2">
                                                <Clock size={10} className="text-zinc-400" />
                                                <p className="text-[10px] text-zinc-400">
                                                  {formatRelativeTime(notif.date)}
                                                </p>
                                             </div>
                                           </div>
                                           <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                             {!notif.isRead && (
                                               <button
                                                 onClick={async (e) => {
                                                   e.stopPropagation();
                                                   setIsMarkingRead(notif.id);
                                                   try {
                                                     await markNotificationsAsRead([notif.id]);
                                                   } catch (error) {
                                                     console.error('Failed to mark as read:', error);
                                                   } finally {
                                                     setIsMarkingRead(null);
                                                   }
                                                 }}
                                                 disabled={isMarkingRead === notif.id}
                                                 className="p-1.5 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                                 title="Mark as read"
                                               >
                                                 {isMarkingRead === notif.id ? (
                                                   <Loader2 size={14} className="animate-spin" />
                                                 ) : (
                                                   <Check size={14} />
                                                 )}
                                               </button>
                                             )}
                                             <button
                                               onClick={async (e) => {
                                                 e.stopPropagation();
                                                 setIsDeletingNotification(notif.id);
                                                 try {
                                                   await deleteNotification(notif.id);
                                                 } catch (error) {
                                                   console.error('Failed to delete notification:', error);
                                                 } finally {
                                                   setIsDeletingNotification(null);
                                                 }
                                               }}
                                               disabled={isDeletingNotification === notif.id}
                                               className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                               title="Delete notification"
                                             >
                                               {isDeletingNotification === notif.id ? (
                                                 <Loader2 size={14} className="animate-spin" />
                                               ) : (
                                                 <Trash2 size={14} />
                                               )}
                                             </button>
                                           </div>
                                         </div>
                                       </div>
                                     );
                                   })}
                                 </div>
                               ))}
                             </div>
                           ) : (
                             <div className="text-center py-16 px-4">
                                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4">
                                   <Bell size={24} className="text-white" />
                                </div>
                                <p className="text-sm font-medium text-zinc-900 mb-1">
                                   {notificationFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                                </p>
                                <p className="text-xs text-zinc-500">
                                   {notificationFilter === 'unread' 
                                     ? 'You\'re all caught up!' 
                                     : 'We\'ll notify you about important updates and achievements!'}
                                </p>
                             </div>
                           )}
                        </div>
                        
                        {/* Footer - View All Link */}
                        {filteredNotifications.length > 0 && (
                           <div className="p-3 border-t border-zinc-200 bg-zinc-900">
                              <Link
                                 to="/profile?tab=notifications&view=history"
                                 onClick={() => setIsNotificationsOpen(false)}
                                 className="block w-full text-center text-xs font-medium text-white hover:text-zinc-200 py-2 rounded-lg hover:bg-zinc-800 transition-colors"
                              >
                                 View all notifications
                              </Link>
                           </div>
                        )}
                     </div>,
                     document.body
                   )}
                </div>

                <Link to="/profile" onClick={() => setIsSidebarOpen(false)} className={`flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-50 transition-colors cursor-pointer group ${isCollapsed ? 'justify-center w-full' : 'flex-1 overflow-hidden'}`} title={isCollapsed ? user.name : undefined}>
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
                         <span className="text-[11px] text-zinc-500 truncate">
                           {user.role === 'ADMIN' ? 'Administrator' : user.role === 'MODERATOR' ? 'Content Manager' : 'Student'}
                         </span>
                         {user.role !== 'ADMIN' && user.role !== 'MODERATOR' && (
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
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-white relative lg:mt-0 mt-16">
        
        {/* Modern Watermark - Fixed Background Layer */}
        <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none overflow-hidden select-none">
          {/* We use a very light opacity (0.06) because it sits behind a semi-transparent layer */}
          <h1 className="text-[16vw] md:text-[14rem] font-black text-zinc-900/[0.06] -rotate-12 whitespace-nowrap tracking-tighter blur-[1px]">
            በል ተማር ልጄ
          </h1>
        </div>

        {/* Mobile Header - Removed (using fixed header at top level instead) */}

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