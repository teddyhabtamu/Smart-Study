import { User, Document, Video, ForumPost, ForumComment, ChatSession, StudyEvent, Badge } from '../types';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Helper function to get auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

// Refresh an expired access token using the stored refresh token.
// Returns true on success. On failure, clears credentials (forces re-login).
const refreshAccessToken = async (): Promise<'ok' | 'rejected' | 'unreachable'> => {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return 'rejected';

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return 'rejected';

    const data = await response.json();
    if (data?.success && data?.token) {
      localStorage.setItem('auth_token', data.token);
      if (data.refreshToken) {
        localStorage.setItem('refresh_token', data.refreshToken);
      }
      if (data.user) {
        localStorage.setItem('smartstudy_user', JSON.stringify(data.user));
      }
      return 'ok';
    }
    return 'rejected';
  } catch {
    // Transport failure (offline, timeout): NOT a dead session — callers
    // must neither clear credentials nor cry "expired" for this.
    return 'unreachable';
  }
};

// Clear stored credentials (used when refresh fails)
const clearCredentials = (): void => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('smartstudy_user');
};

// The UI can believe it is logged in (stored user) while holding no usable
// token: multi-tab logout, evicted storage, or a refresh that died. Any 401
// in that state is a dead session, not a message to display.
const hasStoredSession = (): boolean => {
  try {
    return !!localStorage.getItem('smartstudy_user');
  } catch {
    return false;
  }
};

// Single choke point for "the session is definitively dead": clear + tell
// the app to explain and preserve the return URL. The layout's
// SessionExpiredHandler throttles repeat broadcasts, so concurrent 401s
// can't stack toasts or bounce off the login page. Exported so AuthContext's
// own 401 sniffing (verify/refresh paths) uses the same channel instead of
// clearing silently — a silent clear races this broadcast, wins, and strands
// the user on `/` with no message (the stamp never gets set).
export const broadcastSessionExpired = (): void => {
  clearCredentials();
  window.dispatchEvent(new CustomEvent('session-expired'));
};

// Helper function to create headers
const getHeaders = (includeAuth: boolean = true): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (includeAuth) {
    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return headers;
};

// Helper function to check if error is a connection timeout
const isConnectionTimeoutError = (error: any): boolean => {
  if (!error) return false;

  const errorMessage = (error.message || error.toString() || '').toLowerCase();
  const errorDetails = (error.details || '').toLowerCase();
  const errorCause = error.cause || '';

  // Check for various timeout error patterns (case-insensitive)
  return (
    errorMessage.includes('timeout') ||
    errorMessage.includes('connect timeout') ||
    errorMessage.includes('und_err_connect_timeout') ||
    errorMessage.includes('fetch failed') ||
    errorDetails.includes('connect timeout') ||
    errorDetails.includes('und_err_connect_timeout') ||
    errorDetails.includes('fetch failed') ||
    errorCause?.message?.toLowerCase().includes('timeout') ||
    errorCause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    error.name === 'AbortError' ||
    error.name === 'TimeoutError'
  );
};

// Helper function to check if error is a network error (should retry)
const isNetworkError = (error: any): boolean => {
  if (!error) return false;

  const errorMessage = error.message || error.toString() || '';

  return (
    isConnectionTimeoutError(error) ||
    errorMessage.includes('fetch failed') ||
    errorMessage.includes('NetworkError') ||
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('network') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ENOTFOUND')
  );
};

// Last-resort display mapping for technical error text. Runs ONLY on the
// human-facing message — error.code / error.status / error.data (which
// AuthContext, Planner, Community and others branch on) pass through
// untouched. Deliberately narrow: auth texts ('401', 'Invalid token',
// 'Access token required', …) are sniffed elsewhere for session cleanup and
// must never be rewritten here. Backend's own friendly sentences ("Daily AI
// limit reached…") pass through byte-identical.
const sanitizeTechnicalMessage = (message: string): string => {
  const m = (message || '').trim();
  if (!m) return 'Something went wrong. Please try again.';
  if (/^HTTP 5\d\d\b/i.test(m) || /^internal server error\b/i.test(m)) {
    return 'Something went wrong on our side. Please try again in a moment.';
  }
  return m;
};

// Helper function to get user-friendly error message
const getUserFriendlyErrorMessage = (error: any, endpoint: string): string => {
  if (isConnectionTimeoutError(error)) {
    return 'Connection timeout. The server is taking too long to respond. Please check your internet connection and try again.';
  }

  if (isNetworkError(error)) {
    return 'Network error. Please check your internet connection and try again.';
  }

  // Return original error message if available
  if (error?.message) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again later.';
};

// Helper function to handle API responses
const handleResponse = async <T>(response: Response): Promise<T> => {
  // Check if response is ok before trying to parse JSON
  if (!response.ok) {
    const is500Error = response.status >= 500;
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      // If JSON parsing fails, create a basic error
      const error = new Error(sanitizeTechnicalMessage(`HTTP ${response.status}: ${response.statusText}`));
      // 500+ errors usually indicate backend/database connection issues
      if (is500Error) {
        (error as any).isNetworkError = true;
        (error as any).status = response.status;
      }
      throw error;
    }

    // Handle validation errors from express-validator
    if (errorData.errors && Array.isArray(errorData.errors)) {
      const errorMessages = errorData.errors.map((error: any) =>
        error.msg || error.message || 'Validation error'
      ).join(', ');
      throw new Error(errorMessages);
    }

    // Handle general error messages
    if (errorData.message) {
      const error = new Error(sanitizeTechnicalMessage(errorData.message));
      if (errorData.code) {
        (error as any).code = errorData.code;
      }
      // Carry structured error payloads (e.g. USER_EXISTS ships the existing
      // user's profile) so callers can offer next-step actions.
      if (errorData.data !== undefined) {
        (error as any).data = errorData.data;
      }
      // Check if the error message indicates a timeout/network issue
      const messageLower = errorData.message.toLowerCase();
      // 500 errors often mean backend can't reach database (network issue)
      // "Authentication failed" from backend usually means it can't connect to DB
      if (is500Error ||
        messageLower.includes('timeout') ||
        messageLower.includes('fetch failed') ||
        messageLower.includes('connect timeout') ||
        messageLower.includes('und_err_connect_timeout') ||
        (messageLower.includes('authentication failed') && is500Error)) {
        (error as any).isTimeout = messageLower.includes('timeout');
        (error as any).isNetworkError = true;
        (error as any).status = response.status;
      }
      // Also check details if available
      if (errorData.details) {
        const detailsLower = errorData.details.toLowerCase();
        if (detailsLower.includes('timeout') ||
          detailsLower.includes('connect timeout') ||
          detailsLower.includes('und_err_connect_timeout')) {
          (error as any).isTimeout = true;
          (error as any).isNetworkError = true;
        }
      }
      throw error;
    }

    const error = new Error(sanitizeTechnicalMessage(`HTTP ${response.status}: ${response.statusText}`));
    // 500+ errors usually indicate backend/database connection issues
    if (response.status >= 500) {
      (error as any).isNetworkError = true;
      (error as any).status = response.status;
    }
    throw error;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    // If response is ok but JSON parsing fails, return empty object
    return {} as T;
  }

  // Check if the response indicates an error (success: false)
  if (data.success === false) {
    // Handle validation errors from express-validator
    if (data.errors && Array.isArray(data.errors)) {
      const errorMessages = data.errors.map((error: any) =>
        error.msg || error.message || 'Validation error'
      ).join(', ');
      throw new Error(errorMessages);
    }

    // Handle general error messages
    if (data.message) {
      const error = new Error(sanitizeTechnicalMessage(data.message));
      // Carry machine-readable backend codes (e.g. FREE_LIMIT_REACHED) so
      // callers can branch instead of string-matching messages.
      if (data.code) {
        (error as any).code = data.code;
      }
      // Carry structured error payloads (mirrors the !response.ok branch).
      if (data.data !== undefined) {
        (error as any).data = data.data;
      }
      // Check if the error message indicates a timeout/network issue
      const messageLower = data.message.toLowerCase();
      // Note: We can't check response.status here since response is already parsed
      // But we can check if it's a generic error that often indicates backend issues
      if (messageLower.includes('timeout') ||
        messageLower.includes('fetch failed') ||
        messageLower.includes('connect timeout') ||
        messageLower.includes('und_err_connect_timeout') ||
        (messageLower.includes('authentication failed') && !messageLower.includes('invalid'))) {
        // "Authentication failed" from backend often means it can't reach DB
        (error as any).isTimeout = messageLower.includes('timeout');
        (error as any).isNetworkError = true;
      }
      // Also check details if available
      if (data.details) {
        const detailsLower = data.details.toLowerCase();
        if (detailsLower.includes('timeout') ||
          detailsLower.includes('connect timeout') ||
          detailsLower.includes('und_err_connect_timeout')) {
          (error as any).isTimeout = true;
          (error as any).isNetworkError = true;
        }
      }
      throw error;
    }

    throw new Error('An error occurred');
  }

  // If the response has success: true and data property, return the data
  if (data.success === true && data.data !== undefined) {
    return data.data as T;
  }

  // Otherwise return the data directly (for auth endpoints, etc.)
  return data;
};

