import { User, Document, Video, ForumPost, ForumComment, ChatSession, StudyEvent, Badge } from '../types';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Helper function to get auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
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

// Helper function to handle API responses
const handleResponse = async <T>(response: Response): Promise<T> => {
  const data = await response.json();

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
      throw new Error(data.message);
    }

    throw new Error('An error occurred');
  }

  // For HTTP error status codes
  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  // If the response has success: true and data property, return the data
  if (data.success === true && data.data !== undefined) {
    return data.data as T;
  }

  // Otherwise return the data directly (for auth endpoints, etc.)
  return data;
};

// Generic API request function
const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {},
  includeAuth: boolean = true
): Promise<T> => {
  const url = `${API_BASE_URL}${endpoint}`;

  const config: RequestInit = {
    headers: getHeaders(includeAuth),
    ...options,
  };

  try {
    const response = await fetch(url, config);
    return handleResponse<T>(response);
  } catch (error) {
    console.error(`API request failed: ${endpoint}`, error);
    throw error;
  }
};

// Auth API
export const authAPI = {
  login: (email: string, password: string): Promise<{ user: User; token: string }> =>
    apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false),

  register: (name: string, email: string, password: string): Promise<{ user: User; token: string }> =>
    apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }, false),

  verify: (): Promise<{ user: User }> =>
    apiRequest('/auth/verify'),

  logout: (): Promise<void> =>
    apiRequest('/auth/logout', { method: 'POST' }),

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

  acceptInvitation: (token: string, password: string): Promise<{ user: User; token: string }> =>
    apiRequest('/auth/accept-invitation', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }, false),
};

