export enum UserRole {
  STUDENT = 'STUDENT',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
  TUTOR = 'TUTOR'
}

export interface UserPreferences {
  emailNotifications: boolean;
  studyReminders: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  date: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  iconName: string; // We'll map string names to Lucide icons
  requiredLevel?: number;
  requiredStreak?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isPremium: boolean;
  bookmarks: string[]; // Array of Document or Video IDs
  avatar?: string; // Base64 Data URL
  preferences?: UserPreferences;

  // Status and dates
  status?: 'Active' | 'Banned' | 'Inactive';
  joinedDate?: string; // ISO date string

  // Gamification
  xp: number;
  level: number;
  streak: number;
  lastActiveDate: string; // YYYY-MM-DD
  unlockedBadges: string[];

  // Usage Tracking
  practiceAttempts?: number;

  // Notifications
  notifications: NotificationItem[];
}

export enum FileType {
  PDF = 'PDF',
  DOCX = 'DOCX',
  PPT = 'PPT',
  VIDEO = 'VIDEO'
}

export interface Document {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade: number; // 9, 10, 11, 12
  file_type: FileType;
  file_url?: string; // URL to the actual document file
  is_premium: boolean;
  uploadedAt: string;
  downloads: number;
  preview_image: string;
  tags: string[];
  author?: string;
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
  uploadedAt?: string;
  created_at: string;
  updated_at: string;
  user_has_liked?: boolean;
  user_has_completed?: boolean;
}

export interface VideoLesson {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade: number;
  thumbnail: string;
  video_url: string; // YouTube ID or URL
  instructor: string;
  views: number;
  likes: number;
  uploadedAt: string;
  isPremium: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface ForumComment {
  id: string;
  author: string;
  role: UserRole;
  content: string;
  createdAt: string;
  votes: number;
  isAccepted?: boolean;
  isEdited?: boolean;
}

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  author: string;
  authorRole: UserRole;
  subject: string;
  grade: number;
  createdAt: string;
  votes: number;
  views: number;
  comments: ForumComment[];
  tags: string[];
  isSolved: boolean;
  isEdited?: boolean;
  aiAnswer?: string; // New field for AI generated verified answer
}

export interface ChatSession {
  id: string; 
  title: string; 
  date: string; 
  messages: { 
    role: string; 
    text: string;
  }[];
}

export interface StudyEvent {
  id: string;
  title: string;
  subject: string;
  date: string; // YYYY-MM-DD
  type: 'Exam' | 'Revision' | 'Assignment';
  isCompleted: boolean;
  notes?: string;
}