// Helper function to create a timeout signal (with fallback for older browsers)
const createTimeoutSignal = (timeoutMs: number): AbortSignal => {
  // Use AbortSignal.timeout if available (modern browsers)
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return AbortSignal.timeout(timeoutMs);
  }

  // Fallback for older browsers
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
};

// Generic API request function with retry logic
const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {},
  includeAuth: boolean = true,
  retries: number = 3,
  retryDelay: number = 1000,
  // Skip the 401 -> refresh-token dance. Endpoints whose 401s are
  // APPLICATION errors (wrong deletion password/code) must opt out: the
  // interceptor would otherwise "refresh" a valid session and, worse, retry
  // the request (double-spending code attempts) or log the user out when the
  // refresh fails — all because of a typo.
  skipAuthRefresh: boolean = false,
  // Per-call timeout (default 30s). Long AI generations (study plan) opt
  // into 55s: the server answers those in <30s by budget, but thin mobile
  // networks need the extra headroom past the 30s default.
  timeoutMs: number = 30000,
): Promise<T> => {
  const url = `${API_BASE_URL}${endpoint}`;

  // Create timeout signal (default 30 seconds)
  const timeoutSignal = createTimeoutSignal(timeoutMs);

  // Merge signals if one already exists
  let finalSignal = timeoutSignal;
  if (options.signal) {
    // If both signals exist, abort when either one aborts
    const controller = new AbortController();
    const abort = () => controller.abort();
    timeoutSignal.addEventListener('abort', abort);
    options.signal.addEventListener('abort', abort);
    finalSignal = controller.signal;
  }

  const config: RequestInit = {
    headers: getHeaders(includeAuth),
    ...options,
    signal: finalSignal,
  };

  let lastError: any;
  let refreshed401 = false;

  // Retries are for idempotent reads only. A timed-out POST/PUT/DELETE may
  // have succeeded server-side — retrying it double-applies the write
  // (double forum posts, vote toggles that un-vote, double quiz XP).
  const method = (options.method || 'GET').toUpperCase();
  const maxAttempts = (method === 'GET' || method === 'HEAD') ? retries + 1 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...config,
        headers: getHeaders(includeAuth), // re-read token (may have been refreshed)
      });

      // On 401: repair the session when possible, otherwise end it loudly.
      // Skipped for endpoints with application-level 401s (see param) —
      // a wrong deletion password must never log the user out.
      // Three terminal states, all broadcast: no token but a stored user
      // (multi-tab logout, evicted storage), refresh definitively rejected,
      // or a refreshed token rejected again. Guests (no stored user) and
      // offline blips ('unreachable') keep the old quiet behavior.
      if (response.status === 401 && includeAuth && !skipAuthRefresh) {
        const hadSession = hasStoredSession();
        if (!getAuthToken()) {
          if (hadSession) broadcastSessionExpired();
        } else if (!refreshed401) {
          refreshed401 = true;
          const refreshStatus = await refreshAccessToken();
          if (refreshStatus === 'ok') {
            continue; // retry with the fresh token
          }
          if (refreshStatus === 'rejected' && hadSession) {
            broadcastSessionExpired();
          }
        } else if (hadSession) {
          // The refreshed token was rejected too: definitively dead.
          broadcastSessionExpired();
        }
      }

      return await handleResponse<T>(response);
    } catch (error: any) {
      lastError = error;

      // Check if it's an abort error (timeout)
      if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        const timeoutError: any = new Error('Connection timeout. The server is taking too long to respond.');
        timeoutError.isTimeout = true;
        timeoutError.isNetworkError = true;
        lastError = timeoutError;
      }

      // If it's a timeout error and we have retries left, wait and retry
      // (reads only — writes have maxAttempts 1, so this never fires for them)
      if (isNetworkError(lastError) && attempt < maxAttempts - 1) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
        console.warn(
          `API request failed (attempt ${attempt + 1}/${maxAttempts}): ${endpoint}. Retrying in ${delay}ms...`,
          lastError
        );

        // Wait before retrying - this keeps the loading state visible
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // If it's not a network error or we're out of retries, throw immediately
      if (!isNetworkError(lastError)) {
        console.error(`API request failed: ${endpoint}`, lastError);
        throw lastError;
      }
    }
  }

  // If we've exhausted all retries, throw a user-friendly error
  console.error(`API request failed after ${maxAttempts} attempt(s): ${endpoint}`, lastError);
  const friendlyMessage = getUserFriendlyErrorMessage(lastError, endpoint);
  const timeoutError = new Error(friendlyMessage);
  (timeoutError as any).originalError = lastError;
  (timeoutError as any).isTimeout = isConnectionTimeoutError(lastError) || lastError?.isTimeout;
  (timeoutError as any).isNetworkError = isNetworkError(lastError) || lastError?.isNetworkError;
  // Preserve machine-readable fields: the friendly rewrite must not swallow
  // backend codes (FREE_LIMIT_REACHED, DAILY_LIMIT_REACHED) or HTTP status —
  // callers branch on them.
  if (lastError?.code) (timeoutError as any).code = lastError.code;
  if (lastError?.status) (timeoutError as any).status = lastError.status;
  throw timeoutError;
};

