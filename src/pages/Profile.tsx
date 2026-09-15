import React, { useState, useRef, useEffect } from 'react';
import Dialog from '../components/Dialog';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { User, Mail, Shield, Crown, Save, Check, Loader2, Lock, Bell, Palette, AlertTriangle, LogOut, Camera, Upload, Trophy, Footprints, BookOpen, Flame, Users, GraduationCap, Clock, Trash2, Info, CheckCircle, AlertCircle, ExternalLink, Filter, Eye, EyeOff, Zap, Star, BrainCircuit, MonitorPlay, Sparkles, Sun, Sunset, Moon } from 'lucide-react';
import { UserRole, User as UserType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BADGES } from '../constants';
import { usersAPI } from '../services/api';
import { formatRelativeTime, getNotificationActionUrl } from '../utils/dateUtils';
import { useTheme, THEMES, type ThemePreference, type AutoSlot } from '../context/ThemeContext';
import { AUTO_SLOT_META, themeName } from '../context/themeSchedule';
import CustomSelect from '../components/CustomSelect';

type Tab = 'general' | 'security' | 'notifications' | 'achievements' | 'pro' | 'appearance';
type NotificationView = 'preferences' | 'history';

// Map icon string names to components
const IconMap: { [key: string]: any } = {
  Footprints, BookOpen, GraduationCap, Flame, Users, Trophy
};

