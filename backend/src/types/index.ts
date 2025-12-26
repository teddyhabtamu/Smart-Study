// Database entity types
export interface User {
  id: string;
  name: string;
  email: string;
  password_hash?: string; // Only used in database operations
  role: 'STUDENT' | 'ADMIN' | 'MODERATOR' | 'TUTOR';
  status?: 'Active' | 'Banned' | 'Suspended' | 'Inactive';
  email_verified?: boolean;
  is_premium: boolean;
  avatar?: string;
  preferences: {
    emailNotifications: boolean;
    studyReminders: boolean;
  };
  // Added for convenience in middleware/verify responses
  bookmarks?: string[];
  xp: number;
  level: number;
  streak: number;
  last_active_date: string;
  unlocked_badges: string[];
  practice_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  is_read: boolean;
  created_at: string;
}

export interface Bookmark {
  id: string;
  user_id: string;
  item_id: string;
  item_type: 'document' | 'video';
  created_at: string;
}

export interface Document {
  id: string;
  title: string;
  description?: string;
  subject: string;
  grade: number;
  file_type: 'PDF' | 'DOCX' | 'PPT';
  file_path?: string;
  file_size?: number;
  is_premium: boolean;
  downloads: number;
  preview_image?: string;
  tags: string[];
  author?: string;
  uploaded_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: string;
  title: string;
  description?: string;
  subject: string;
  grade: number;
  thumbnail?: string;
  video_url: string;
  instructor?: string;
  views: number;
  likes: number;
  is_premium: boolean;
  uploaded_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  author_id: string;
  subject: string;
  grade: number;
  votes: number;
  views: number;
  tags: string[];
  is_solved: boolean;
  is_edited: boolean;
  ai_answer?: string;
  created_at: string;
  updated_at: string;
}

export interface ForumComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  votes: number;
  is_accepted: boolean;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  messages: Array<{
    role: 'user' | 'model';
    text: string;
    timestamp: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface StudyEvent {
  id: string;
  user_id: string;
  title: string;
  subject: string;
  event_date: string;
  event_type: 'Exam' | 'Revision' | 'Assignment';
  is_completed: boolean;
  is_archived: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon_name: string;
  required_level?: number;
}

export interface JobPosition {
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
}

export interface JobApplication {
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
  is_archived?: boolean;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

// API Request/Response types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: any[];
}

// JWT payload type
export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}