// Auth API
// Non-streaming fallback used by chatStream when SSE transport fails
const authFallbackChat = async (
  message: string,
  subject: string,
  grade: number,
  sessionId: string | null,
  documentId?: string
): Promise<{ response: string; sessionId?: string | null; xpGained?: number }> => {
  return apiRequest('/ai-tutor/chat', {
    method: 'POST',
    body: JSON.stringify({ message, subject, grade, sessionId: sessionId || undefined, documentId }),
  });
};

export const authAPI = {
  login: (email: string, password: string): Promise<{ user: User; token: string; refreshToken?: string }> =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false),

  register: (name: string, email: string, password: string, grade?: number): Promise<{ user: User; token?: string; refreshToken?: string; message?: string }> =>
    apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, ...(grade !== undefined ? { grade } : {}) }),
    }, false),

  verify: (): Promise<{ user: User }> =>
    apiRequest('/auth/verify'),

  logout: (refreshToken?: string): Promise<void> =>
    apiRequest('/auth/logout', {
      method: 'POST',
      body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
    }, false),

  forgotPassword: (email: string): Promise<{ success: boolean; message: string }> =>
    apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }, false),

  resetPassword: (token: string, password: string): Promise<{ success: boolean; message: string }> =>
    apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }, false),

  verifyEmail: (token: string): Promise<{ success: boolean; user?: User; token?: string; refreshToken?: string; message?: string }> =>
    apiRequest(`/auth/verify-email?token=${encodeURIComponent(token)}`, {
      method: 'GET',
    }, false),

  resendVerification: (email: string): Promise<{ success: boolean; message: string }> =>
    apiRequest('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }, false),

  acceptInvitation: (token: string, password: string): Promise<{ user: User; token: string; refreshToken?: string }> =>
    apiRequest('/auth/accept-invitation', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }, false),

  getPolicyVersions: (): Promise<{ privacyPolicyUpdated: string; termsOfServiceUpdated: string }> =>
    apiRequest('/auth/policy-versions', {}, false),
};

// Users API
export const usersAPI = {
  getProfile: (): Promise<User & { notifications: any[] }> =>
    apiRequest('/users/profile').then((user: any) => ({
      ...user,
      // The API stores UPPERCASE types (SUCCESS/INFO/ERROR); normalize once
      // at the boundary so every consumer (bell icons, filters) can rely on
      // the lowercase NotificationItem union instead of each normalizing.
      notifications: (user.notifications || []).map((n: any) => ({
        ...n,
        type: String(n.type || 'info').toLowerCase(),
      })),
    })),

  updateProfile: (data: Partial<User>): Promise<User> =>
    apiRequest('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  uploadAvatar: (file: File): Promise<{ avatar: string }> => {
    const formData = new FormData();
    formData.append('avatar', file);

    const token = getAuthToken();
    const url = `${API_BASE_URL}/users/avatar`;

    return fetch(url, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData,
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to upload avatar');
      }
      return data.data;
    });
  },

  getBookmarks: (): Promise<{ id: string; item_id: string; item_type: 'document' | 'video'; created_at: string; item: Document | Video }[]> =>
    apiRequest('/users/bookmarks'),

  addBookmark: (itemId: string, itemType: 'document' | 'video'): Promise<{ id: string; item_id: string; item_type: string; created_at: string }> =>
    apiRequest('/users/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ itemId, itemType }),
    }),

  removeBookmark: (itemId: string, itemType: 'document' | 'video'): Promise<void> =>
    apiRequest(`/users/bookmarks/${itemId}/${itemType}`, {
      method: 'DELETE',
    }),

  // NOTE: no gainXP helper — POST /users/gain-xp was removed (client-minted
  // XP). Awards happen inside the action endpoints; pages sync via refreshUser.

  markNotificationsRead: (notificationIds?: string[]): Promise<void> =>
    apiRequest('/users/notifications/read', {
      method: 'PUT',
      body: notificationIds ? JSON.stringify({ notificationIds }) : JSON.stringify({}),
    }),

  deleteNotification: (notificationId: string): Promise<void> =>
    apiRequest(`/users/notifications/${notificationId}`, {
      method: 'DELETE',
    }),

  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> =>
    apiRequest('/users/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    }),

  requestDeletionCode: (): Promise<{ email?: string }> =>
    apiRequest('/users/account/deletion-code', {
      method: 'POST',
    }),

  requestPasswordCode: (): Promise<{ email?: string }> =>
    apiRequest('/users/account/password-code', {
      method: 'POST',
    }),

  setAccountPassword: (code: string, newPassword: string, confirmPassword: string): Promise<void> =>
    apiRequest('/users/account/password', {
      method: 'PUT',
      body: JSON.stringify({ code, newPassword, confirmPassword }),
      // 401s here mean wrong code, never an expired session.
    }, true, 3, 1000, true),

  deleteAccount: (reauth?: { password?: string; code?: string }): Promise<void> =>
    apiRequest('/users/account', {
      method: 'DELETE',
      body: JSON.stringify(reauth ?? {}),
      // 401s here mean wrong password/code, never an expired session.
    }, true, 3, 1000, true),

  getLeaderboard: (limit?: number): Promise<{ id: string; name: string; xp: number; level: number; initial: string; avatar?: string; rank: number; isUser?: boolean }[]> =>
    apiRequest(`/users/leaderboard${limit ? `?limit=${limit}` : ''}`, {}, false),
};

// Documents API
export const documentsAPI = {
  getAll: (params: { subject?: string; grade?: number; search?: string; tag?: string; excludeTag?: string; limit?: number; offset?: number; bookmarked?: boolean; sort?: string } = {}): Promise<{
    documents: Document[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  }> => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
    return apiRequest(`/documents?${queryParams}`);
  },

  getById: (id: string): Promise<Document> =>
    apiRequest(`/documents/${id}`),

  download: (id: string): Promise<{ downloadUrl: string; filename: string }> =>
    apiRequest(`/documents/${id}/download`),

  create: (document: Omit<Document, 'id' | 'created_at' | 'updated_at'>): Promise<Document> =>
    apiRequest('/documents', {
      method: 'POST',
      body: JSON.stringify(document),
    }),

  update: (id: string, updates: Partial<Document>): Promise<Document> =>
    apiRequest(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string): Promise<void> =>
    apiRequest(`/documents/${id}`, {
      method: 'DELETE',
    }),
};

