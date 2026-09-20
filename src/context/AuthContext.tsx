import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, NotificationItem, UserRole } from '../types';
import { authAPI, usersAPI, broadcastSessionExpired } from '../services/api';
import { diffNotifications, snapshotNotifications, type NotifLite } from '../utils/notifications';

interface AuthContextType {
  user: User | null;
  login: (emailOrUser: string | User, password?: string) => Promise<User | void>;
  register: (name: string, email: string, password: string, grade?: number, referralCode?: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<User>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  toggleBookmark: (itemId: string, itemType?: 'document' | 'video') => Promise<void>;
  markNotificationsAsRead: (notificationIds?: string[]) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  // force=true bypasses the 30s profile cache — required after any mutation
  // (XP awards, mark-read) or the UI would show pre-mutation state.
  refreshUser: (force?: boolean) => Promise<User | undefined>;
  isAuthenticated: boolean;
  isLoading: boolean;
  // Notifications-only refresh for the bell, the 60s poll, and mark-read
  // flows: same list the profile carries, without the user row + bookmarks
  // those callers never read. 15s floor (except force) so rapid bell
  // toggles don't refetch; mutations pass force for immediate truth.
  refreshNotifications: (force?: boolean) => Promise<{ notifications: any[]; unreadCount: number } | undefined>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to normalize role from backend (string) to frontend enum
const normalizeRole = (role: any): UserRole => {
  const roleStr = String(role || '').toUpperCase();
  if (roleStr === 'ADMIN') return UserRole.ADMIN;
  if (roleStr === 'MODERATOR') return UserRole.MODERATOR;
  if (roleStr === 'TUTOR') return UserRole.TUTOR;
  return UserRole.STUDENT;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Request deduplication - prevent multiple simultaneous calls
  const profileRequestRef = useRef<Promise<any> | null>(null);
  const lastProfileFetchRef = useRef<Date | null>(null);
  const PROFILE_CACHE_DURATION = 30000; // 30 seconds cache (increased to reduce API calls)
  const networkErrorShownRef = useRef(false); // Track if we've shown network error notification

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      const savedUser = localStorage.getItem('smartstudy_user');

      // Stale-while-revalidate boot: a cached user renders instantly instead
      // of gating first paint behind verify()+retries (up to ~7s on flaky
      // networks). Verify still runs below in the background and corrects or
      // evicts the session. No cache -> classic loading gate.
      let renderedFromCache = false;
      if (token && savedUser) {
        try {
          const cachedUser = JSON.parse(savedUser);
          if (cachedUser && cachedUser.role) cachedUser.role = normalizeRole(cachedUser.role);
          setUser(cachedUser);
          renderedFromCache = true;
        } catch {
          // Corrupt cache — fall through to the verifying gate.
        }
      }
      if (!renderedFromCache) {
        // Start with loading true - this ensures skeleton shows during retries
        setIsLoading(true);
      }

      if (token) {
        try {
          // Background revalidation (SWR): the apiRequest retries up to 3
          // times (1s, 2s, 4s). With a warm cache the app is already
          // rendered; without one the Loader gate above stays up throughout.
          const response = await authAPI.verify();
          const userData = response.user as any; // Backend user format
          // Transform snake_case fields to camelCase to match User interface
          // Normalize role to enum value
          const normalizedRole = normalizeRole(userData.role);
          
          const transformedUser: User = {
            id: userData.id,
            name: userData.name,
            email: userData.email,
            role: normalizedRole,
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
        grade: userData.grade ?? null,
        premiumSince: userData.premium_since || userData.premiumSince || null,
            notifications: userData.notifications || [],
            // Server-side exact unread total (see users profile) — Layout falls back to counting.
            unreadCount: userData.unread_count ?? userData.unreadCount,
            hasPassword: userData.has_password ?? userData.hasPassword
          };
          setUser(transformedUser);
          // Save to localStorage for persistence
          localStorage.setItem('smartstudy_user', JSON.stringify(transformedUser));
          // Reset network error flag on successful connection
          networkErrorShownRef.current = false;
          // Load full profile including bookmarks (force refresh on initial load)
          try {
            await refreshUser(true);
          } catch (refreshError) {
            // If refresh fails, that's okay - we have the user data from verify
            console.warn('Profile refresh failed, but user is authenticated:', refreshError);
          }
        } catch (error: any) {
          console.error('Token verification failed:', error);
          
          // Check if it's a network/timeout error
          // Also check for 500 errors which often indicate backend connection issues
          const errorStatus = error?.status || error?.response?.status;
          const is500Error = errorStatus === 500 || errorStatus >= 500;
          const errorMessage = (error?.message || '').toLowerCase();
          
          const isNetworkError = error?.isTimeout || 
                                 error?.isNetworkError || 
                                 is500Error || // 500+ errors usually mean backend can't reach DB
                                 errorMessage.includes('timeout') ||
                                 errorMessage.includes('fetch failed') ||
                                 errorMessage.includes('networkerror') ||
                                 errorMessage.includes('failed to fetch') ||
                                 errorMessage.includes('connection timeout') ||
                                 errorMessage.includes('und_err_connect_timeout') ||
                                 (errorMessage.includes('authentication failed') && is500Error) || // "Authentication failed" from 500 = DB connection issue
                                 error?.originalError?.message?.toLowerCase().includes('timeout') ||
                                 error?.originalError?.message?.toLowerCase().includes('und_err_connect_timeout');
          
          // Only clear auth data if it's a real authentication error (401, 403, invalid token)
          // NOT for 500 errors or network issues
          const isRealAuthError = (error?.message?.includes('401') || 
                                   error?.message?.includes('403') || 
                                   error?.message?.includes('Unauthorized') ||
                                   error?.message?.includes('Invalid token') ||
                                   error?.message?.includes('Token expired') ||
                                   error?.message?.includes('Access token required')) &&
                                   !error?.message?.toLowerCase().includes('authentication failed'); // "Authentication failed" from 500 is not a real auth error
          
          if (isRealAuthError) {
            // Real auth error — same channel as the api layer's 401 handling
            // (single broadcast: stamp + clear + toast + return URL). Never
            // clear silently here: that path wins the race against the
            // broadcast and strands the user on `/` with no explanation.
            broadcastSessionExpired();
            profileRequestRef.current = null;
            lastProfileFetchRef.current = null;
            setUser(null);
          } else if (savedUser) {
            // For network/timeout/500 errors, restore cached user data
            console.warn('Network/backend error during token verification, restoring cached user data');
            try {
              const cachedUser = JSON.parse(savedUser);
              // Normalize role in cached user
              if (cachedUser && cachedUser.role) {
                cachedUser.role = normalizeRole(cachedUser.role);
              }
              setUser(cachedUser);
              // Show notification to user (only once per session)
              if (!networkErrorShownRef.current) {
                networkErrorShownRef.current = true;
                // Single toast: the dispatcher/event fallback already handles
                // provider readiness. (Previously this fired 4 stacked copies
                // via staggered timeouts on every backend outage.)
                const showToast = () => {
                  // Try global dispatcher first (set by ToastProvider)
                  if ((window as any).__toastDispatcher) {
                    (window as any).__toastDispatcher(
                      'Connection issue detected. Using offline mode. Some features may be limited.',
                      'warning'
                    );
                  } else {
                    // Fallback: use custom event
                    const event = new CustomEvent('show-toast', {
                      detail: {
                        message: 'Connection issue detected. Using offline mode. Some features may be limited.',
                        type: 'warning'
                      }
                    });
                    window.dispatchEvent(event);
                  }
                };
                showToast();
              }
            } catch (parseError) {
              console.error('Failed to parse cached user:', parseError);
            }
          }
        } finally {
          // Always set loading to false after all retries are done
          // This happens after ~7 seconds (1s + 2s + 4s retry delays) if all retries fail
          setIsLoading(false);
        }
      } else if (savedUser) {
        // Token gone but a cached user remains (multi-tab logout, evicted
        // storage): a dead session the UI still believes in. Same broadcast
        // channel as every other 401 path — toast + return URL — never a
        // silent clear (which strands the user on `/` with no explanation).
        broadcastSessionExpired();
        setUser(null);
        setIsLoading(false);
      } else {
        // No token and no saved user - user is not logged in
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Poll for notification updates when user is logged in
  useEffect(() => {
    if (!user) return;

    let isPolling = false;
    let pollTimeout: ReturnType<typeof setTimeout>;
    // Stable snapshot of the last SEEN list (id -> isRead), owned by this
    // account (the effect re-runs on account switch, which reseeds it).
    // Every poll diffs the FRESH fetch against this — never against the
    // render closure, which freezes at login time.
    let prevSnapshot: Map<string, boolean> | null = null;

    const pollNotifications = async () => {
      // Prevent concurrent polls
      if (isPolling) return;
      isPolling = true;

      try {
        // Notifications-only cadence (was: full profile every 60s). The
        // 15s floor inside refreshNotifications also absorbs races with
        // bell opens and mark-read refreshes.
        const data = await refreshNotifications();
        const freshList = ((data?.notifications ?? []) as NotifLite[]);
        if (prevSnapshot === null) {
          // First poll seeds the baseline silently: everything already on
          // screen is "known", so login doesn't detonate a toast burst.
          prevSnapshot = snapshotNotifications(freshList);
        } else {
          const { trulyNew: trulyNewNotifications, newlyRead: newlyReadNotifications } =
            diffNotifications(prevSnapshot, freshList);
          prevSnapshot = snapshotNotifications(freshList);

          // Notify for arrivals (refreshUser already merged the fresh list
          // into state, so no setUser needed here).
          if (trulyNewNotifications.length > 0) {
            const unreadNew = trulyNewNotifications.filter(n => !n.isRead);

            if (unreadNew.length > 0 && 'Notification' in window) {
              // No shown-set needed: the snapshot above already records these
              // ids, so a repeat can never re-toast.

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
      } catch (error: any) {
        console.error('Error polling notifications:', error);
        // On network/timeout errors, increase polling interval significantly to avoid spamming
        // For other errors, use a shorter interval
        const delay = (error?.isTimeout || error?.isNetworkError) ? 120000 : 60000; // 2 minutes for network errors, 1 minute for others
        pollTimeout = setTimeout(pollNotifications, delay);
        isPolling = false;
        return;
      }

      isPolling = false;
      
      // Poll every 60 seconds (increased to reduce API calls)
      pollTimeout = setTimeout(pollNotifications, 60000);
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
        role: normalizeRole(userData.role),
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
        grade: userData.grade ?? null,
        premiumSince: userData.premium_since || userData.premiumSince || null,
        notifications: userData.notifications || [],
        // Server-side exact unread total (see users profile) — Layout falls back to counting.
        unreadCount: userData.unread_count ?? userData.unreadCount,
        hasPassword: userData.has_password ?? userData.hasPassword
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
      if ((response as any).refreshToken) {
        localStorage.setItem('refresh_token', (response as any).refreshToken);
      }
      // Transform snake_case fields to camelCase to match User interface
      const userData = response.user as any;
      const transformedUser: User = {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role: normalizeRole(userData.role),
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
        grade: userData.grade ?? null,
        premiumSince: userData.premium_since || userData.premiumSince || null,
        notifications: userData.notifications || [],
        // Server-side exact unread total (see users profile) — Layout falls back to counting.
        unreadCount: userData.unread_count ?? userData.unreadCount,
        hasPassword: userData.has_password ?? userData.hasPassword
      };
      setUser(transformedUser);
      // Save to localStorage for immediate access
      localStorage.setItem('smartstudy_user', JSON.stringify(transformedUser));
      // Load full profile including bookmarks (forced: credentials just
      // changed, so no cache entry can be trusted here)
      await refreshUser(true);
      // Return the user for immediate access to role
      return transformedUser;
    } catch (error) {
      throw error;
    }
  };

  const register = async (name: string, email: string, password: string, grade?: number, referralCode?: string): Promise<void> => {
    try {
      const response = await authAPI.register(name, email, password, grade, referralCode);

      // If no token is returned, email verification is required
      if (!response.token) {
        // Don't set user or token - user needs to verify email first
        // The response.message will contain the verification message
        return;
      }

      // Token exists - email already verified (shouldn't happen in normal flow, but handle it)
      localStorage.setItem('auth_token', response.token);
      if ((response as any).refreshToken) {
        localStorage.setItem('refresh_token', (response as any).refreshToken);
      }
      // Transform snake_case fields to camelCase to match User interface
      const transformedUser = {
        ...response.user,
        isPremium: (response.user as any).is_premium,
        is_premium: undefined
      };
      setUser(transformedUser);
      // Load full profile including bookmarks (forced: credentials just
      // changed, so no cache entry can be trusted here)
      await refreshUser(true);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Ask backend to revoke the refresh token (best-effort)
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        authAPI.logout(refreshToken).catch(() => { /* non-blocking */ });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear all authentication data — including the profile cache refs,
      // or the next account to sign in on this browser would inherit the
      // previous account's fetch timestamp and skip its own profile load.
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('smartstudy_user');
      profileRequestRef.current = null;
      lastProfileFetchRef.current = null;
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

  const markNotificationsAsRead = async (notificationIds?: string[]) => {
    if (!user) return;

    try {
      await usersAPI.markNotificationsRead(notificationIds);
      // Notifications-only refresh: the full profile fetch here was pure
      // overhead (user row + bookmarks just to flip read flags).
      await refreshNotifications(true);
    } catch (error) {
      console.error('Mark notifications read error:', error);
      throw error;
    }
  };

  const deleteNotification = async (notificationId: string) => {
    if (!user) return;

    try {
      await usersAPI.deleteNotification(notificationId);
      // Forced, same reason as above.
      await refreshNotifications(true);
    } catch (error) {
      console.error('Delete notification error:', error);
      throw error;
    }
  };

  const lastNotificationsFetchRef = useRef<Date | null>(null);
  const NOTIFICATIONS_CACHE_DURATION = 15000;

  const refreshNotifications = useCallback(async (force = false) => {
    if (!localStorage.getItem('auth_token')) return;
    const now = new Date();
    if (!force && lastNotificationsFetchRef.current) {
      if (now.getTime() - lastNotificationsFetchRef.current.getTime() < NOTIFICATIONS_CACHE_DURATION) {
        return;
      }
    }
    try {
      const data = await usersAPI.getNotifications();
      lastNotificationsFetchRef.current = new Date();
      setUser(prev => {
        if (!prev) return prev;
        const next = { ...prev, notifications: data.notifications, unreadCount: data.unreadCount };
        try {
          if (JSON.stringify(next) !== JSON.stringify(prev)) {
            localStorage.setItem('smartstudy_user', JSON.stringify(next));
            return next;
          }
        } catch {
          return next;
        }
        return prev;
      });
      return data;
    } catch (error: any) {
      console.error('Refresh notifications error:', error);
      if (error?.message?.includes('401') || error?.message?.includes('403') || error?.message?.includes('Unauthorized')) {
        broadcastSessionExpired();
        setUser(null);
      }
      throw error;
    }
  }, []);

  const refreshUser = useCallback(async (force = false) => {
    // Do nothing if there's no auth token
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return;
    }

    // Check if we have a recent fetch (within cache duration) and not forcing.
    // A fresh cache means no fetch at all (this fn returns void) — the
    // previous version only reused a still-pending promise, so the 30s cache
    // never hit and every caller paid a full profile round-trip.
    const now = new Date();
    if (!force && lastProfileFetchRef.current) {
      const timeSinceLastFetch = now.getTime() - lastProfileFetchRef.current.getTime();
      if (timeSinceLastFetch < PROFILE_CACHE_DURATION) {
        return;
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
      const userData = response as any;
      // Transform snake_case fields to camelCase to match User interface
      const transformedUser: User = {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        role: normalizeRole(userData.role),
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
        grade: userData.grade ?? null,
        premiumSince: userData.premium_since || userData.premiumSince || null,
        notifications: userData.notifications || [],
        // Server-side exact unread total (see users profile) — Layout falls back to counting.
        unreadCount: userData.unread_count ?? userData.unreadCount,
        hasPassword: userData.has_password ?? userData.hasPassword
      };
      // Skip identical updates: the 60s notification poll (and every other
      // refreshUser caller) mints a fresh object identity per fetch, which
      // re-fires every [user]-keyed effect app-wide (the AI chat session
      // list refetched in a loop this way). Compared against the persisted
      // snapshot — same bytes, no state update, no rerender cascade.
      // Anything actually changed still flows through untouched.
      let identical = false;
      try {
        identical = JSON.stringify(transformedUser) === localStorage.getItem('smartstudy_user');
      } catch {
        // Storage unavailable (private mode): always update state.
      }
      if (!identical) {
        setUser(transformedUser);
        try {
          localStorage.setItem('smartstudy_user', JSON.stringify(transformedUser));
        } catch {
          // ignore private-mode write failures
        }
      }
      // Update last fetch time after successful fetch
      lastProfileFetchRef.current = new Date();
      // Returned (not just set) so the notification poll can diff the FRESH
      // list instead of the render closure's stale one.
      return transformedUser;
    } catch (error: any) {
      console.error('Refresh user error:', error);
      // If refresh fails due to auth error, the account is gone/blocked —
      // same broadcast channel as above (never a silent clear).
      if (error?.message?.includes('401') || error?.message?.includes('403') || error?.message?.includes('Unauthorized')) {
        broadcastSessionExpired();
        setUser(null);
      } else if (error?.isTimeout || error?.isNetworkError) {
        // For timeout/network errors, keep existing user data and don't throw
        // This allows the app to continue working with cached data
        console.warn('Network error during user refresh, keeping existing user data');
        // Clear the request ref so we can retry later
        profileRequestRef.current = null;
        lastProfileFetchRef.current = null;
      }
    } finally {
      // Always clear the request ref after completion
      profileRequestRef.current = null;
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
      markNotificationsAsRead,
      deleteNotification,
      refreshUser,
      refreshNotifications,
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