const Profile: React.FC = () => {
  const { user, logout, changePassword, updateUser, markNotificationsAsRead, deleteNotification } = useAuth();
  const { addToast } = useToast();
  const { preference: themePreference, theme: activeTheme, setPreference: setThemePreference, autoSlots, autoSlot, setAutoSlot } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [name, setName] = useState(user?.name || '');
  const [grade, setGrade] = useState<string>(user?.grade ? String(user.grade) : '');
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatar);


  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Modal States
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Delete re-auth: password accounts confirm with their password;
  // OAuth-only accounts (no password) enter an emailed 6-digit code.
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteNeedsEmail, setDeleteNeedsEmail] = useState(false);
  const [deleteCodeEmail, setDeleteCodeEmail] = useState('');
  const [deleteCodeSending, setDeleteCodeSending] = useState(false);
  const [deleteCodeSent, setDeleteCodeSent] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Update local state when user data changes (grade + prefs included:
  // without them an async profile load leaves grade '' while the real
  // grade exists — and saving would then wipe it to null)
  useEffect(() => {
    if (user) {
      setName(user.name);
      setAvatar(user.avatar);
      setGrade(user.grade ? String(user.grade) : '');
      setEmailNotifs(user.preferences?.emailNotifications ?? true);
      setStudyReminders(user.preferences?.studyReminders ?? true);
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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Notification State
  const [emailNotifs, setEmailNotifs] = useState(user?.preferences?.emailNotifications ?? true);
  const [studyReminders, setStudyReminders] = useState(user?.preferences?.studyReminders ?? true);
  const [notificationView, setNotificationView] = useState<NotificationView>('preferences');
  const [notificationTypeFilter, setNotificationTypeFilter] = useState<'all' | 'info' | 'success' | 'warning' | 'error'>('all');

  // Ref for notification history section
  const notificationHistoryRef = useRef<HTMLDivElement>(null);

  // Read URL parameters on mount and when they change
  useEffect(() => {
    const tabParam = searchParams.get('tab') as Tab | null;
    const viewParam = searchParams.get('view') as NotificationView | null;
    
    if (tabParam && ['general', 'security', 'notifications', 'achievements', 'pro'].includes(tabParam)) {
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
  // Guard against null user (route renders <Navigate> instead, and logout
  // unmounts this page — but the guard MUST sit below every hook call, or
  // the user→null transition crashes React with a hooks-count mismatch)
  if (!user) {
    return <div>Loading...</div>;
  }
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
      await updateUser({ name, avatar, grade: grade ? Number(grade) : null });
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

  const requestDeleteCode = async () => {
    try {
      setDeleteCodeSending(true);
      const res = await usersAPI.requestDeletionCode();
      setDeleteCodeEmail(res?.email || '');
      setDeleteCodeSent(true);
      addToast('Verification code sent to your email', 'success');
    } catch (error: any) {
      console.error('Deletion code error:', error);
      addToast(error.message || 'Failed to send verification code', 'error');
    } finally {
      setDeleteCodeSending(false);
    }
  };

  const handleDeleteAccount = () => {
    setDeletePassword('');
    setDeleteCode('');
    setDeleteCodeEmail('');
    setDeleteCodeSent(false);
    // Google-only accounts have no password: open on the code step, but the
    // code is only sent when explicitly requested — opening the modal must
    // never fire emails by itself.
    // hasPassword absent (stale cache) falls back to password first — the
    // backend still corrects us via PASSWORD_FLOW if we're wrong.
    setDeleteNeedsEmail(user?.hasPassword === false);
    setShowDeleteConfirm(true);
  };
  
  const confirmDeleteAccount = async () => {
    // Local flag, not state: the finally below closes over the render-time
    // deleteNeedsEmail, so it would shut the modal just as a step swap
    // activates. This tracks intent within this single attempt instead.
    let keepOpen = false;
    try {
      setIsLoading(true);
      await usersAPI.deleteAccount(
        deleteNeedsEmail ? { code: deleteCode } : { password: deletePassword },
      );
      addToast("Account deleted successfully.", "success");
      // Logout after successful deletion
      setTimeout(() => {
        logout();
      }, 1000);
    } catch (error: any) {
      console.error('Delete account error:', error);
      if (error?.code === 'PASSWORD_FLOW') {
        // Backend says this account has a password after all: swap back.
        setDeleteNeedsEmail(false);
        keepOpen = true;
        addToast('Please enter your password to confirm', 'error');
        return;
      }
      if (error?.code === 'NO_ACTIVE_CODE' || error?.code === 'CODE_LOCKED') {
        keepOpen = true;
        addToast(error.message || 'Request a new code', 'error');
        return;
      }
      addToast(error.message || 'Failed to delete account', 'error');
    } finally {
      setIsLoading(false);
      if (!keepOpen) setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Header Profile Card */}
      <div className="flex flex-col items-center gap-4 sm:gap-6 border-b border-zinc-200 pb-6 sm:pb-8">
        <div className="relative group w-fit">
          <div className={`w-24 h-24 sm:w-28 sm:h-28 bg-zinc-100 rounded-full flex items-center justify-center text-inksoft font-bold text-2xl sm:text-4xl border-4 border-white shadow-lg overflow-hidden relative ${
            user.isPremium ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-white' : 'ring-1 ring-zinc-200/50'
          }`}>
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
              <Camera className="text-onink sm:w-7 sm:h-7" size={24} />
            </div>
          </div>

          {/* Floating Edit Button */}
          <button
             onClick={handleAvatarClick}
             className="absolute bottom-0 right-0 sm:bottom-1 sm:right-1 bg-zinc-900 text-onink p-1.5 sm:p-2 rounded-full border-2 border-white shadow-md hover:bg-zinc-800 hover:scale-110 transition-all z-10"
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
          <h1 className="text-2xl sm:text-3xl font-bold text-ink">{user.name}</h1>
          <div className="flex flex-col items-center gap-2 sm:gap-3 text-sm text-zinc-500 mt-2">
            <span>{user.email}</span>

            {(user.role === UserRole.ADMIN || user.role === UserRole.MODERATOR) ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-zinc-900 text-onink border border-zinc-800">
                <Shield size={10} className="sm:w-3 sm:h-3" />
                Administrator
              </span>
            ) : (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${user.isPremium ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-zinc-100 text-inksoft border border-zinc-200'}`}>
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
              activeTab === 'general' ? 'bg-zinc-100 text-ink' : 'text-zinc-500 hover:bg-zinc-50 hover:text-ink'
            }`}
          >
            <User size={18} /> General
          </button>
          
          {/* Only show Achievements for Non-Admin Users */}
          {user.role !== UserRole.ADMIN && user.role !== UserRole.MODERATOR && (
            <button
              onClick={() => setActiveTab('achievements')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'achievements' ? 'bg-zinc-100 text-ink' : 'text-zinc-500 hover:bg-zinc-50 hover:text-ink'
              }`}
            >
              <Trophy size={18} /> Achievements
            </button>
          )}

          <button
            onClick={() => setActiveTab('pro')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'pro'
                ? 'bg-amber-100 text-amber-900'
                : user.isPremium
                ? 'text-amber-700 hover:bg-amber-50'
                : 'text-zinc-500 hover:bg-zinc-50 hover:text-ink'
            }`}
          >
            <Crown size={18} /> Pro
            {user.isPremium && (
              <span className="ml-auto w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Active membership" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'security' ? 'bg-zinc-100 text-ink' : 'text-zinc-500 hover:bg-zinc-50 hover:text-ink'
            }`}
          >
            <Lock size={18} /> Security
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'notifications' ? 'bg-zinc-100 text-ink' : 'text-zinc-500 hover:bg-zinc-50 hover:text-ink'
            }`}
          >
            <Bell size={18} /> Notifications
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'appearance' ? 'bg-zinc-100 text-ink' : 'text-zinc-500 hover:bg-zinc-50 hover:text-ink'
            }`}
          >
            <Palette size={18} /> Appearance
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
          <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm overflow-hidden min-h-[500px]">
            
            {/* General Tab */}
            {activeTab === 'general' && (
              <form onSubmit={handleGeneralSubmit} className="p-6 space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-lg font-bold text-ink mb-1">Personal Information</h2>
                  <p className="text-sm text-zinc-500">Update your personal details here.</p>
                </div>
                
                <div className="grid gap-6">
                  <div>
                    <label htmlFor="profile-name" className="block text-sm font-medium text-inksoft mb-1">Full Name</label>
                    <div className="relative">
                      <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        id="profile-name"
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-surface border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="profile-email" className="block text-sm font-medium text-inksoft mb-1">Email Address</label>
                    <div className="relative">
                      <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        id="profile-email"
                        type="email"
                        autoComplete="email"
                        value={user.email}
                        disabled
                        className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-500 cursor-not-allowed"
                      />
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">To change your email, contact support on <a href="https://t.me/ethio_smartstudy" target="_blank" rel="noopener noreferrer" className="text-inksoft font-medium hover:text-ink hover:underline">Telegram</a>.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-inksoft mb-1">School Grade</label>
                    {/* CustomSelect, not a native <select>: the native control
                        renders an unstyled OS dropdown ("raw HTML" look) that
                        clashes with every other picker in the app. */}
                    <CustomSelect
                      value={grade}
                      onChange={setGrade}
                      placeholder="Not set"
                      options={[
                        { label: 'Not set', value: '' },
                        { label: 'Grade 9', value: '9' },
                        { label: 'Grade 10', value: '10' },
                        { label: 'Grade 11', value: '11' },
                        { label: 'Grade 12', value: '12' },
                      ]}
                    />
                    <p className="text-xs text-zinc-400 mt-1">Used to tailor AI Tutor answers to your level.</p>
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
                    disabled={isSaving || (name === user.name && avatar === user.avatar && grade === (user.grade ? String(user.grade) : ''))}
                    className="px-6 py-2.5 bg-zinc-900 text-onink font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-sm"
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

            {/* Appearance Tab */}
            {activeTab === 'appearance' && (
              <div className="p-6 space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-lg font-bold text-ink mb-1">Appearance</h2>
                  <p className="text-sm text-zinc-500">Pick a theme — it applies instantly and is remembered on this device.</p>
                </div>

                <div className="grid gap-3">
                  {/* System default */}
                  <button
                    onClick={() => setThemePreference('system')}
                    aria-pressed={themePreference === 'system'}
                    className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                      themePreference === 'system'
                        ? 'border-zinc-900 ring-2 ring-zinc-900/10 bg-zinc-50'
                        : 'border-zinc-200 hover:border-zinc-300 bg-surface'
                    }`}
                  >
                    <span className="w-10 h-10 rounded-lg bg-zinc-900 text-onink flex items-center justify-center font-bold text-xs flex-shrink-0">
                      A<span className="text-zinc-400">a</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-ink text-sm">System default</span>
                      <span className="block text-xs text-zinc-500">Follows your device light/dark setting</span>
                    </span>
                    {themePreference === 'system' && <Check size={18} className="text-ink flex-shrink-0" />}
                  </button>

                  {/* Auto schedule — clock-driven themes, per-slot overridable */}
                  <button
                    onClick={() => setThemePreference('auto')}
                    aria-pressed={themePreference === 'auto'}
                    className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                      themePreference === 'auto'
                        ? 'border-zinc-900 ring-2 ring-zinc-900/10 bg-zinc-50'
                        : 'border-zinc-200 hover:border-zinc-300 bg-surface'
                    }`}
                  >
                    <span className="w-10 h-10 rounded-lg bg-zinc-900 text-amber-400 flex items-center justify-center flex-shrink-0">
                      <Clock size={18} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-ink text-sm">
                        Auto schedule
                        {themePreference === 'auto' && (
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            Now · {themeName(activeTheme, THEMES)}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        Day {themeName(autoSlots.day, THEMES)} · Evening {themeName(autoSlots.evening, THEMES)} · Night {themeName(autoSlots.night, THEMES)}
                      </span>
                    </span>
                    {themePreference === 'auto' && <Check size={18} className="text-ink flex-shrink-0" />}
                  </button>

                  {/* Per-slot pickers — visible only in Auto mode */}
                  {themePreference === 'auto' && (
                    <div className="rounded-xl border border-zinc-200 bg-surface p-4 space-y-4 animate-fade-in">
                      <p className="text-xs text-zinc-500">
                        Auto follows your clock. Tap a dot to change what each part of the day uses.
                      </p>
                      {AUTO_SLOT_META.map(({ slot, label, hours }) => {
                        const SlotIcon = slot === 'day' ? Sun : slot === 'evening' ? Sunset : Moon;
                        return (
                          <div key={slot} className="flex items-center gap-3">
                            <span className="flex items-center gap-2 w-32 flex-shrink-0 min-w-0">
                              <SlotIcon size={15} className="text-zinc-400 flex-shrink-0" />
                              <span className="min-w-0">
                                <span className="block text-xs font-bold text-ink leading-tight">
                                  {label}
                                  {autoSlot === slot && (
                                    <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-600">Now</span>
                                  )}
                                </span>
                                <span className="block text-[10px] text-zinc-400 leading-tight">{hours}</span>
                              </span>
                            </span>
                            <span className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={`${label} theme`}>
                              {THEMES.map((t) => (
                                <button
                                  key={t.id}
                                  title={`${label}: ${t.name}`}
                                  aria-label={`${label} theme: ${t.name}`}
                                  aria-pressed={autoSlots[slot] === t.id}
                                  onClick={() => setAutoSlot(slot as AutoSlot, t.id)}
                                  className={`w-6 h-6 rounded-full border transition-all ${
                                    autoSlots[slot] === t.id
                                      ? 'border-zinc-900 ring-2 ring-zinc-900/20 scale-110'
                                      : 'border-black/10 hover:scale-105'
                                  }`}
                                  style={{ backgroundColor: t.swatches[0] }}
                                />
                              ))}
                            </span>
                            <span className="ml-auto text-[11px] font-medium text-zinc-500 flex-shrink-0 hidden sm:block">
                              {themeName(autoSlots[slot], THEMES)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setThemePreference(t.id as ThemePreference)}
                      aria-pressed={themePreference === t.id}
                      className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                        themePreference === t.id
                          ? 'border-zinc-900 ring-2 ring-zinc-900/10 bg-zinc-50'
                          : 'border-zinc-200 hover:border-zinc-300 bg-surface'
                      }`}
                    >
                      <span
                        className="w-10 h-10 rounded-lg flex items-center justify-center gap-1 flex-shrink-0 border border-black/10"
                        style={{ backgroundColor: t.swatches[0] }}
                        aria-hidden="true"
                      >
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.swatches[1] }} />
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.swatches[2] }} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-ink text-sm">
                          {t.name}
                          {activeTheme === t.id && themePreference !== 'system' && (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Active</span>
                          )}
                        </span>
                        <span className="block text-xs text-zinc-500">{t.blurb}</span>
                      </span>
                      {themePreference === t.id && <Check size={18} className="text-ink flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Achievements Tab - Hidden for Admins */}
            {activeTab === 'achievements' && user.role !== UserRole.ADMIN && (
              <div className="p-6 space-y-6 animate-fade-in">
                 <div>
                    <h2 className="text-lg font-bold text-ink mb-1">Achievements & Badges</h2>
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
                              <h3 className="font-bold text-ink text-sm">{badge.name}</h3>
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

            {/* Pro Tab — Member Hub */}
            {activeTab === 'pro' && (
              <div className="p-6 space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-lg font-bold text-ink mb-1 flex items-center gap-2">
                    <Crown size={18} className="text-amber-500" />
                    {user.isPremium ? 'Pro Membership' : 'Go Pro'}
                  </h2>
                  <p className="text-sm text-zinc-500">
                    {user.isPremium
                      ? 'Your membership, perks, and stats — all in one place.'
                      : 'Unlock the full SmartStudy experience.'}
                  </p>
                </div>

                {user.isPremium ? (
                  <>
                    {/* Membership card */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-amber-950 text-white p-6 sm:p-8 shadow-xl">
                      <div className="pro-card-shine" aria-hidden="true" />
                      <Crown
                        size={140}
                        className="absolute -right-6 -bottom-6 text-white/5 rotate-12"
                        aria-hidden="true"
                      />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center">
                              <Crown size={16} className="text-ink" />
                            </div>
                            <span className="font-black tracking-[0.2em] text-sm">STUDENT&nbsp;PRO</span>
                          </div>
                          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        </div>
                        <p className="font-mono text-sm sm:text-base tracking-[0.15em] text-zinc-300 mb-5">
                          SS&nbsp;••••&nbsp;{(user.id || '').slice(0, 4).toUpperCase() || 'MEMBER'}
                        </p>
                        <div className="flex items-end justify-between gap-x-4 gap-y-2 flex-wrap">
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">Member</p>
                            <p className="font-bold truncate">{user.name}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">Member since</p>
                            <p className="font-bold text-sm">
                              {user.premiumSince
                                ? new Date(user.premiumSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                                : '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pro stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { icon: Zap, label: 'Level', value: String(user.level ?? 1) },
                        { icon: Star, label: 'Total XP', value: String(user.xp ?? 0) },
                        { icon: Flame, label: 'Day streak', value: String(user.streak ?? 0) },
                        { icon: BrainCircuit, label: 'Practice sessions', value: String(user.practiceAttempts ?? 0) },
                      ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 sm:p-4 text-center">
                          <Icon size={18} className="mx-auto mb-1.5 text-amber-600" />
                          {/* Fixed-cream tile (like the red-50 danger zone): text stays
                              fixed-dark so it reads on the light tint in every theme. */}
                          <p className="text-lg sm:text-xl font-black text-zinc-900 tabular-nums">{value}</p>
                          <p className="text-[11px] font-medium text-zinc-600">{label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Member benefits */}
                    <div>
                      <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-3">Your Pro perks</h3>
                      <div className="space-y-2">
                        {[
                          { icon: BookOpen, title: 'Premium document library', sub: 'Textbooks & study guides' },
                          { icon: MonitorPlay, title: 'Premium video lessons', sub: 'Tutorial library across all grades' },
                          { icon: BrainCircuit, title: 'AI practice quizzes', sub: 'No daily limits — drill as much as you want' },
                          { icon: Sparkles, title: 'AI Smart Schedule planner', sub: 'Personal study plans built around your deadlines' },
                        ].map(({ icon: Icon, title, sub }) => (
                          <div key={title} className="flex items-start gap-3 p-3 bg-surface border border-zinc-200 rounded-xl">
                            <div className="w-9 h-9 rounded-lg bg-zinc-900 text-onink flex items-center justify-center flex-shrink-0">
                              <Icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-ink">{title}</p>
                              <p className="text-xs text-zinc-500">{sub}</p>
                            </div>
                            <Check size={16} className="text-emerald-500 flex-shrink-0 mt-1" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="text-xs text-zinc-400 text-center">
                      Questions about your membership? Contact support and we'll sort it out.
                    </p>
                  </>
                ) : (
                  <>
                    {/* Free users: locked card + upsell */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-700 text-white p-6 sm:p-8 shadow-xl">
                      <Lock
                        size={140}
                        className="absolute -right-6 -bottom-6 text-white/5 rotate-12"
                        aria-hidden="true"
                      />
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center">
                            <Crown size={16} className="text-amber-400" />
                          </div>
                          <span className="font-black tracking-[0.2em] text-sm text-zinc-300">STUDENT&nbsp;PRO</span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-black mb-2">Study without limits.</h3>
                        <p className="text-sm text-zinc-400 mb-5 max-w-sm">
                          Join Pro members getting the most out of SmartStudy every day.
                        </p>
                        <button
                          onClick={() => navigate('/subscription')}
                          className="px-6 py-3 bg-amber-400 text-zinc-900 font-bold rounded-xl hover:bg-amber-300 transition-colors inline-flex items-center gap-2 text-sm"
                        >
                          <Crown size={16} /> Become a Pro member
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-3">What Pro unlocks</h3>
                      <div className="space-y-2">
                        {[
                          { icon: BookOpen, title: 'Premium document library', sub: 'Full textbook & study-guide collection' },
                          { icon: MonitorPlay, title: 'Premium video lessons', sub: 'Complete tutorial library, all grades' },
                          { icon: BrainCircuit, title: 'Unlimited AI practice quizzes', sub: 'Free accounts get 1 quiz per day' },
                          { icon: Sparkles, title: 'AI Smart Schedule planner', sub: 'Personal study plans built around your deadlines' },
                        ].map(({ icon: Icon, title, sub }) => (
                          <div key={title} className="flex items-start gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                            <div className="w-9 h-9 rounded-lg bg-surface border border-zinc-200 text-zinc-400 flex items-center justify-center flex-shrink-0">
                              <Icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-ink">{title}</p>
                              <p className="text-xs text-zinc-500">{sub}</p>
                            </div>
                            <Lock size={14} className="text-zinc-300 flex-shrink-0 mt-1" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <form onSubmit={handlePasswordSubmit} className="p-6 space-y-6 animate-fade-in">
                <div>
                  <h2 className="text-lg font-bold text-ink mb-1">Password & Security</h2>
                  <p className="text-sm text-zinc-500">Manage your password and account security.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-inksoft mb-1">Current Password</label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-4 pr-10 py-2 bg-surface border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-inksoft transition-colors"
                        aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                      >
                        {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-inksoft mb-1">New Password</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 pr-10 py-2 bg-surface border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-inksoft transition-colors"
                        aria-label={showNewPassword ? "Hide password" : "Show password"}
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-inksoft mb-1">Confirm New Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`w-full px-4 pr-10 py-2 bg-surface border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-colors ${
                           confirmPassword && newPassword !== confirmPassword 
                             ? 'border-red-300 focus:border-red-500' 
                             : 'border-zinc-300 focus:border-zinc-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-inksoft transition-colors"
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
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
                    className="px-6 py-2.5 bg-zinc-900 text-onink font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-sm"
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
                      className="px-4 py-2 bg-surface border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
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
                     <h2 className="text-lg font-bold text-ink mb-1">Notifications</h2>
                     <p className="text-sm text-zinc-500">Manage your notification preferences and history.</p>
                   </div>
                   <div className="flex gap-2 bg-zinc-100 p-1 rounded-lg">
                     <button
                       onClick={() => setNotificationView('preferences')}
                       className={`px-4 py-1.5 text-xs font-medium rounded transition-all ${
                         notificationView === 'preferences'
                           ? 'bg-surface text-ink shadow-sm'
                           : 'text-inksoft hover:text-ink'
                       }`}
                     >
                       Preferences
                     </button>
                     <button
                       onClick={() => setNotificationView('history')}
                       className={`px-4 py-1.5 text-xs font-medium rounded transition-all ${
                         notificationView === 'history'
                           ? 'bg-surface text-ink shadow-sm'
                           : 'text-inksoft hover:text-ink'
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
                              <p className="text-sm font-bold text-ink">Email Notifications</p>
                              <p className="text-xs text-zinc-500">Receive updates about new content and features.</p>
                            </div>
                         </div>
                         <label className="relative inline-flex items-center cursor-pointer">
                           <input type="checkbox" checked={emailNotifs} onChange={() => setEmailNotifs(!emailNotifs)} className="sr-only peer" />
                           <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
                         </label>
                       </div>

                       <div className="flex items-center justify-between p-4 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-colors">
                         <div className="flex gap-3">
                            <div className="p-2 bg-zinc-100 rounded-lg h-fit text-zinc-500">
                              <Bell size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-ink">Study Reminders</p>
                              <p className="text-xs text-zinc-500">Get reminded about your study schedule.</p>
                            </div>
                         </div>
                         <label className="relative inline-flex items-center cursor-pointer">
                           <input type="checkbox" checked={studyReminders} onChange={() => setStudyReminders(!studyReminders)} className="sr-only peer" />
                           <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-zinc-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zinc-900"></div>
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
                         className="px-6 py-2.5 bg-zinc-900 text-onink font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-sm"
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
                               ? 'bg-zinc-900 text-onink'
                               : 'bg-zinc-100 text-inksoft hover:bg-zinc-200'
                           }`}
                         >
                           {type.charAt(0).toUpperCase() + type.slice(1)}
                         </button>
                       ))}
                       {user.notifications && user.notifications.filter(n => !n.isRead).length > 0 && (
                         <button
                           onClick={() => markNotificationsAsRead()}
                           className="ml-auto px-3 py-1.5 text-xs font-medium text-inksoft hover:text-ink bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-all flex items-center gap-1"
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
                               <p className="text-sm font-medium text-ink mb-1">No notifications yet</p>
                               <p className="text-xs text-zinc-400">You'll see your notifications here when they arrive</p>
                             </div>
                           );
                         }
                         
                         if (user.notifications.length === 0) {
                           return (
                             <div className="text-center py-16">
                               <Bell size={32} className="text-zinc-300 mx-auto mb-3" />
                               <p className="text-sm font-medium text-ink mb-1">No notifications yet</p>
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
                               <p className="text-sm font-medium text-ink mb-1">No notifications found</p>
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
                                  default: return <Info size={16} className="text-zinc-500" />;
                                }
                              };

                              const getTypeColor = (type: string) => {
                                switch (type) {
                                  case 'success': return 'border-l-emerald-500 bg-emerald-50/30';
                                  case 'warning': return 'border-l-amber-500 bg-amber-50/30';
                                  case 'error': return 'border-l-red-500 bg-red-50/30';
                                  default: return 'border-l-zinc-400 bg-zinc-50/50';
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
                                     ? 'opacity-75 hover:opacity-100 bg-surface hover:bg-zinc-50/50'
                                     : `${getTypeColor(notif.type)} hover:shadow-sm`
                                 } ${isClickable ? 'cursor-pointer' : ''}`}
                               >
                                  {!notif.isRead && (
                                    <div className="absolute top-4 right-4 w-2 h-2 bg-zinc-900 rounded-full animate-pulse"></div>
                                  )}
                                 <div className="flex gap-3">
                                   <div className="flex-shrink-0 mt-0.5">
                                     {getTypeIcon(notif.type)}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                     <div className="flex items-start justify-between gap-2">
                                       <p className="text-sm font-semibold text-ink leading-tight">{notif.title}</p>
                                        {isClickable && (
                                          <ExternalLink size={12} className="text-zinc-400 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                                        )}
                                     </div>
                                     <p className="text-xs text-inksoft mt-1 leading-relaxed">{notif.message}</p>
                                     <div className="flex items-center gap-2 mt-2">
                                       <Clock size={10} className="text-zinc-400" />
                                       <p className="text-[10px] text-zinc-400">
                                         {formatRelativeTime(notif.date)}
                                       </p>
                                     </div>
                                   </div>
                                    {/* Hover-reveal on desktop; always visible on touch (no hover) */}
                                    <div className="flex flex-col gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                      {!notif.isRead && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            markNotificationsAsRead([notif.id]);
                                          }}
                                          className="p-1.5 text-zinc-400 hover:text-ink hover:bg-zinc-100 rounded transition-all duration-200"
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
      <Dialog
        open={showLogoutConfirm && mounted}
        onClose={() => setShowLogoutConfirm(false)}
        label="Sign out?"
        size="sm"
      >
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut size={24} />
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">Sign Out?</h3>
              <p className="text-sm text-zinc-500 mb-6">Are you sure you want to sign out of your account?</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-2.5 bg-surface border border-zinc-200 text-inksoft font-medium rounded-lg hover:bg-zinc-50 transition-colors text-sm"
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
      </Dialog>

      {/* Delete Account Confirmation Modal */}
      <Dialog
        open={showDeleteConfirm && mounted}
        onClose={() => setShowDeleteConfirm(false)}
        label="Delete account?"
        size="sm"
      >
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">Delete Account?</h3>
              <p className="text-sm text-zinc-500 mb-4">This action is permanent and cannot be undone. All your data and progress will be lost.</p>

              {/* Fresh re-auth (backend enforces it): password for password
                  accounts, emailed 6-digit code for Google-sign-in ones. */}
              {!deleteNeedsEmail ? (
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmDeleteAccount(); }}
                  placeholder="Enter your password to confirm"
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 mb-4 bg-surface border border-zinc-300 rounded-lg text-sm text-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all"
                />
              ) : !deleteCodeSent ? (
                <div className="mb-4">
                  <p className="text-xs text-zinc-500 mb-3">
                    This account uses Google sign-in, so we'll email you a 6-digit confirmation code. Nothing is sent until you ask.
                  </p>
                  <button
                    type="button"
                    onClick={requestDeleteCode}
                    disabled={deleteCodeSending}
                    className="w-full px-4 py-2.5 bg-zinc-900 text-onink text-sm font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {deleteCodeSending ? 'Sending…' : 'Send verification code'}
                  </button>
                </div>
              ) : (
                <div className="mb-4">
                  <p className="text-xs text-zinc-500 mb-2">
                    {deleteCodeEmail
                      ? `We sent a 6-digit code to ${deleteCodeEmail} — it expires in 10 minutes.`
                      : 'We sent a 6-digit code to your email — it expires in 10 minutes.'}
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={deleteCode}
                    onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmDeleteAccount(); }}
                    placeholder="6-digit code"
                    className="w-full px-3 py-2.5 bg-surface border border-zinc-300 rounded-lg text-sm text-ink placeholder:text-zinc-400 tracking-[0.3em] text-center font-bold focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all"
                  />
                  <button
                    type="button"
                    onClick={requestDeleteCode}
                    disabled={deleteCodeSending}
                    className="mt-2 text-xs font-medium text-zinc-500 hover:text-ink disabled:opacity-50 transition-colors"
                  >
                    {deleteCodeSending ? 'Sending…' : "Didn't get it? Resend code"}
                  </button>
                </div>
              )}
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2.5 bg-surface border border-zinc-200 text-inksoft font-medium rounded-lg hover:bg-zinc-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteAccount}
                  disabled={isLoading || (!deleteNeedsEmail && !deletePassword) || (deleteNeedsEmail && (deleteCode.length !== 6 || !deleteCodeSent))}
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
      </Dialog>
    </div>
  );
};

export default Profile;