// Videos API
export const videosAPI = {
  getTopics: (grade: number, subject: string): Promise<string[]> =>
    apiRequest(`/videos/topics?grade=${grade}&subject=${encodeURIComponent(subject)}`),

  getAll: (params: { subject?: string; grade?: number; search?: string; limit?: number; offset?: number; chapter?: string; bookmarked?: boolean; sort?: string } = {}): Promise<{
    videos: Video[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  }> => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
    return apiRequest(`/videos?${queryParams}`);
  },

  getById: (id: string): Promise<Video> =>
    apiRequest(`/videos/${id}`),

  recordView: (id: string): Promise<{ views: number } | void> =>
    apiRequest(`/videos/${id}/view`, {
      method: 'POST',
    }),

  like: (id: string, liked: boolean): Promise<Video | void> =>
    apiRequest(`/videos/${id}/like`, {
      method: 'POST',
      body: JSON.stringify({ liked }),
    }),

  complete: (id: string, completed: boolean): Promise<Video> =>
    apiRequest(`/videos/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ completed }),
    }),

  create: (video: Omit<Video, 'id' | 'created_at' | 'updated_at'>): Promise<Video> =>
    apiRequest('/videos', {
      method: 'POST',
      body: JSON.stringify(video),
    }),

  update: (id: string, updates: Partial<Video>): Promise<Video> =>
    apiRequest(`/videos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string): Promise<void> =>
    apiRequest(`/videos/${id}`, {
      method: 'DELETE',
    }),
};

// Forum API
export const forumAPI = {
  getPosts: (params: { subject?: string; grade?: number; search?: string; limit?: number; offset?: number } = {}): Promise<{
    posts: (ForumPost & { author: string; author_role: string; author_avatar?: string; comment_count: number })[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  }> => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
    return apiRequest(`/forum/posts?${queryParams}`);
  },

  getPost: (id: string): Promise<ForumPost & { author: string; author_role: string; author_avatar?: string; comments: ForumComment[] }> =>
    apiRequest(`/forum/posts/${id}`),

  createPost: (post: { title: string; content: string; subject: string; grade: number; tags?: string[] }): Promise<ForumPost> =>
    apiRequest('/forum/posts', {
      method: 'POST',
      body: JSON.stringify(post),
    }),

  // Author edit: title/content/tags only. Votes change via votePost, solved
  // via markSolved, AI answers via generateAIAnswer — the server ignores any
  // other keys on this endpoint.
  updatePost: (id: string, updates: { title?: string; content?: string; tags?: string[] }): Promise<ForumPost> =>
    apiRequest(`/forum/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  deletePost: (id: string): Promise<void> =>
    apiRequest(`/forum/posts/${id}`, {
      method: 'DELETE',
    }),

  votePost: (id: string, vote: 1 | -1): Promise<{ message: string; data?: { votes: number } }> =>
    apiRequest(`/forum/posts/${id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    }),

  markSolved: (id: string, solved: boolean): Promise<void> =>
    apiRequest(`/forum/posts/${id}/solved`, {
      method: 'PUT',
      body: JSON.stringify({ solved }),
    }),

  addComment: (postId: string, content: string): Promise<ForumComment> =>
    apiRequest(`/forum/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  updateComment: (id: string, content: string): Promise<ForumComment> =>
    apiRequest(`/forum/comments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  deleteComment: (id: string): Promise<void> =>
    apiRequest(`/forum/comments/${id}`, {
      method: 'DELETE',
    }),

  voteComment: (id: string, vote: 1 | -1): Promise<{ message: string; data?: { votes: number } }> =>
    apiRequest(`/forum/comments/${id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    }),

  acceptComment: (id: string): Promise<void> =>
    apiRequest(`/forum/comments/${id}/accept`, {
      method: 'PUT',
    }),

  generateAIAnswer: (postId: string): Promise<{ aiAnswer: string; xpGained: number; newLevel?: number; leveledUp?: boolean }> =>
    apiRequest(`/forum/posts/${postId}/generate-ai-answer`, {
      method: 'POST',
    }),
};

// AI Tutor API
export const aiTutorAPI = {
  getSessions: (): Promise<ChatSession[]> =>
    apiRequest('/ai-tutor/sessions'),

  createSession: (title: string): Promise<ChatSession> =>
    apiRequest('/ai-tutor/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  getSession: (id: string): Promise<ChatSession> =>
    apiRequest(`/ai-tutor/sessions/${id}`),

  // Append endpoint accepts user messages only (server stamps assistant turns itself).
  addMessage: (sessionId: string, role: 'user', text: string): Promise<{ role: string; text: string; timestamp: string }> =>
    apiRequest(`/ai-tutor/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ role, text }),
    }),

  updateSession: (id: string, title: string): Promise<ChatSession> =>
    apiRequest(`/ai-tutor/sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    }),

  deleteSession: (id: string): Promise<void> =>
    apiRequest(`/ai-tutor/sessions/${id}`, {
      method: 'DELETE',
    }),

  chat: (message: string, subject?: string, grade?: number, sessionId?: string, documentId?: string): Promise<{ response: string; sessionId?: string; xpGained?: number; grounded?: boolean; unavailableReason?: string }> =>
    apiRequest('/ai-tutor/chat', {
      method: 'POST',
      body: JSON.stringify({ message, subject, grade, sessionId, documentId }),
    }),

  // Streaming chat via SSE — onDelta receives incremental text chunks.
  // Returns the full response plus session/xp metadata when done.
  // documentId (optional): grounds the answer in the document's extracted
  // text (reader pages). Omitted elsewhere — the main tutor has no document.
  chatStream: (
    message: string,
    subject: string,
    grade: number,
    sessionId: string | null,
    onDelta: (delta: string) => void,
    deepThinking?: boolean,
    documentId?: string
  ): Promise<{ response: string; sessionId?: string | null; xpGained?: number }> =>
    new Promise((resolve, reject) => {
      // Safety net: a hung stream must never lock the UI forever. After 75s
      // we abort and fall back to the non-streaming endpoint (which has its
      // own timeout + retries).
      const controller = new AbortController();
      const watchdog = setTimeout(() => controller.abort(), 75000);

      const doFetch = (authRetry: boolean): Promise<Response> =>
        fetch(`${API_BASE_URL}/ai-tutor/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
          },
          body: JSON.stringify({ message, subject, grade, sessionId: sessionId || undefined, deepThinking: !!deepThinking, documentId }),
          signal: controller.signal,
        }).then(async (response: Response): Promise<Response> => {
          // Expired access token: refresh once, then retry with the new token.
          // Only a definitive rejection clears the session; transport
          // failures fall through to the non-streaming fallback below.
          if (response.status === 401 && authRetry && getAuthToken()) {
            const refreshStatus = await refreshAccessToken();
            if (refreshStatus === 'ok') return doFetch(false);
            // Same dead-session rule as apiRequest: broadcast only when the
            // UI believes it is logged in; otherwise just clear.
            if (refreshStatus === 'rejected') {
              if (hasStoredSession()) broadcastSessionExpired();
              else clearCredentials();
            }
          }
          return response;
        });

      doFetch(true).then(async (response) => {
        if (!response.ok || !response.body) {
          clearTimeout(watchdog);
          // Fall back to non-streaming chat on any transport failure
          try {
            const fallback = await authFallbackChat(message, subject, grade, sessionId, documentId);
            onDelta(fallback.response);
            resolve(fallback);
          } catch (e) {
            reject(e);
          }
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let full = '';
        let sessionIdOut: string | null | undefined;
        let xpGained: number | undefined;

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Parse SSE frames: "event: <name>\ndata: <json>\n\n"
            let sep;
            while ((sep = buffer.indexOf('\n\n')) !== -1) {
              const frame = buffer.slice(0, sep);
              buffer = buffer.slice(sep + 2);

              let event = 'message';
              let data = '';
              for (const line of frame.split('\n')) {
                if (line.startsWith('event: ')) event = line.slice(7).trim();
                else if (line.startsWith('data: ')) data = line.slice(6);
              }
              if (!data) continue;

              try {
                const parsed = JSON.parse(data);
                if (event === 'delta' && typeof parsed.text === 'string') {
                  full += parsed.text;
                  onDelta(parsed.text);
                } else if (event === 'session' && parsed.sessionId) {
                  sessionIdOut = parsed.sessionId;
                } else if (event === 'done') {
                  sessionIdOut = parsed.sessionId ?? sessionIdOut;
                  xpGained = parsed.xpGained;
                } else if (event === 'error') {
                  throw new Error(parsed.message || 'AI stream error');
                }
              } catch (parseErr) {
                if (parseErr instanceof Error && parseErr.message.includes('AI stream')) throw parseErr;
                // Ignore malformed JSON frames (keepalive etc.)
              }
            }
          }
          resolve({ response: full, sessionId: sessionIdOut, xpGained });
        } catch (streamErr: any) {
          // Watchdog abort (or any mid-stream failure) with partial content:
          // deliver what arrived instead of failing outright.
          if (streamErr?.name === 'AbortError' && full) {
            resolve({ response: full, sessionId: sessionIdOut, xpGained });
          } else {
            reject(streamErr);
          }
        } finally {
          clearTimeout(watchdog);
        }
      }).catch(reject);
    }),

  extractTextFromImage: async (imageFile: File): Promise<{ text: string }> => {
    // Use client-side OCR instead of server-side to avoid serverless timeout issues
    // This runs entirely in the browser, avoiding Vercel serverless function limitations
    const { extractTextFromImage: ocrExtract } = await import('./ocrService');
    const text = await ocrExtract(imageFile);
    return { text };
  },

  generateStudyPlan: (prompt: string, grade?: number): Promise<{
    plan: any[];
    xpGained: number;
    // Folded persist: the server inserts the plan in the same warm
    // invocation and returns the created rows. Absent/false when the save
    // didn't happen — the caller falls back to createEventsBatch.
    persisted?: boolean;
    events?: any[];
    // Fallback skeleton (AI failed): nothing was saved and nothing should
    // be — the caller shows retry instead of success.
    fallback?: boolean;
  }> =>
    apiRequest('/ai-tutor/generate-study-plan', {
      method: 'POST',
      body: JSON.stringify({ prompt, ...(grade !== undefined ? { grade } : {}) }),
    }, true, 3, 1000, false, 55000),

  generatePracticeQuiz: (subject: string, grade: string, difficulty: string, count: number): Promise<{ data: any[]; xpGained: number }> =>
    apiRequest('/ai-tutor/generate-practice-quiz', {
      method: 'POST',
      body: JSON.stringify({ subject, grade, difficulty, count }),
      // 60s like the study-plan route below: ~6s of generation plus ~10
      // sequential DB round trips after it. On a high-latency link the 30s
      // default aborted healthy responses that arrived seconds later.
    }, true, 3, 1000, false, 60000).then((data: any) => ({
      // handleResponse unwraps one level: backend {success, data:{questions, xpGained}}
      data: data?.questions ?? [],
      xpGained: data?.xpGained ?? 0,
    })),

  getChatSessions: (): Promise<ChatSession[]> =>
    apiRequest('/ai-tutor/sessions').then((sessions: any) =>
      sessions.map((session: any) => ({
        id: session.id,
        title: session.title,
        date: session.created_at, // Map created_at to date
        messages: (Array.isArray(session.messages) ? session.messages : []).map((msg: any) => ({
          role: msg.role,
          text: msg.text
        }))
      }))
    ),

  // Full session with messages (the list endpoint omits payloads for speed)
  getChatSession: (id: string): Promise<ChatSession> =>
    apiRequest(`/ai-tutor/sessions/${id}`).then((session: any) => ({
      id: session.id,
      title: session.title,
      date: session.created_at,
      messages: (Array.isArray(session.messages) ? session.messages : []).map((msg: any) => ({
        role: msg.role,
        text: msg.text
      }))
    })),

  createChatSession: (title: string): Promise<ChatSession> =>
    apiRequest('/ai-tutor/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }).then((session: any) => ({
      id: session.id,
      title: session.title,
      date: session.created_at, // Map created_at to date
      messages: (Array.isArray(session.messages) ? session.messages : []).map((msg: any) => ({
        role: msg.role,
        text: msg.text
      }))
    })),

  addChatMessage: (sessionId: string, role: 'user', text: string): Promise<{ role: string; text: string }> =>
    apiRequest(`/ai-tutor/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ role, text }),
    }).then((message: any) => ({
      role: message.role,
      text: message.text
    })),

  updateChatSession: (id: string, title: string): Promise<ChatSession> =>
    apiRequest(`/ai-tutor/sessions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title }),
    }).then((session: any) => ({
      id: session.id,
      title: session.title,
      date: session.created_at || session.updated_at, // Map created_at/updated_at to date
      messages: (Array.isArray(session.messages) ? session.messages : []).map((msg: any) => ({
        role: msg.role,
        text: msg.text
      }))
    })),

  deleteChatSession: (id: string): Promise<void> =>
    apiRequest(`/ai-tutor/sessions/${id}`, {
      method: 'DELETE',
    }),
};

