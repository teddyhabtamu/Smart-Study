import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, Mail, Shield, Crown, Save, Check, Loader2, Lock, Bell, AlertTriangle, LogOut, Camera, Upload, Trophy, Footprints, BookOpen, Flame, Users, GraduationCap } from 'lucide-react';
import { UserRole, User as UserType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BADGES } from '../constants';

interface ProfileProps {
  user: UserType;
  onUpdateUser: (data: Partial<UserType>) => void;
}

type Tab = 'general' | 'security' | 'notifications' | 'achievements';

// Map icon string names to components
const IconMap: { [key: string]: any } = {
  Footprints, BookOpen, GraduationCap, Flame, Users, Trophy
};

const Profile: React.FC<ProfileProps> = ({ user, onUpdateUser }) => {
  const { logout } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState<string | undefined>(user.avatar);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Modal States
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Notification State
  const [emailNotifs, setEmailNotifs] = useState(user.preferences?.emailNotifications ?? true);
  const [studyReminders, setStudyReminders] = useState(user.preferences?.studyReminders ?? true);

  // --- Helpers ---
  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

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
      try {
        const base64 = await convertToBase64(file);
        setAvatar(base64);
      } catch (err) {
        addToast("Error processing image.", "error");
      }
    }
  };

  const handleGeneralSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      onUpdateUser({ name, avatar });
      setIsSaving(false);
      setShowSuccess(true);
      addToast("Profile updated successfully.", "success");
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1000);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addToast("New passwords do not match.", "error");
      return;
    }
    
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setShowSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast("Password updated successfully.", "success");
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1500);
  };

  const handleNotificationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      onUpdateUser({
        preferences: {
          emailNotifications: emailNotifs,
          studyReminders: studyReminders
        }
      });
      setIsSaving(false);
      setShowSuccess(true);
      addToast("Notification preferences saved.", "success");
      setTimeout(() => setShowSuccess(false), 3000);
    }, 800);
  };

  const handleDeleteAccount = () => {
    setShowDeleteConfirm(true);
  };
  
  const confirmDeleteAccount = () => {
    addToast("Account scheduled for deletion.", "info");
    logout();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Header Profile Card */}
      <div className="flex flex-col md:flex-row items-center gap-6 border-b border-zinc-200 pb-8">
        <div className="relative group mx-auto md:mx-0 w-fit">
          <div className="w-28 h-28 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 font-bold text-4xl border-4 border-white shadow-lg overflow-hidden relative ring-1 ring-zinc-200/50">
            {avatar ? (
              <img src={avatar} alt={name} className="w-full h-full object-cover" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
            
            {/* Upload Overlay */}
            <div 
              onClick={handleAvatarClick}
              className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm"
            >
              <Camera className="text-white" size={28} />
            </div>
          </div>
          
          {/* Floating Edit Button */}
          <button 
             onClick={handleAvatarClick}
             className="absolute bottom-1 right-1 bg-zinc-900 text-white p-2 rounded-full border-2 border-white shadow-md hover:bg-zinc-800 hover:scale-110 transition-all z-10"
             title="Change Photo"
          >
             <Upload size={14} />
          </button>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />
        </div>
        
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold text-zinc-900">{user.name}</h1>
          <div className="flex flex-col md:flex-row items-center gap-3 text-sm text-zinc-500 mt-2 justify-center md:justify-start">
            <span>{user.email}</span>
            <span className="hidden md:inline w-1 h-1 bg-zinc-300 rounded-full"></span>
            
            {user.role === UserRole.ADMIN ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-zinc-900 text-white border border-zinc-800">
                <Shield size={12} />
                Administrator
              </span>
            ) : (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${user.isPremium ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-zinc-100 text-zinc-600 border border-zinc-200'}`}>
                {user.isPremium ? <Crown size={12} /> : null}
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
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Changes
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
                      const isUnlocked = user.unlockedBadges.includes(badge.id);
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
                           {badge.requiredLevel ? (
                             <div className="mt-auto pt-2">
                               <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                 user.level >= badge.requiredLevel
                                   ? 'bg-emerald-100 text-emerald-600'
                                   : 'bg-zinc-200 text-zinc-500'
                               }`}>
                                 Level {badge.requiredLevel} Required
                               </span>
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
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Update Password
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
              <form onSubmit={handleNotificationSubmit} className="p-6 space-y-6 animate-fade-in h-full flex flex-col">
                 <div>
                  <h2 className="text-lg font-bold text-zinc-900 mb-1">Notification Preferences</h2>
                  <p className="text-sm text-zinc-500">Choose what updates you want to receive.</p>
                </div>

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
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save Preferences
                  </button>
                </div>
              </form>
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
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors text-sm"
                >
                  Delete Forever
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