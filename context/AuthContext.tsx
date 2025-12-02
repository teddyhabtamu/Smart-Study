import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from './types';

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
  toggleBookmark: (itemId: string) => void;
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
        // Ensure bookmarks exists on loaded user
        if (!parsedUser.bookmarks) parsedUser.bookmarks = [];
        setUser(parsedUser);
      } catch (e) {
        console.error("Failed to parse user data", e);
        localStorage.removeItem('smartstudy_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = (userData: User) => {
    // Ensure bookmarks array exists
    const userWithBookmarks = { ...userData, bookmarks: userData.bookmarks || [] };
    setUser(userWithBookmarks);
    localStorage.setItem('smartstudy_user', JSON.stringify(userWithBookmarks));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('smartstudy_user');
  };

  const updateUser = (data: Partial<User>) => {
    setUser((prev) => {
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
      newBookmarks = bookmarks.filter(id => id !== itemId);
    } else {
      newBookmarks = [...bookmarks, itemId];
    }

    updateUser({ bookmarks: newBookmarks });
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      updateUser, 
      toggleBookmark,
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