// Planner API
// ---------------------------------------------------------------------------
// Hour-precision event instants. The backend stores TIMESTAMPTZ and returns
// ISO strings; all-day rows are midnight Ethiopia. The UI keeps a LOCAL
// calendar day (`date`, YYYY-MM-DD) plus an optional LOCAL wall-clock time
// (`time`, HH:mm) so pickers, grouping and urgency stay day-based while
// reminders can target intraday instants.
const pad2 = (n: number) => String(n).padStart(2, '0');

export const splitEventDateTime = (iso: unknown): { date: string; time?: string } => {
  const raw = String(iso ?? '');
  // Legacy/calendar-day rows carry no time part — all-day by definition.
  // (Parsing 'YYYY-MM-DD' as UTC midnight would hallucinate a time in
  // zones ahead of UTC.)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { date: raw };
  const d = new Date(raw);
  if (isNaN(d.getTime())) return { date: raw.slice(0, 10) };
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  // All-day rows are stored as local midnight — no time chip for those.
  // (A user-picked 00:00 reads back as all-day; documented on StudyEvent.)
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) return { date };
  return { date, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
};

// Local wall time → exact UTC instant for the backend. No time = day
// precision (the backend normalizes to midnight Ethiopia).
export const combineEventDateTime = (date: string, time?: string): string => {
  if (!time) return date;
  const [y, m, dd] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, (m || 1) - 1, dd || 1, hh || 0, mm || 0).toISOString();
};

