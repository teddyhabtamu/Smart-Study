import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { User, Mail, Shield, Crown, Save, Check, Loader2, Lock, Bell, AlertTriangle, LogOut, Camera, Upload, Trophy, Footprints, BookOpen, Flame, Users, GraduationCap, Clock, Trash2, Info, CheckCircle, AlertCircle, ExternalLink, Filter } from 'lucide-react';
import { UserRole, User as UserType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BADGES } from '../constants';
import { usersAPI } from '../services/api';
import { formatRelativeTime, getNotificationActionUrl } from '../utils/dateUtils';

type Tab = 'general' | 'security' | 'notifications' | 'achievements';
type NotificationView = 'preferences' | 'history';

// Map icon string names to components
const IconMap: { [key: string]: any } = {
  Footprints, BookOpen, GraduationCap, Flame, Users, Trophy
};

const Profile: React.FC = () => {
  const { user, logout, changePassword, updateUser, markNotificationsAsRead, deleteNotification } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [name, setName] = useState(user?.name || '');
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatar);


  // Guard against null user (shouldn't happen due to route protection)
  if (!user) {
    return <div>Loading...</div>;
  }
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Modal States
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Update local state when user data changes
  useEffect(() => {
    if (user) {
      setName(user.name);
      setAvatar(user.avatar);
    }
  }, [user]);

  // Profile page should only DISPLAY achievements, not UNLOCK them
  // Achievement unlocking should happen in other contexts (Dashboard, etc.)
  // Removed automatic badge checking to prevent toasts on page load
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Notification State
  const [emailNotifs, setEmailNotifs] = useState(user.preferences?.emailNotifications ?? true);
  const [studyReminders, setStudyReminders] = useState(user.preferences?.studyReminders ?? true);
  const [notificationView, setNotificationView] = useState<NotificationView>('preferences');
  const [notificationTypeFilter, setNotificationTypeFilter] = useState<'all' | 'info' | 'success' | 'warning' | 'error'>('all');

  // Ref for notification history section
  const notificationHistoryRef = useRef<HTMLDivElement>(null);

  // Read URL parameters on mount and when they change
  useEffect(() => {
    const tabParam = searchParams.get('tab') as Tab | null;
    const viewParam = searchParams.get('view') as NotificationView | null;
    
    if (tabParam && ['general', 'security', 'notifications', 'achievements'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
    
    if (viewParam && ['preferences', 'history'].includes(viewParam)) {
      setNotificationView(viewParam);
    }
  }, [searchParams]);

  // Scroll to notification history when navigating to it
  useEffect(() => {
    if (activeTab === 'notifications' && notificationView === 'history') {
      // Use multiple attempts to ensure scroll works after DOM is ready
      const attemptScroll = (attempts = 0) => {
        const element = notificationHistoryRef.current;
        
        if (element) {
          // Multiple methods to ensure scroll works
          setTimeout(() => {
            // Method 1: scrollIntoView
            element.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'start',
              inline: 'nearest'
            });
            
            // Method 2: Manual scroll calculation as backup
            setTimeout(() => {
              const rect = element.getBoundingClientRect();
              const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
              const elementTop = rect.top + scrollTop;
              const offset = 100;
              
              window.scrollTo({
                top: Math.max(0, elementTop - offset),
                behavior: 'smooth'
              });
            }, 100);
          }, 50);
        } else if (attempts < 10) {
          // Retry if element not found yet (more attempts)
          setTimeout(() => attemptScroll(attempts + 1), 150);
        }
      };

      // Start scrolling after a delay to ensure tab is switched
      const scrollTimeout = setTimeout(() => attemptScroll(), 300);

      return () => clearTimeout(scrollTimeout);
    }
  }, [activeTab, notificationView]);

  // --- Helpers ---
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        addToast("File size too large. Please choose an image under 2MB.", "error");
        return;
      }
      
      // Check file type
      if (!file.type.startsWith('image/')) {
        addToast("Please select an image file.", "error");
        return;
      }

      setIsSaving(true);
      try {
        const result = await usersAPI.uploadAvatar(file);
        setAvatar(result.avatar);
        // Update user context with new avatar
        await updateUser({ avatar: result.avatar });
        addToast("Avatar uploaded successfully.", "success");
      } catch (err: any) {
        console.error('Avatar upload error:', err);
        addToast(err.message || "Error uploading avatar.", "error");
      } finally {
        setIsSaving(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleGeneralSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await updateUser({ name, avatar });
      setShowSuccess(true);
      addToast("Profile updated successfully.", "success");
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error: any) {
      console.error('Profile update error:', error);
      addToast(error.message || "Failed to update profile.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addToast("New passwords do not match.", "error");
      return;
    }

    setIsSaving(true);

    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      setShowSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast("Password updated successfully.", "success");
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error: any) {
      console.error('Password change error:', error);
      addToast(error.message || "Failed to update password.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await updateUser({
        preferences: {
          emailNotifications: emailNotifs,
          studyReminders: studyReminders
        }
      });
      setShowSuccess(true);
      addToast("Notification preferences saved.", "success");
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error: any) {
      console.error('Notification update error:', error);
      addToast(error.message || "Failed to update preferences.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteConfirm(true);
  };
  
  const confirmDeleteAccount = async () => {
    try {
      setIsLoading(true);
      await usersAPI.deleteAccount();
      addToast("Account deleted successfully.", "success");
      // Logout after successful deletion
      setTimeout(() => {
        logout();
      }, 1000);
    } catch (error: any) {
      console.error('Delete account error:', error);
      addToast(error.message || 'Failed to delete account', 'error');
    } finally {
      setIsLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Header Profile Card */}
      <div className="flex flex-col items-center gap-4 sm:gap-6 border-b border-zinc-200 pb-6 sm:pb-8">
        <div className="relative group w-fit">
          <div className="w-24 h-24 sm:w-28 sm:h-28 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 font-bold text-2xl sm:text-4xl border-4 border-white shadow-lg overflow-hidden relative ring-1 ring-zinc-200/50">
            {avatar ? (
              <img src={avatar} alt={name || 'User'} className="w-full h-full object-cover" />
            ) : (
              (name || 'U').charAt(0).toUpperCase()
            )}

            {/* Upload Overlay */}
            <div
              onClick={handleAvatarClick}
              className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm"
            >
              <Camera className="text-white sm:w-7 sm:h-7" size={24} />
            </div>
          </div>

          {/* Floating Edit Button */}
          <button
             onClick={handleAvatarClick}
             className="absolute bottom-0 right-0 sm:bottom-1 sm:right-1 bg-zinc-900 text-white p-1.5 sm:p-2 rounded-full border-2 border-white shadow-md hover:bg-zinc-800 hover:scale-110 transition-all z-10"
             title="Change Photo"
          >
             <Upload size={12} className="sm:w-3.5 sm:h-3.5" />
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
        </div>

        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900">{user.name}</h1>
          <div className="flex flex-col items-center gap-2 sm:gap-3 text-sm text-zinc-500 mt-2">
            <span>{user.email}</span>

            {user.role === UserRole.ADMIN ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-zinc-900 text-white border border-zinc-800">
                <Shield size={10} className="sm:w-3 sm:h-3" />
                Administrator
              </span>
            ) : (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${user.isPremium ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-zinc-100 text-zinc-600 border border-zinc-200'}`}>
                {user.isPremium ? <Crown size={10} className="sm:w-3 sm:h-3" /> : null}
                {user.isPremium ? 'Student Pro' : 'Free Account'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Sidebar Navigation */}
        <div className="md:col-span-1 space-y-1">
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'general' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
          >
            <User size={18} /> General
          </button>
          
          {/* Only show Achievements for Non-Admin Users */}
          {user.role !== UserRole.ADMIN && (
            <button
              onClick={() => setActiveTab('achievements')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'achievements' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              <Trophy size={18} /> Achievements
            </button>
          )}

          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'security' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
          >
            <Lock size={18} /> Security
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'notifications' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
          >
            <Bell size={18} /> Notifications
          </button>
          
          <div className="pt-4 mt-4 border-t border-zinc-100">
             <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              <LogOut size={18} /> Sign Out
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="md:col-span-3">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden min-h-[500px]">
            
            {/* General Tab */}
            {activeTab === 'general' && (
              <form onSubmit={handleGeneralSubmit} className="p-6 space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 mb-1">Personal Information</h2>
                  <p className="text-sm text-zinc-500">Update your personal details here.</p>
                </div>
                
                <div className="grid gap-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Full Name</label>
                    <div className="relative">
                      <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Email Address</label>
                    <div className="relative">
                      <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="email"
                        value={user.email}
                        disabled
                        className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-500 cursor-not-allowed"
                      />
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">Contact support to change email.</p>
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-zinc-50 mt-auto">
                  <div className="text-sm">
                      {showSuccess && (
                        <span className="text-emerald-600 flex items-center gap-1.5 animate-fade-in">
                          <Check size={16} /> Saved successfully
                        </span>
                      )}
                  </div>
                  <button
                    type="submit"
                    disabled={isSaving || (name === user.name && avatar === user.avatar)}
                    className="px-6 py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-sm"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Achievements Tab - Hidden for Admins */}
            {activeTab === 'achievements' && user.role !== UserRole.ADMIN && (
              <div className="p-6 space-y-6 animate-fade-in">
                 <div>
                    <h2 className="text-lg font-bold text-zinc-900 mb-1">Achievements & Badges</h2>
                    <p className="text-sm text-zinc-500">Track your progress and unlocked milestones.</p>
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {BADGES.map(badge => {
                      // Check if badge is unlocked either by backend data or by requirements
                      const isUnlockedByBackend = user.unlockedBadges?.includes(badge.id) || false;
                      const isUnlockedByLevel = badge.requiredLevel !== undefined ? user.level >= badge.requiredLevel : false;
                      const isUnlockedByStreak = badge.requiredStreak !== undefined ? user.streak >= badge.requiredStreak : false;
                      const isUnlocked = isUnlockedByBackend || isUnlockedByLevel || isUnlockedByStreak;
                      const Icon = IconMap[badge.iconName] || Trophy;
                      
                      return (
                        <div key={badge.id} className={`p-4 rounded-xl border flex flex-col items-center text-center gap-3 transition-all ${
                          isUnlocked 
                            ? 'bg-zinc-50 border-zinc-200 shadow-sm' 
                            : 'bg-zinc-50/50 border-dashed border-zinc-200 opacity-60 grayscale'
                        }`}>
                           <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-1 ${
                             isUnlocked 
                               ? 'bg-amber-100 text-amber-600 ring-4 ring-amber-50' 
                               : 'bg-zinc-200 text-zinc-400'
                           }`}>
                             {isUnlocked ? <Icon size={24} /> : <Lock size={20} />}
                           </div>
                           <div>
                              <h3 className="font-bold text-zinc-900 text-sm">{badge.name}</h3>
                              <p className="text-xs text-zinc-500 mt-1">{badge.description}</p>
                           </div>
                           {!isUnlocked ? (
                             <div className="mt-auto pt-2">
                               {badge.requiredLevel !== undefined ? (
                                 <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-500">
                                   Level {badge.requiredLevel} Required
                                 </span>
                               ) : badge.requiredStreak !== undefined ? (
                                 <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-500">
                                   {badge.requiredStreak} Day Streak Required
                                 </span>
                               ) : null}
                             </div>
                           ) : null}
                        </div>
                      );
                    })}
                 </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <form onSubmit={handlePasswordSubmit} className="p-6 space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 mb-1">Password & Security</h2>
                  <p className="text-sm text-zinc-500">Manage your password and account security.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full px-4 py-2 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-colors ${
                         confirmPassword && newPassword !== confirmPassword 
                           ? 'border-red-300 focus:border-red-500' 
                           : 'border-zinc-300 focus:border-zinc-500'
                      }`}
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-zinc-50">
                  <div className="text-sm">
                      {showSuccess && (
                        <span className="text-emerald-600 flex items-center gap-1.5 animate-fade-in">
                          <Check size={16} /> Password updated
                        </span>
                      )}
                  </div>
                  <button
                    type="submit"
                    disabled={isSaving || !currentPassword || !newPassword || newPassword !== confirmPassword}
                    className="px-6 py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-sm"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Update Password
                      </>
                    )}
                  </button>
                </div>

                <div className="mt-8 pt-8 border-t border-zinc-200">
                  <h3 className="text-sm font-bold text-red-600 mb-2 flex items-center gap-2">
                    <AlertTriangle size={16} /> Danger Zone
                  </h3>
                  <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-red-900">Delete Account</p>
                      <p className="text-xs text-red-600 mt-1">Permanently delete your account and all data.</p>
                    </div>
                    <button 
                      type="button"
                      onClick={handleDeleteAccount}
                      className="px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="p-6 space-y-6 animate-fade-in h-full flex flex-col">
                 {/* View Toggle */}
                 <div className="flex items-center justify-between">
                   <div>
                     <h2 className="text-lg font-bold text-zinc-900 mb-1">Notifications</h2>
                     <p className="text-sm text-zinc-500">Manage your notification preferences and history.</p>
                   </div>
                   <div className="flex gap-2 bg-zinc-100 p-1 rounded-lg">
                     <button
                       onClick={() => setNotificationView('preferences')}
                       className={`px-4 py-1.5 text-xs font-medium rounded transition-all ${
                         notificationView === 'preferences'
                           ? 'bg-white text-zinc-900 shadow-sm'
                           : 'text-zinc-600 hover:text-zinc-900'
                       }`}
                     >
                       Preferences
                     </button>
                     <button
                       onClick={() => setNotificationView('history')}
                       className={`px-4 py-1.5 text-xs font-medium rounded transition-all ${
                         notificationView === 'history'
                           ? 'bg-white text-zinc-900 shadow-sm'
                           : 'text-zinc-600 hover:text-zinc-900'
                       }`}
                     >
                       History
                     </button>
                   </div>
                 </div>

                 {/* Preferences View */}
                 {notificationView === 'preferences' && (
                   <form onSubmit={handleNotificationSubmit} className="space-y-4 flex-1 flex flex-col">
                     <div className="space-y-4 flex-1">
                       <div className="flex items-center justify-between p-4 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-colors">
                         <div className="flex gap-3">
                            <div className="p-2 bg-zinc-100 rounded-lg h-fit text-zinc-500">
                              <Mail size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-zinc-900">Email Notifications</p>
                              <p className="text-xs text-zinc-500">Receive updates about new content and features.</p>
                            </div>
                         </div>
                         <label className="relative inline-flex items-center cursor-pointer">
                           <input type="checkbox" checked={emailNotifs} onChange={() => setEmailNotifs(!emailNotifs)} className="sr-only peer" />
                           <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                         </label>
                       </div>

                       <div className="flex items-center justify-between p-4 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-colors">
                         <div className="flex gap-3">
                            <div className="p-2 bg-zinc-100 rounded-lg h-fit text-zinc-500">
                              <Bell size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-zinc-900">Study Reminders</p>
                              <p className="text-xs text-zinc-500">Get reminded about your study schedule.</p>
                            </div>
                         </div>
                         <label className="relative inline-flex items-center cursor-pointer">
                           <input type="checkbox" checked={studyReminders} onChange={() => setStudyReminders(!studyReminders)} className="sr-only peer" />
                           <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                         </label>
                       </div>
                     </div>

                     <div className="pt-4 flex items-center justify-between border-t border-zinc-50 mt-auto">
                       <div className="text-sm">
                           {showSuccess && (
                             <span className="text-emerald-600 flex items-center gap-1.5 animate-fade-in">
                               <Check size={16} /> Preferences saved
                             </span>
                           )}
                       </div>
                       <button
                         type="submit"
                         disabled={isSaving || (emailNotifs === user.preferences?.emailNotifications && studyReminders === user.preferences?.studyReminders)}
                         className="px-6 py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-sm"
                       >
                         {isSaving ? (
                           <>
                             <Loader2 size={16} className="animate-spin" />
                             Saving...
                           </>
                         ) : (
                           <>
                             <Save size={16} />
                             Save Preferences
                           </>
                         )}
                       </button>
                     </div>
                   </form>
                 )}

                 {/* History View */}
                 {notificationView === 'history' && (
                   <div ref={notificationHistoryRef} className="flex-1 flex flex-col space-y-4">
                     {/* Filters */}
                     <div className="flex items-center gap-2 flex-wrap">
                       <Filter size={14} className="text-zinc-400" />
                       {(['all', 'info', 'success', 'warning', 'error'] as const).map((type) => (
                         <button
                           key={type}
                           onClick={() => setNotificationTypeFilter(type)}
                           className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                             notificationTypeFilter === type
                               ? 'bg-zinc-900 text-white'
                               : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                           }`}
                         >
                           {type.charAt(0).toUpperCase() + type.slice(1)}
                         </button>
                       ))}
                       {user.notifications && user.notifications.filter(n => !n.isRead).length > 0 && (
                         <button
                           onClick={() => markNotificationsAsRead()}
                           className="ml-auto px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-all flex items-center gap-1"
                         >
                           <Check size={12} /> Mark all read
                         </button>
                       )}
                     </div>

                     {/* Notifications List */}
                     <div className="flex-1 overflow-y-auto space-y-2">
                       {(() => {
                         if (!user.notifications || !Array.isArray(user.notifications)) {
                           return (
                             <div className="text-center py-16">
                               <Bell size={32} className="text-zinc-300 mx-auto mb-3" />
                               <p className="text-sm font-medium text-zinc-900 mb-1">No notifications yet</p>
                               <p className="text-xs text-zinc-400">You'll see your notifications here when they arrive</p>
                             </div>
                           );
                         }
                         
                         if (user.notifications.length === 0) {
                           return (
                             <div className="text-center py-16">
                               <Bell size={32} className="text-zinc-300 mx-auto mb-3" />
                               <p className="text-sm font-medium text-zinc-900 mb-1">No notifications yet</p>
                               <p className="text-xs text-zinc-400">You'll see your notifications here when they arrive</p>
                             </div>
                           );
                         }
                         
                         // Filter notifications
                         const filteredNotifications = user.notifications.filter(n => {
                           if (notificationTypeFilter === 'all') return true;
                           // Normalize type comparison (case-insensitive)
                           const notificationType = (n.type || '').toLowerCase();
                           const filterType = notificationTypeFilter.toLowerCase();
                           return notificationType === filterType;
                         });
                         
                         if (filteredNotifications.length === 0) {
                           return (
                             <div className="text-center py-16">
                               <Bell size={32} className="text-zinc-300 mx-auto mb-3" />
                               <p className="text-sm font-medium text-zinc-900 mb-1">No notifications found</p>
                               <p className="text-xs text-zinc-400">Try adjusting your filters</p>
                             </div>
                           );
                         }
                         
                         return filteredNotifications.map((notif) => {
                             const getTypeIcon = (type: string) => {
                               switch (type) {
                                 case 'success': return <CheckCircle size={16} className="text-emerald-600" />;
                                 case 'warning': return <AlertTriangle size={16} className="text-amber-600" />;
                                 case 'error': return <AlertCircle size={16} className="text-red-600" />;
                                 default: return <Info size={16} className="text-blue-600" />;
                               }
                             };

                             const getTypeColor = (type: string) => {
                               switch (type) {
                                 case 'success': return 'border-l-emerald-500 bg-emerald-50/30';
                                 case 'warning': return 'border-l-amber-500 bg-amber-50/30';
                                 case 'error': return 'border-l-red-500 bg-red-50/30';
                                 default: return 'border-l-blue-500 bg-blue-50/30';
                               }
                             };

                             const actionUrl = getNotificationActionUrl(notif);
                             const isClickable = !!actionUrl;

                             return (
                               <div
                                 key={notif.id}
                                 onClick={() => isClickable && navigate(actionUrl!)}
                                 className={`group relative p-4 rounded-lg border-l-4 transition-all duration-200 ${
                                   notif.isRead
                                     ? 'opacity-75 hover:opacity-100 bg-white hover:bg-zinc-50/50'
                                     : `${getTypeColor(notif.type)} hover:shadow-sm`
                                 } ${isClickable ? 'cursor-pointer' : ''}`}
                               >
                                 {!notif.isRead && (
                                   <div className="absolute top-4 right-4 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
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
                                     <p className="text-xs text-zinc-600 mt-1 leading-relaxed">{notif.message}</p>
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
                                         onClick={(e) => {
                                           e.stopPropagation();
                                           markNotificationsAsRead([notif.id]);
                                         }}
                                         className="p-1.5 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-all duration-200"
                                         title="Mark as read"
                                       >
                                         <Check size={14} />
                                       </button>
                                     )}
                                     <button
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         deleteNotification(notif.id);
                                       }}
                                       className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-all duration-200"
                                       title="Delete notification"
                                     >
                                       <Trash2 size={14} />
                                     </button>
                                   </div>
                                 </div>
                               </div>
                             );
                           });
                       })()}
                     </div>
                   </div>
                 )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
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
                  onClick={logout}
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

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative animate-slide-up overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-2">Delete Account?</h3>
              <p className="text-sm text-zinc-500 mb-6">This action is permanent and cannot be undone. All your data and progress will be lost.</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteAccount}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Forever'
                  )}
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

export default Profile;