// Users API
export const usersAPI = {
  getProfile: (): Promise<User & { notifications: any[] }> =>
    apiRequest('/users/profile'),

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

  gainXP: (amount: number): Promise<{ xp: number; level: number; leveledUp: boolean }> =>
    apiRequest('/users/gain-xp', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

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

  deleteAccount: (): Promise<void> =>
    apiRequest('/users/account', {
      method: 'DELETE',
    }),

  upgradePremium: (): Promise<{ id: string; name: string; email: string; isPremium: boolean }> =>
    apiRequest('/users/upgrade-premium', {
      method: 'POST',
    }),

  getLeaderboard: (limit?: number): Promise<{ id: string; name: string; xp: number; level: number; initial: string; avatar?: string; rank: number; isUser?: boolean }[]> =>
    apiRequest(`/users/leaderboard${limit ? `?limit=${limit}` : ''}`, {}, false),
};

// Documents API
export const documentsAPI = {
  getAll: (params: { subject?: string; grade?: number; search?: string; limit?: number; offset?: number } = {}): Promise<{
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
  getAll: (params: { subject?: string; grade?: number; search?: string; limit?: number; offset?: number } = {}): Promise<{
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

  recordView: (id: string): Promise<void> =>
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

  updatePost: (id: string, updates: { title?: string; content?: string; tags?: string[]; aiAnswer?: string; isSolved?: boolean; votes?: number; comments?: any[] }): Promise<ForumPost> =>
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

  generateAIAnswer: (postId: string): Promise<{ aiAnswer: string; xpGained: number }> =>
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

  addMessage: (sessionId: string, role: 'user' | 'model', text: string): Promise<{ role: string; text: string; timestamp: string }> =>
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

  chat: (message: string, subject?: string, grade?: number, sessionId?: string): Promise<{ response: string; sessionId?: string; xpGained?: number }> =>
    apiRequest('/ai-tutor/chat', {
      method: 'POST',
      body: JSON.stringify({ message, subject, grade, sessionId }),
    }),

  generateStudyPlan: (prompt: string, grade?: number): Promise<{ plan: any[]; xpGained: number }> =>
    apiRequest('/ai-tutor/generate-study-plan', {
      method: 'POST',
      body: JSON.stringify({ prompt, ...(grade !== undefined ? { grade } : {}) }),
    }),

  generatePracticeQuiz: (subject: string, grade: string, difficulty: string, count: number): Promise<{ data: any[]; xpGained: number }> => {
    const url = `${API_BASE_URL}/ai-tutor/generate-practice-quiz`;
    const token = getAuthToken();

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ subject, grade, difficulty, count }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to generate practice quiz');
      }
      return data; // Return the full response { success, data, xpGained }
    });
  },

  getChatSessions: (): Promise<ChatSession[]> =>
    apiRequest('/ai-tutor/sessions').then((sessions: any) =>
      sessions.map((session: any) => ({
        id: session.id,
        title: session.title,
        date: session.created_at, // Map created_at to date
        messages: (session.messages || []).map((msg: any) => ({
          role: msg.role,
          text: msg.text
        }))
      }))
    ),

  createChatSession: (title: string): Promise<ChatSession> =>
    apiRequest('/ai-tutor/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }).then((session: any) => ({
      id: session.id,
      title: session.title,
      date: session.created_at, // Map created_at to date
      messages: (session.messages || []).map((msg: any) => ({
        role: msg.role,
        text: msg.text
      }))
    })),

  addChatMessage: (sessionId: string, role: 'user' | 'model', text: string): Promise<{ role: string; text: string }> =>
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
      messages: (session.messages || []).map((msg: any) => ({
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
export const plannerAPI = {
  getEvents: (params: { date?: string; type?: string; completed?: boolean } = {}): Promise<StudyEvent[]> => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
    return apiRequest(`/planner/events?${queryParams}`).then((events: any) => {
      // Transform backend field names to frontend field names
      return events.map((event: any) => ({
        id: event.id,
        title: event.title,
        subject: event.subject,
        date: event.event_date,
        type: event.event_type,
        isCompleted: event.is_completed,
        notes: event.notes,
        created_at: event.created_at,
        updated_at: event.updated_at
      }));
    });
  },

  createEvent: (event: Omit<StudyEvent, 'id' | 'created_at' | 'updated_at'>): Promise<StudyEvent> => {
    // Map frontend field names to backend field names
    const apiEvent = {
      title: event.title,
      subject: event.subject,
      event_date: event.date,
      event_type: event.type,
      notes: event.notes || ''
    };

    return apiRequest('/planner/events', {
      method: 'POST',
      body: JSON.stringify(apiEvent),
    }).then((createdEvent: any) => ({
      id: createdEvent.id,
      title: createdEvent.title,
      subject: createdEvent.subject,
      date: createdEvent.event_date,
      type: createdEvent.event_type,
      isCompleted: createdEvent.is_completed,
      notes: createdEvent.notes,
      created_at: createdEvent.created_at,
      updated_at: createdEvent.updated_at
    }));
  },

  updateEvent: (id: string, updates: Partial<StudyEvent>): Promise<StudyEvent> => {
    // Map frontend field names to backend field names
    const apiUpdates: any = { ...updates };
    if (updates.date !== undefined) {
      apiUpdates.event_date = updates.date;
      delete apiUpdates.date;
    }
    if (updates.type !== undefined) {
      apiUpdates.event_type = updates.type;
      delete apiUpdates.type;
    }
    if (updates.isCompleted !== undefined) {
      apiUpdates.is_completed = updates.isCompleted;
      delete apiUpdates.isCompleted;
    }

    return apiRequest(`/planner/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(apiUpdates),
    }).then((updatedEvent: any) => ({
      id: updatedEvent.id,
      title: updatedEvent.title,
      subject: updatedEvent.subject,
      date: updatedEvent.event_date,
      type: updatedEvent.event_type,
      isCompleted: updatedEvent.is_completed,
      notes: updatedEvent.notes,
      created_at: updatedEvent.created_at,
      updated_at: updatedEvent.updated_at
    }));
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
    xpEarned: number;
    isHighScore?: boolean;
  }): Promise<{ subject: string; score: number; totalQuestions: number; timeSpent: string; xpEarned: number; isHighScore: boolean }> =>
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

  getUsers: (params: { limit?: number; offset?: number; search?: string } = {}): Promise<{
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

  getSystemLogs: (): Promise<{ timestamp: string; level: string; message: string }[]> =>
    apiRequest('/admin/logs'),

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

  inviteAdmin: (data: { email: string; name: string; role?: string }): Promise<void> =>
    apiRequest('/admin/admins/invite', {
      method: 'POST',
      body: JSON.stringify(data),
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
      notes?: string;
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
    }, false), // Optional auth - works for both logged in and guest users

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

    deletePosition: (id: string): Promise<void> =>
      apiRequest(`/careers/admin/positions/${id}`, {
        method: 'DELETE',
      }),

    getApplications: (params?: {
      position_id?: string;
      status?: 'Pending' | 'Under Review' | 'Interview' | 'Accepted' | 'Rejected';
    }): Promise<Array<{
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
    }>> => {
      const queryParams = new URLSearchParams();
      if (params?.position_id) queryParams.append('position_id', params.position_id);
      if (params?.status) queryParams.append('status', params.status);
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

    deleteApplication: (id: string): Promise<void> =>
      apiRequest(`/careers/admin/applications/${id}`, {
        method: 'DELETE',
      }),
  },
};