// Sort key for instants (timed tasks order within their day).
export const eventInstantKey = (date: string, time?: string): number => {
  const t = new Date(combineEventDateTime(date, time)).getTime();
  return isNaN(t) ? 0 : t;
};

export const plannerAPI = {
  getEvents: (params: { date?: string; type?: string; completed?: boolean; archived?: boolean | 'all' } = {}): Promise<StudyEvent[]> => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
    return apiRequest(`/planner/events?${queryParams}`).then((events: any) => {
      // Transform backend field names to frontend field names
      return events.map((event: any) => {
        const { date, time } = splitEventDateTime(event.event_date);
        return {
          id: event.id,
          title: event.title,
          subject: event.subject,
          date,
          ...(time ? { time } : {}),
          type: event.event_type,
          isCompleted: event.is_completed,
          isArchived: event.is_archived || false,
          notes: event.notes,
          created_at: event.created_at,
          updated_at: event.updated_at
        };
      });
    });
  },

  createEvent: (event: Omit<StudyEvent, 'id' | 'created_at' | 'updated_at'>): Promise<StudyEvent> => {
    // Map frontend field names to backend field names
    const apiEvent = {
      title: event.title,
      subject: event.subject,
      event_date: combineEventDateTime(event.date, event.time),
      event_type: event.type,
      notes: event.notes || ''
    };

    return apiRequest('/planner/events', {
      method: 'POST',
      body: JSON.stringify(apiEvent),
    }).then((createdEvent: any) => {
      const { date, time } = splitEventDateTime(createdEvent.event_date);
      return {
        id: createdEvent.id,
        title: createdEvent.title,
        subject: createdEvent.subject,
        date,
        ...(time ? { time } : {}),
        type: createdEvent.event_type,
        isCompleted: createdEvent.is_completed,
        isArchived: createdEvent.is_archived || false,
        notes: createdEvent.notes,
        created_at: createdEvent.created_at,
        updated_at: createdEvent.updated_at
      };
    });
  },

  // Batch-create events in ONE request (AI schedule generation) instead of
  // N sequential POSTs. Returns the created events in frontend shape.
  createEventsBatch: (events: Omit<StudyEvent, 'id' | 'created_at' | 'updated_at'>[]): Promise<StudyEvent[]> => {
    const apiEvents = events.map((event) => ({
      title: event.title,
      subject: event.subject,
      event_date: combineEventDateTime(event.date, event.time),
      event_type: event.type,
      notes: event.notes || ''
    }));

    return apiRequest('/planner/events/batch', {
      method: 'POST',
      body: JSON.stringify({ events: apiEvents }),
    }).then((created: any) => ((created || []) as any[]).map((createdEvent: any) => {
      const { date, time } = splitEventDateTime(createdEvent.event_date);
      return {
        id: createdEvent.id,
        title: createdEvent.title,
        subject: createdEvent.subject,
        date,
        ...(time ? { time } : {}),
        type: createdEvent.event_type,
        isCompleted: createdEvent.is_completed,
        isArchived: createdEvent.is_archived || false,
        notes: createdEvent.notes,
        created_at: createdEvent.created_at,
        updated_at: createdEvent.updated_at
      };
    }));
  },

  updateEvent: (id: string, updates: Partial<StudyEvent>): Promise<StudyEvent> => {
    // Map frontend field names to backend field names
    const apiUpdates: any = { ...updates };
    const updTime = (updates as Partial<StudyEvent>).time;
    if (updates.date !== undefined || updTime) {
      // A time without its day is meaningless — fail loudly, never send
      // a bare "14:30" the backend would 400 on.
      if (!updates.date) throw new Error('Cannot set an event time without a date');
      apiUpdates.event_date = combineEventDateTime(updates.date, updTime || undefined);
      delete apiUpdates.date;
    }
    delete apiUpdates.time;
    if (updates.type !== undefined) {
      apiUpdates.event_type = updates.type;
      delete apiUpdates.type;
    }
    if (updates.isCompleted !== undefined) {
      apiUpdates.is_completed = updates.isCompleted;
      delete apiUpdates.isCompleted;
    }
    if (updates.isArchived !== undefined) {
      apiUpdates.is_archived = updates.isArchived;
      delete apiUpdates.isArchived;
    }

    return apiRequest(`/planner/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(apiUpdates),
    }).then((updatedEvent: any) => {
      const { date, time } = splitEventDateTime(updatedEvent.event_date);
      return {
        id: updatedEvent.id,
        title: updatedEvent.title,
        subject: updatedEvent.subject,
        date,
        ...(time ? { time } : {}),
        type: updatedEvent.event_type,
        isCompleted: updatedEvent.is_completed,
        isArchived: updatedEvent.is_archived || false,
        notes: updatedEvent.notes,
        created_at: updatedEvent.created_at,
        updated_at: updatedEvent.updated_at,
        // Award info on false→true completions (absent otherwise)
        xpGained: updatedEvent.xpGained ?? 0,
        newLevel: updatedEvent.newLevel,
        leveledUp: updatedEvent.leveledUp ?? false
      };
    });
  },

  deleteEvent: (id: string): Promise<void> =>
    apiRequest(`/planner/events/${id}`, {
      method: 'DELETE',
    }),

  recordPractice: (subject: string, duration: number, topics?: string[]): Promise<{ subject: string; duration: number; topics: string[]; xp_gained: number }> =>
    apiRequest('/planner/practice', {
      method: 'POST',
      body: JSON.stringify({ subject, duration, topics }),
    }),

  recordQuizCompletion: (data: {
    subject: string;
    score: number;
    totalQuestions: number;
    timeSpent: string;
    isHighScore?: boolean;
  }): Promise<{ subject: string; score: number; totalQuestions: number; timeSpent: string; xpEarned: number; xpGained: number; newLevel?: number; leveledUp: boolean; isHighScore: boolean }> =>
    apiRequest('/planner/practice/quiz-complete', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStats: (): Promise<{ total_sessions: number; current_level: number; total_xp: number; xp_to_next_level: number; current_streak: number }> =>
    apiRequest('/planner/practice/stats'),
};

// Admin API
export const adminAPI = {
  getStats: (): Promise<{
    total_users: number;
    premium_users: number;
    total_documents: number;
    premium_documents: number;
    total_videos: number;
    premium_videos: number;
    total_forum_posts: number;
    recent_activity: {
      new_users_today: number;
      documents_downloaded_today: number;
      forum_posts_today: number;
    };
  }> =>
    apiRequest('/admin/stats'),

  getUsers: (params: { limit?: number; offset?: number; search?: string; plan?: 'all' | 'free' | 'premium'; status?: 'all' | 'Active' | 'Banned'; role?: 'STUDENT' | 'MODERATOR' } = {}): Promise<{
    users: User[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  }> => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
    return apiRequest(`/admin/users?${queryParams}`).then((response: any) => ({
      ...response,
      users: response.users.map((user: any) => ({
        ...user,
        isPremium: user.is_premium || user.isPremium || false,
        joinedDate: user.created_at || user.joinedDate,
        lastActiveDate: user.last_active_date || user.lastActiveDate || '',
        is_premium: undefined, // Remove snake_case version
        created_at: undefined,
        last_active_date: undefined
      }))
    }));
  },

  updateUserPremium: (userId: string, isPremium: boolean): Promise<void> =>
    apiRequest(`/admin/users/${userId}/premium`, {
      method: 'PUT',
      body: JSON.stringify({ isPremium }),
    }),

  deleteUser: (userId: string): Promise<void> =>
    apiRequest(`/admin/users/${userId}`, {
      method: 'DELETE',
    }),

  getContentStats: (): Promise<{
    documents: { total: number; premium: number; by_subject: Record<string, number> };
    videos: { total: number; premium: number; by_subject: Record<string, number> };
    forum: { total_posts: number; solved_posts: number; by_subject: Record<string, number> };
  }> =>
    apiRequest('/admin/content'),

  createDocument: (document: Omit<Document, 'id' | 'created_at' | 'updated_at'>): Promise<Document> =>
    apiRequest('/admin/documents', {
      method: 'POST',
      body: JSON.stringify(document),
    }),

  createVideo: (video: Omit<Video, 'id' | 'created_at' | 'updated_at'>): Promise<Video> =>
    apiRequest('/admin/videos', {
      method: 'POST',
      body: JSON.stringify(video),
    }),

  deleteForumPost: (postId: string): Promise<void> =>
    apiRequest(`/admin/forum/posts/${postId}`, {
      method: 'DELETE',
    }),

  getAuditLogs: (params: { limit?: number; offset?: number; actor?: string; action?: string; targetType?: string; targetId?: string; search?: string } = {}): Promise<{
    logs: any[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  }> => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).length > 0) {
        queryParams.append(key, String(value));
      }
    });
    const qs = queryParams.toString();
    return apiRequest(`/admin/audit-logs${qs ? `?${qs}` : ''}`);
  },

  // Admin stats
  getAdminStats: (): Promise<{
    total_users: number;
    premium_users: number;
    total_documents: number;
    total_videos: number;
    total_forum_posts: number;
    recent_activity: any;
  }> =>
    apiRequest('/admin/stats'),

  // Admin team management
  getAdmins: (): Promise<User[]> =>
    apiRequest('/admin/admins'),

  inviteAdmin: (data: { email: string; name: string; role?: string }): Promise<{
    userId: string;
    email: string;
    name: string;
    role: string;
    emailSent: boolean;
    invitationLink: string;
    expiresAt: string;
  }> =>
    apiRequest('/admin/admins/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resendInvitation: (userId: string): Promise<{
    userId: string;
    email: string;
    emailSent: boolean;
    invitationLink: string;
    expiresAt: string;
  }> =>
    apiRequest(`/admin/admins/${userId}/resend-invitation`, {
      method: 'POST',
    }),

  revokeInvitation: (userId: string): Promise<{ success: boolean; message: string }> =>
    apiRequest(`/admin/admins/${userId}/invitation`, {
      method: 'DELETE',
    }),

  updateAdminRole: (userId: string, role: 'ADMIN' | 'MODERATOR'): Promise<{
    id: string;
    email: string;
    name: string;
    role: string;
  }> =>
    apiRequest(`/admin/admins/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),

  removeAdmin: (userId: string): Promise<void> =>
    apiRequest(`/admin/admins/${userId}`, {
      method: 'DELETE',
    }),

  // User status management
  updateUserStatus: (userId: string, status: 'Active' | 'Banned'): Promise<void> =>
    apiRequest(`/admin/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  // YouTube library sync (ADMIN / MODERATOR). Single-subject fits the 30s
  // serverless budget; sync-all is time-boxed server-side and reports honest
  // partial counts (stoppedEarly) plus quotaExceeded. 429 = daily API quota
  // gone — the thrown Error carries the backend's user-facing message.
  youtube: {
    sync: (grade: number, subject: string): Promise<{ added: number }> =>
      apiRequest('/admin/youtube/sync', {
        method: 'POST',
        body: JSON.stringify({ grade, subject }),
      }),

    syncAll: (): Promise<{ added: number; errors: number; stoppedEarly: boolean; quotaExceeded: boolean }> =>
      apiRequest('/admin/youtube/sync-all', {
        method: 'POST',
      }),
  },
};

// Search API
export const searchAPI = {
  basic: (params: { q: string; type?: string; limit?: number; offset?: number }): Promise<{
    results: Array<{
      id: string;
      title: string;
      subject?: string;
      grade?: number;
      type: 'document' | 'video' | 'post';
      url: string;
      isPremium?: boolean;
      previewImage?: string;
      thumbnail?: string;
      author?: string;
      authorRole?: string;
      commentCount?: number;
      instructor?: string;
    }>;
    breakdown: { documents: number; videos: number; forumPosts: number };
    total: number;
    hasMore: boolean;
    searchTerm: string;
  }> =>
    apiRequest(`/search?${new URLSearchParams(params as any)}`, {}, false),

  advanced: (params: {
    query: string;
    types?: string[];
    subjects?: string[];
    grades?: number[];
    limit?: number;
    offset?: number;
    sortBy?: 'relevance' | 'newest' | 'oldest' | 'title';
  }): Promise<{
    results: Array<{
      id: string;
      title: string;
      subject?: string;
      grade?: number;
      type: 'document' | 'video' | 'post';
      url: string;
      isPremium?: boolean;
      previewImage?: string;
      thumbnail?: string;
      author?: string;
      authorRole?: string;
      commentCount?: number;
      instructor?: string;
      created_at?: string;
    }>;
    breakdown: { documents: number; videos: number; forumPosts: number };
    total: number;
    hasMore: boolean;
    searchQuery: string;
    filters: any;
  }> =>
    apiRequest('/search/advanced', {
      method: 'POST',
      body: JSON.stringify(params),
    }, false),

  suggestions: (prefix: string, limit?: number): Promise<{
    suggestions: string[];
    count: number;
  }> =>
    apiRequest(`/search/suggest?q=${encodeURIComponent(prefix)}${limit ? `&limit=${limit}` : ''}`, {}, false),
};

// Dashboard API
// Web Push subscriptions (genuine push that arrives with the app closed).
export const pushAPI = {
  subscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<{ subscribed: boolean }> =>
    apiRequest('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(sub),
    }),

  unsubscribe: (endpoint: string): Promise<{ removed: number }> =>
    apiRequest('/push/unsubscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint }),
    }),
};

export const dashboardAPI = {
  getData: (): Promise<{
    user: {
      id: string;
      name: string;
      xp: number;
      level: number;
      streak: number;
      isPremium: boolean;
      bookmarks: string[];
    };
    todaysEvents: Array<{
      id: string;
      title: string;
      subject: string;
      type: 'Exam' | 'Revision' | 'Assignment';
      isCompleted: boolean;
      isArchived?: boolean;
      notes?: string;
      date: string;
    }>;
    recentBookmarks: Array<{
      id: string;
      type: 'document' | 'video';
      title: string;
      subject: string;
      grade: number;
      previewImage?: string;
      isPremium: boolean;
    }>;
    progress: {
      todayCompleted: number;
      todayTotal: number;
      todayPercentage: number;
      levelProgress: number;
      xpToNextLevel: number;
    };
  }> => {
    // Get client's today date in YYYY-MM-DD format (to handle timezone differences)
    const today = new Date();
    const todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    return apiRequest(`/dashboard?date=${todayStr}`);
  },
};

// Careers API
export const careersAPI = {
  // Public endpoints
  getPositions: (params?: {
    department?: string;
    employment_type?: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
  }): Promise<Array<{
    id: string;
    title: string;
    description: string;
    requirements?: string;
    department?: string;
    employment_type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
    location?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>> => {
    const queryParams = new URLSearchParams();
    if (params?.department) queryParams.append('department', params.department);
    if (params?.employment_type) queryParams.append('employment_type', params.employment_type);
    return apiRequest(`/careers?${queryParams.toString()}`, {}, false);
  },

  getPosition: (id: string): Promise<{
    id: string;
    title: string;
    description: string;
    requirements?: string;
    department?: string;
    employment_type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
    location?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }> =>
    apiRequest(`/careers/${id}`, {}, false),

  getPrivacyPolicy: (): Promise<{
    content: string;
    lastUpdated: string;
  }> =>
    apiRequest('/careers/privacy-policy', {}, false),

  getTermsOfService: (): Promise<{
    content: string;
    lastUpdated: string;
  }> =>
    apiRequest('/careers/terms-of-service', {}, false),

  apply: (positionId: string, data: {
    applicant_name: string;
    applicant_email: string;
    applicant_phone?: string;
    cover_letter?: string;
    resume_url?: string;
  }): Promise<{
    id: string;
    position_id: string;
    applicant_name: string;
    applicant_email: string;
    status: string;
    created_at: string;
  }> =>
    apiRequest(`/careers/${positionId}/apply`, {
      method: 'POST',
      body: JSON.stringify(data),
    }), // Default includeAuth=true: sends the token when logged in (links
    // applicant_id + enables status notifications), still works for guests
    // (no header sent when no token stored). `false` here used to silently
    // orphan every logged-in application.

  // Admin endpoints
  admin: {
    getPositions: (): Promise<Array<{
      id: string;
      title: string;
      description: string;
      requirements?: string;
      department?: string;
      employment_type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
      location?: string;
      is_active: boolean;
      posted_by?: string;
      created_at: string;
      updated_at: string;
    }>> =>
      apiRequest('/careers/admin/positions'),

    createPosition: (data: {
      title: string;
      description: string;
      requirements?: string;
      department?: string;
      employment_type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
      location?: string;
      is_active?: boolean;
    }): Promise<{
      id: string;
      title: string;
      description: string;
      requirements?: string;
      department?: string;
      employment_type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
      location?: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }> =>
      apiRequest('/careers/admin/positions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    updatePosition: (id: string, data: {
      title?: string;
      description?: string;
      requirements?: string;
      department?: string;
      employment_type?: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
      location?: string;
      is_active?: boolean;
    }): Promise<{
      id: string;
      title: string;
      description: string;
      requirements?: string;
      department?: string;
      employment_type: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
      location?: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }> =>
      apiRequest(`/careers/admin/positions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    deletePosition: (id: string): Promise<{ success: boolean; message: string }> =>
      apiRequest(`/careers/admin/positions/${id}`, {
        method: 'DELETE',
      }),

    getApplications: (params?: {
      position_id?: string;
      status?: 'Pending' | 'Under Review' | 'Interview' | 'Accepted' | 'Rejected';
      archived?: 'true' | 'false' | 'all';
    }): Promise<Array<{
      id: string;
      position_id: string;
      applicant_id?: string;
      applicant_name: string;
      applicant_phone?: string;
      cover_letter?: string;
      resume_url?: string;
      status: 'Pending' | 'Under Review' | 'Interview' | 'Accepted' | 'Rejected';
      is_archived?: boolean;
      notes?: string;
      reviewed_by?: string;
      reviewed_at?: string;
      created_at: string;
      updated_at: string;
    }>> => {
      const queryParams = new URLSearchParams();
      if (params?.position_id) queryParams.append('position_id', params.position_id);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.archived) queryParams.append('archived', params.archived);
      return apiRequest(`/careers/admin/applications?${queryParams.toString()}`);
    },

    getApplication: (id: string): Promise<{
      id: string;
      position_id: string;
      applicant_id?: string;
      applicant_name: string;
      applicant_email: string;
      applicant_phone?: string;
      cover_letter?: string;
      resume_url?: string;
      status: 'Pending' | 'Under Review' | 'Interview' | 'Accepted' | 'Rejected';
      notes?: string;
      reviewed_by?: string;
      reviewed_at?: string;
      created_at: string;
      updated_at: string;
    }> =>
      apiRequest(`/careers/admin/applications/${id}`),

    updateApplicationStatus: (id: string, data: {
      status: 'Pending' | 'Under Review' | 'Interview' | 'Accepted' | 'Rejected';
      notes?: string;
    }): Promise<{
      id: string;
      position_id: string;
      applicant_name: string;
      applicant_email: string;
      status: 'Pending' | 'Under Review' | 'Interview' | 'Accepted' | 'Rejected';
      notes?: string;
      reviewed_by?: string;
      reviewed_at?: string;
      created_at: string;
      updated_at: string;
    }> =>
      apiRequest(`/careers/admin/applications/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    archiveApplication: (id: string, is_archived: boolean): Promise<{
      id: string;
      position_id: string;
      applicant_name: string;
      applicant_email: string;
      status: 'Pending' | 'Under Review' | 'Interview' | 'Accepted' | 'Rejected';
      notes?: string;
      is_archived: boolean;
      reviewed_by?: string;
      reviewed_at?: string;
      created_at: string;
      updated_at: string;
    }> =>
      apiRequest(`/careers/admin/applications/${id}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ is_archived }),
      }),

    deleteApplication: (id: string): Promise<void> =>
      apiRequest(`/careers/admin/applications/${id}`, {
        method: 'DELETE',
      }),

    // Privacy Policy Management
    getPrivacyPolicy: (): Promise<{
      content: string;
      lastUpdated: string;
    }> =>
      apiRequest('/admin/privacy-policy'),

    updatePrivacyPolicy: (data: {
      content: string;
      lastUpdated?: string;
    }): Promise<{
      content: string;
      lastUpdated: string;
    }> =>
      apiRequest('/admin/privacy-policy', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    // Terms of Service Management
    getTermsOfService: (): Promise<{
      content: string;
      lastUpdated: string;
    }> =>
      apiRequest('/admin/terms-of-service'),

    updateTermsOfService: (data: {
      content: string;
      lastUpdated?: string;
    }): Promise<{
      content: string;
      lastUpdated: string;
    }> =>
      apiRequest('/admin/terms-of-service', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
};