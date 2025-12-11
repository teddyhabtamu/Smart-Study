import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, NotificationItem } from '../types';
import { authAPI, usersAPI } from '../services/api';

interface AuthContextType {
  user: User | null;
  login: (emailOrUser: string | User, password?: string) => Promise<User | void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  toggleBookmark: (itemId: string, itemType?: 'document' | 'video') => Promise<void>;
  gainXP: (amount: number) => Promise<{ leveledUp: boolean; newLevel: number }>;
  markNotificationsAsRead: (notificationIds?: string[]) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastNotificationCheck, setLastNotificationCheck] = useState<Date>(new Date());
  
  // Request deduplication - prevent multiple simultaneous calls
  const profileRequestRef = useRef<Promise<any> | null>(null);
  const lastProfileFetchRef = useRef<Date | null>(null);
  const PROFILE_CACHE_DURATION = 5000; // 5 seconds cache

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      const savedUser = localStorage.getItem('smartstudy_user');

      if (token) {
        try {
          const response = await authAPI.verify();
          const userData = response.user as any; // Backend user format
          // Transform snake_case fields to camelCase to match User interface
          const transformedUser: User = {
            id: userData.id,
            name: userData.name,
            email: userData.email,
            role: userData.role,
            isPremium: userData.is_premium || userData.isPremium || false,
            bookmarks: userData.bookmarks || [],
            avatar: userData.avatar,
            preferences: userData.preferences,
            status: userData.status || 'Active',
            joinedDate: userData.created_at || userData.joinedDate,
            xp: userData.xp || 0,
            level: userData.level || 1,
            streak: userData.streak || 0,
            lastActiveDate: userData.last_active_date || userData.lastActiveDate || '',
            unlockedBadges: userData.unlocked_badges || userData.unlockedBadges || [],
            practiceAttempts: userData.practice_attempts || userData.practiceAttempts || 0,
            notifications: userData.notifications || []
          };
          setUser(transformedUser);
          // Save to localStorage for persistence
          localStorage.setItem('smartstudy_user', JSON.stringify(transformedUser));
          // Load full profile including bookmarks (force refresh on initial load)
          await refreshUser(true);
        } catch (error) {
          console.error('Token verification failed:', error);
          localStorage.removeItem('auth_token');
          localStorage.removeItem('smartstudy_user');
          setUser(null);
        }
      } else if (savedUser) {
        // If there's no token but a cached user exists, clear it (user logged out)
        // Don't restore user without a valid token
        console.log('No token found but cached user exists - clearing stale cache');
        localStorage.removeItem('smartstudy_user');
        setUser(null);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  // Poll for notification updates when user is logged in
  useEffect(() => {
    if (!user) return;

    let isPolling = false;
    let pollTimeout: NodeJS.Timeout;
    const shownNotifications = new Set<string>(); // Track notifications that have been shown

    const pollNotifications = async () => {
      // Prevent concurrent polls
      if (isPolling) return;
      isPolling = true;

      try {
        // Check if we need fresh data (more than 20 seconds since last fetch)
        const now = new Date();
        const shouldFetchFresh = !lastProfileFetchRef.current || 
          (now.getTime() - lastProfileFetchRef.current.getTime()) > 20000; // 20 seconds
        
        const currentNotifications = user.notifications || [];
        let newNotifications = currentNotifications;
        
        if (shouldFetchFresh) {
          // For notification polling, check if there's a pending profile request
          if (profileRequestRef.current) {
            // Wait for existing request to complete
            await profileRequestRef.current;
            // Get updated notifications from user state (refreshUser updates it)
            newNotifications = user.notifications || [];
          } else {
            // Make fresh call for notifications
            const response = await usersAPI.getProfile();
            newNotifications = response.notifications || [];
            // Update user state with fresh notifications
            setUser(prev => prev ? { ...prev, notifications: newNotifications } : null);
            lastProfileFetchRef.current = new Date();
          }
        }

        // Get current notification IDs for comparison
        const currentIds = new Set(currentNotifications.map(n => n.id));
        const newIds = new Set(newNotifications.map(n => n.id));
        
        // Find truly new notifications (not just updated) AND not already shown
        const trulyNewNotifications = newNotifications.filter(n => 
          !currentIds.has(n.id) && !shownNotifications.has(n.id)
        );
        
        // Find newly read notifications (for better UX)
        const newlyReadNotifications = currentNotifications
          .filter(cn => !cn.isRead)
          .map(cn => {
            const updated = newNotifications.find(nn => nn.id === cn.id);
            return updated && updated.isRead ? updated : null;
          })
          .filter(Boolean);

        // Update user with new notifications
        if (trulyNewNotifications.length > 0 || newlyReadNotifications.length > 0) {
          setUser(prev => prev ? { ...prev, notifications: newNotifications } : null);
          setLastNotificationCheck(new Date());

          // Show browser notification for new unread notifications
          if (trulyNewNotifications.length > 0) {
            const unreadNew = trulyNewNotifications.filter(n => !n.isRead);
            
            if (unreadNew.length > 0 && 'Notification' in window) {
              // Mark these notifications as shown
              unreadNew.forEach(n => shownNotifications.add(n.id));

              // Request permission if not granted
              if ((window as any).Notification.permission === 'default') {
                (window as any).Notification.requestPermission().then((permission: string) => {
                  if (permission === 'granted' && unreadNew.length > 0) {
                    showBrowserNotification(unreadNew[0], unreadNew.length);
                  }
                });
              } else if ((window as any).Notification.permission === 'granted') {
                showBrowserNotification(unreadNew[0], unreadNew.length);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error polling notifications:', error);
        // On error, increase polling interval to avoid spamming
        pollTimeout = setTimeout(pollNotifications, 60000); // 1 minute on error
        isPolling = false;
        return;
      }

      isPolling = false;
      
      // Poll every 20 seconds (reduced from 30 for better responsiveness)
      pollTimeout = setTimeout(pollNotifications, 20000);
    };

    // Helper function to show browser notification
    const showBrowserNotification = (notification: any, count: number) => {
      try {
        const title = count > 1 ? `SmartStudy (${count} new)` : 'SmartStudy';
        const notif = new (window as any).Notification(title, {
          body: notification.message,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `smartstudy-${notification.id}`, // Unique tag per notification
          requireInteraction: false,
          silent: false // Allow sound
        });

        // Auto-close after 5 seconds
        setTimeout(() => notif.close(), 5000);

        // Click handler to focus window
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (error) {
        console.error('Failed to show browser notification:', error);
      }
    };

    // Initial poll
    pollNotifications();

    return () => {
      clearTimeout(pollTimeout);
    };
  }, [user?.id]); // Only depend on user ID to avoid unnecessary re-runs

  const login = async (emailOrUser: string | User, password?: string) => {
    // Handle OAuth login (User object passed directly)
    if (typeof emailOrUser === 'object' && emailOrUser.id) {
      const userData = emailOrUser as any; // Backend user format
      // Transform snake_case fields to camelCase to match User interface
      const transformedUser: User = {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        isPremium: userData.is_premium || userData.isPremium || false,
        bookmarks: userData.bookmarks || [],
        avatar: userData.avatar,
        preferences: userData.preferences,
        status: userData.status || 'Active',
        joinedDate: userData.created_at || userData.joinedDate,
        xp: userData.xp || 0,
        level: userData.level || 1,
        streak: userData.streak || 0,
        lastActiveDate: userData.last_active_date || userData.lastActiveDate || '',
        unlockedBadges: userData.unlocked_badges || userData.unlockedBadges || [],
        practiceAttempts: userData.practice_attempts || userData.practiceAttempts || 0,
        notifications: userData.notifications || []
      };
      setUser(transformedUser);
      // Save to localStorage for persistence
      localStorage.setItem('smartstudy_user', JSON.stringify(transformedUser));
      return;
    }

    // Handle regular email/password login
    const email = emailOrUser as string;
    try {
      const response = await authAPI.login(email, password!);
      localStorage.setItem('auth_token', response.token);
      // Transform snake_case fields to camelCase to match User interface
      const transformedUser = {
        ...response.user,
        isPremium: (response.user as any).is_premium,
        is_premium: undefined
      };
      setUser(transformedUser);
      // Save to localStorage for immediate access
      localStorage.setItem('smartstudy_user', JSON.stringify(transformedUser));
      // Load full profile including bookmarks
      await refreshUser();
      // Return the user for immediate access to role
      return transformedUser;
    } catch (error) {
      throw error;
    }
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      const response = await authAPI.register(name, email, password);
      localStorage.setItem('auth_token', response.token);
      // Transform snake_case fields to camelCase to match User interface
      const transformedUser = {
        ...response.user,
        isPremium: (response.user as any).is_premium,
        is_premium: undefined
      };
      setUser(transformedUser);
      // Load full profile including bookmarks
      await refreshUser();
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear all authentication data
      localStorage.removeItem('auth_token');
      localStorage.removeItem('smartstudy_user');
      setUser(null);
    }
  };

  const updateUser = async (data: Partial<User>) => {
    if (!user) return;

    try {
      const updatedUser = await usersAPI.updateProfile(data);
      // Preserve notifications from current user state if they're not in the response
      setUser({
        ...updatedUser,
        notifications: updatedUser.notifications || user.notifications || []
      });
    } catch (error) {
      console.error('Update user error:', error);
      throw error;
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    try {
      await usersAPI.changePassword(currentPassword, newPassword, confirmPassword);
    } catch (error) {
      console.error('Change password error:', error);
      throw error;
    }
  };

  const toggleBookmark = async (itemId: string, itemType: 'document' | 'video' = 'document') => {
    if (!user) return;

    const bookmarks = user.bookmarks || [];
    const isBookmarked = bookmarks.includes(itemId);

    // Optimistic update
    const newBookmarks = isBookmarked
      ? bookmarks.filter(id => id !== itemId)
      : [...bookmarks, itemId];

    setUser(prev => prev ? { ...prev, bookmarks: newBookmarks } : null);

    try {
      if (isBookmarked) {
        await usersAPI.removeBookmark(itemId, itemType);
      } else {
        await usersAPI.addBookmark(itemId, itemType);
      }

      // Dispatch custom event to notify other components (like Dashboard) to refresh
      window.dispatchEvent(new CustomEvent('bookmarksChanged'));
    } catch (error) {
      console.error('Toggle bookmark error:', error);
      // Revert optimistic update on error
      setUser(prev => prev ? { ...prev, bookmarks: bookmarks } : null);
      throw error;
    }
  };

  const gainXP = async (amount: number): Promise<{ leveledUp: boolean; newLevel: number }> => {
    if (!user) return { leveledUp: false, newLevel: 1 };

    try {
      const result = await usersAPI.gainXP(amount);
      await refreshUser(); // Refresh user data
      // Ensure consistent return type
      return {
        leveledUp: result.leveledUp,
        newLevel: result.level || 1
      };
    } catch (error) {
      console.error('Gain XP error:', error);
      throw error;
    }
  };

  const markNotificationsAsRead = async (notificationIds?: string[]) => {
    if (!user) return;

    try {
      await usersAPI.markNotificationsRead(notificationIds);
      await refreshUser(); // Refresh user data
    } catch (error) {
      console.error('Mark notifications read error:', error);
      throw error;
    }
  };

  const deleteNotification = async (notificationId: string) => {
    if (!user) return;

    try {
      await usersAPI.deleteNotification(notificationId);
      await refreshUser(); // Refresh user data
    } catch (error) {
      console.error('Delete notification error:', error);
      throw error;
    }
  };

  const refreshUser = useCallback(async (force = false) => {
    // Do nothing if there's no auth token
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return;
    }

    // Check if we have a recent fetch (within cache duration) and not forcing
    const now = new Date();
    if (!force && lastProfileFetchRef.current) {
      const timeSinceLastFetch = now.getTime() - lastProfileFetchRef.current.getTime();
      if (timeSinceLastFetch < PROFILE_CACHE_DURATION && profileRequestRef.current) {
        // Return the existing promise if it's still pending
        return profileRequestRef.current;
      }
    }

    // If there's already a pending request, return it instead of making a new one
    if (profileRequestRef.current && !force) {
      return profileRequestRef.current;
    }

    try {
      // Create and store the promise
      const profilePromise = usersAPI.getProfile();
      profileRequestRef.current = profilePromise;
      
      const response = await profilePromise;
      // Transform snake_case fields to camelCase to match User interface
      const transformedUser = {
        ...response,
        isPremium: (response as any).is_premium,
        // Remove the snake_case field to avoid confusion
        is_premium: undefined
      };
      setUser(transformedUser);
    } catch (error) {
      console.error('Refresh user error:', error);
      // If refresh fails, user might be logged out
      if ((error as any).message?.includes('401') || (error as any).message?.includes('403')) {
        localStorage.removeItem('auth_token');
        setUser(null);
      }
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      register,
      updateUser,
      changePassword,
      toggleBookmark,
      gainXP,
      markNotificationsAsRead,
      deleteNotification,
      refreshUser,
      isAuthenticated: !!user,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};