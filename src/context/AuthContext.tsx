import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Notification } from '../types';
import { authAPI, usersAPI } from '../services/api';

interface AuthContextType {
  user: User | null;
  login: (emailOrUser: string | User, password?: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  toggleBookmark: (itemId: string, itemType?: 'document' | 'video') => Promise<void>;
  gainXP: (amount: number) => Promise<{ leveledUp: boolean; newLevel: number }>;
  markNotificationsAsRead: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          // Load full profile including bookmarks
          await refreshUser();
        } catch (error) {
          console.error('Token verification failed:', error);
          localStorage.removeItem('auth_token');
          localStorage.removeItem('smartstudy_user');
          setUser(null);
        }
      } else if (savedUser) {
        // If there's no token but a cached user, hydrate from cache without remote calls
        try {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
        } catch (error) {
          console.error('Failed to parse saved user:', error);
          localStorage.removeItem('smartstudy_user');
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

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
      // Load full profile including bookmarks
      await refreshUser();
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
      localStorage.removeItem('auth_token');
      setUser(null);
    }
  };

  const updateUser = async (data: Partial<User>) => {
    if (!user) return;

    try {
      const updatedUser = await usersAPI.updateProfile(data);
      setUser(updatedUser);
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

      // No need to refresh user data for bookmarks since we use optimistic updates
      // The bookmarks will be correct on next page load
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

  const markNotificationsAsRead = async () => {
    if (!user) return;

    try {
      await usersAPI.markNotificationsRead();
      await refreshUser(); // Refresh user data
    } catch (error) {
      console.error('Mark notifications read error:', error);
      throw error;
    }
  };

  const refreshUser = useCallback(async () => {
    // Do nothing if there's no auth token
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return;
    }

    try {
      const response = await usersAPI.getProfile();
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