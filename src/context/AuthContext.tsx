import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Notification } from '../types';

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
  toggleBookmark: (itemId: string) => void;
  gainXP: (amount: number) => { leveledUp: boolean; newLevel: number };
  markNotificationsAsRead: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('smartstudy_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        // Ensure structure consistency for older data
        if (!parsedUser.bookmarks) parsedUser.bookmarks = [];
        if (parsedUser.xp === undefined) parsedUser.xp = 0;
        if (parsedUser.level === undefined) parsedUser.level = 1;
        if (parsedUser.streak === undefined) parsedUser.streak = 0;
        if (!parsedUser.lastActiveDate) parsedUser.lastActiveDate = new Date().toISOString().split('T')[0];
        if (!parsedUser.unlockedBadges) parsedUser.unlockedBadges = ['b1'];
        if (parsedUser.practiceAttempts === undefined) parsedUser.practiceAttempts = 0;
        
        // Add default notifications if missing
        if (!parsedUser.notifications) {
            parsedUser.notifications = [
                {
                    id: 'n1',
                    title: 'Welcome to SmartStudy!',
                    message: 'Complete your profile to earn your first badge.',
                    type: 'info',
                    isRead: false,
                    date: new Date().toISOString()
                }
            ];
        }

        // Check Streak Logic on Load
        const today = new Date().toISOString().split('T')[0];
        if (parsedUser.lastActiveDate !== today) {
          const lastActive = new Date(parsedUser.lastActiveDate);
          const diffTime = Math.abs(new Date(today).getTime() - lastActive.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
          
          if (diffDays === 1) {
             // Consecutive day
             parsedUser.streak += 1;
          } else if (diffDays > 1) {
             // Streak broken
             parsedUser.streak = 1;
          }
          // If diffDays is 0 (same day), do nothing
          
          parsedUser.lastActiveDate = today;
          localStorage.setItem('smartstudy_user', JSON.stringify(parsedUser));
        }
        
        setUser(parsedUser);
      } catch (e) {
        console.error("Failed to parse user data", e);
        localStorage.removeItem('smartstudy_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = (userData: User) => {
    // Ensure all gamification fields exist
    const userWithDefaults: User = { 
      ...userData, 
      bookmarks: userData.bookmarks || [],
      xp: userData.xp || 0,
      level: userData.level || 1,
      streak: userData.streak || 1,
      lastActiveDate: new Date().toISOString().split('T')[0],
      unlockedBadges: userData.unlockedBadges || ['b1'],
      practiceAttempts: userData.practiceAttempts || 0,
      notifications: userData.notifications || [
         {
            id: 'n1',
            title: 'Welcome to SmartStudy!',
            message: 'We are glad to have you here. Start learning!',
            type: 'success',
            isRead: false,
            date: new Date().toISOString()
         }
      ]
    };
    setUser(userWithDefaults);
    localStorage.setItem('smartstudy_user', JSON.stringify(userWithDefaults));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('smartstudy_user');
  };

  const updateUser = (data: Partial<User>) => {
    setUser((prev: User | null) => {
      if (!prev) return null;
      const updated = { ...prev, ...data };
      localStorage.setItem('smartstudy_user', JSON.stringify(updated));
      return updated;
    });
  };

  const toggleBookmark = (itemId: string) => {
    if (!user) return;

    const bookmarks = user.bookmarks || [];
    const isBookmarked = bookmarks.includes(itemId);
    
    let newBookmarks;
    if (isBookmarked) {
      newBookmarks = bookmarks.filter((id: string) => id !== itemId);
    } else {
      newBookmarks = [...bookmarks, itemId];
    }

    updateUser({ bookmarks: newBookmarks });
  };

  const gainXP = (amount: number) => {
    if (!user) return { leveledUp: false, newLevel: 1 };
    
    const newXP = user.xp + amount;
    const newLevel = Math.floor(newXP / 1000) + 1;
    const leveledUp = newLevel > user.level;

    let updatedNotifications = [...user.notifications];
    
    if (leveledUp) {
        updatedNotifications.unshift({
            id: 'lvl-' + Date.now(),
            title: 'Level Up!',
            message: `Congratulations! You reached Level ${newLevel}.`,
            type: 'success',
            isRead: false,
            date: new Date().toISOString()
        });
    }

    updateUser({ 
        xp: newXP, 
        level: newLevel,
        notifications: updatedNotifications
    });
    
    return { leveledUp, newLevel };
  };

  const markNotificationsAsRead = () => {
    if (!user) return;
    const updated = user.notifications.map(n => ({ ...n, isRead: true }));
    updateUser({ notifications: updated });
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      updateUser, 
      toggleBookmark,
      gainXP,
      markNotificationsAsRead,
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