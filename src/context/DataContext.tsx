import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Document, VideoLesson, Video, ForumPost, StudyEvent, User } from '../types';
import { documentsAPI, videosAPI, forumAPI, plannerAPI, adminAPI, dashboardAPI } from '../services/api';

// Helper function to transform Video API response to VideoLesson format
const transformVideoToVideoLesson = (video: Video): VideoLesson => ({
  id: video.id,
  title: video.title,
  description: video.description || '',
  subject: video.subject,
  grade: video.grade,
  thumbnail: video.thumbnail || '',
  video_url: video.video_url,
  instructor: video.instructor || 'Unknown',
  views: video.views,
  likes: video.likes,
  uploadedAt: new Date(video.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }),
  isPremium: video.is_premium
});

interface DataContextType {
  // Data state
  documents: Document[];
  videos: VideoLesson[];
  forumPosts: (ForumPost & { author: string; author_role: string; comment_count: number })[];
  studyEvents: StudyEvent[];
  allUsers: User[];
  dashboardData: {
    user: {
      id: string;
      name: string;
      xp: number;
      level: number;
      streak: number;
      isPremium: boolean;
      bookmarks: string[];
    };
    todaysEvents: StudyEvent[];
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
  } | null;

  // Loading states
  loading: {
    documents: boolean;
    videos: boolean;
    forumPosts: boolean;
    studyEvents: boolean;
    users: boolean;
    dashboard: boolean;
  };

  // Error states
  errors: {
    documents: string | null;
    videos: string | null;
    forumPosts: string | null;
    studyEvents: string | null;
    users: string | null;
  };

  // Data fetching functions
  fetchDocuments: (params?: { subject?: string; grade?: number; search?: string; tag?: string; excludeTag?: string; limit?: number; offset?: number; append?: boolean }) => Promise<{ hasMore: boolean } | void>;
  fetchMoreDocuments: (params?: { subject?: string; grade?: number; search?: string; tag?: string; excludeTag?: string; limit?: number; offset?: number }) => Promise<{ hasMore: boolean }>;
  fetchVideos: (params?: { subject?: string; grade?: number; search?: string; limit?: number; offset?: number; append?: boolean }) => Promise<{ hasMore: boolean } | void>;
  fetchMoreVideos: (params?: { subject?: string; grade?: number; search?: string; limit?: number; offset?: number }) => Promise<{ hasMore: boolean }>;
  fetchForumPosts: (params?: { subject?: string; grade?: number; search?: string; limit?: number; offset?: number }) => Promise<void>;
  fetchStudyEvents: (params?: { date?: string; type?: string; completed?: boolean }) => Promise<void>;
  fetchUsers: (params?: { limit?: number; offset?: number; search?: string }) => Promise<void>;
  fetchDashboard: () => Promise<void>;

  // CRUD operations
  createDocument: (doc: Omit<Document, 'id' | 'created_at' | 'updated_at'>) => Promise<Document>;
  updateDocument: (id: string, updates: Partial<Document>) => Promise<Document>;
  deleteDocument: (id: string) => Promise<void>;

  createVideo: (video: Omit<VideoLesson, 'id' | 'uploadedAt'>) => Promise<VideoLesson>;
  updateVideo: (id: string, updates: Partial<VideoLesson>) => Promise<VideoLesson>;
  deleteVideo: (id: string) => Promise<void>;

  createForumPost: (post: { title: string; content: string; subject: string; grade: number; tags?: string[] }) => Promise<ForumPost>;
  updateForumPost: (id: string, updates: Partial<ForumPost>) => Promise<ForumPost>;
  deleteForumPost: (id: string) => Promise<void>;

  createStudyEvent: (event: Omit<StudyEvent, 'id' | 'created_at' | 'updated_at'>) => Promise<StudyEvent>;
  updateStudyEvent: (id: string, updates: Partial<StudyEvent>) => Promise<StudyEvent>;
  deleteStudyEvent: (id: string) => Promise<void>;

  updateUserStatus: (id: string, updates: Partial<User>) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Data state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [videos, setVideos] = useState<VideoLesson[]>([]);
  const [forumPosts, setForumPosts] = useState<(ForumPost & { author: string; author_role: string; comment_count: number })[]>([]);
  const [studyEvents, setStudyEvents] = useState<StudyEvent[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [dashboardData, setDashboardData] = useState<DataContextType['dashboardData']>(null);

  // Loading states
  const [loading, setLoading] = useState({
    documents: false,
    videos: false,
    forumPosts: false,
    studyEvents: false,
    users: false,
    dashboard: false,
  });

  // Error states
  const [errors, setErrors] = useState({
    documents: null as string | null,
    videos: null as string | null,
    forumPosts: null as string | null,
    studyEvents: null as string | null,
    users: null as string | null,
    dashboard: null as string | null,
  });

  // Helper function to update loading state
  const setLoadingState = (key: keyof typeof loading, value: boolean) => {
    setLoading(prev => ({ ...prev, [key]: value }));
  };

  // Helper function to update error state
  const setErrorState = (key: keyof typeof errors, value: string | null) => {
    setErrors(prev => ({ ...prev, [key]: value }));
  };

  // Data fetching functions
  const fetchDocuments = useCallback(async (params?: { subject?: string; grade?: number; search?: string; tag?: string; excludeTag?: string; limit?: number; offset?: number; append?: boolean }) => {
    try {
      setLoadingState('documents', true);
      setErrorState('documents', null);
      
      // Clear documents first if not appending to prevent flicker
      if (!params?.append) {
        setDocuments([]);
      }
      
      const response = await documentsAPI.getAll(params);
      
      // Client-side filtering for excludeTag (safety measure) - filter BEFORE setting state
      let filteredDocs = response.documents;
      if (params?.excludeTag) {
        filteredDocs = filteredDocs.filter(doc => {
          if (!doc.tags || !Array.isArray(doc.tags)) return true; // Include docs with no tags
          return !doc.tags.includes(params.excludeTag!);
        });
      }
      
      // Client-side filtering for tag (safety measure) - filter BEFORE setting state
      if (params?.tag) {
        filteredDocs = filteredDocs.filter(doc => {
          if (!doc.tags || !Array.isArray(doc.tags)) return false; // Exclude docs with no tags when filtering by tag
          return doc.tags.includes(params.tag!);
        });
      }
      
      // Only set documents after filtering is complete
      if (params?.append) {
        // Append new documents to existing ones, avoiding duplicates
        setDocuments(prev => {
          const existingIds = new Set(prev.map(doc => doc.id));
          const newDocs = filteredDocs.filter(doc => !existingIds.has(doc.id));
          return [...prev, ...newDocs];
        });
      } else {
        // Replace documents (initial load or filter change) - only set filtered data
        setDocuments(filteredDocs);
      }
      
      return { hasMore: response.pagination.hasMore };
    } catch (error: any) {
      console.error('Fetch documents error:', error);
      setErrorState('documents', error.message || 'Failed to fetch documents');
      // Clear documents on error to prevent showing stale data
      if (!params?.append) {
        setDocuments([]);
      }
    } finally {
      setLoadingState('documents', false);
    }
  }, []);

  const fetchMoreDocuments = useCallback(async (params?: { subject?: string; grade?: number; search?: string; tag?: string; excludeTag?: string; limit?: number; offset?: number }) => {
    try {
      setLoadingState('documents', true);
      const response = await documentsAPI.getAll(params);
      
      // Client-side filtering for excludeTag (safety measure) - filter BEFORE setting state
      let filteredDocs = response.documents;
      if (params?.excludeTag) {
        filteredDocs = filteredDocs.filter(doc => {
          if (!doc.tags || !Array.isArray(doc.tags)) return true; // Include docs with no tags
          return !doc.tags.includes(params.excludeTag!);
        });
      }
      
      // Client-side filtering for tag (safety measure) - filter BEFORE setting state
      if (params?.tag) {
        filteredDocs = filteredDocs.filter(doc => {
          if (!doc.tags || !Array.isArray(doc.tags)) return false; // Exclude docs with no tags when filtering by tag
          return doc.tags.includes(params.tag!);
        });
      }
      
      // Avoid duplicates when loading more - only add filtered documents
      setDocuments(prev => {
        const existingIds = new Set(prev.map(doc => doc.id));
        const newDocs = filteredDocs.filter(doc => !existingIds.has(doc.id));
        return [...prev, ...newDocs];
      });
      return { hasMore: response.pagination.hasMore };
    } catch (error: any) {
      console.error('Fetch more documents error:', error);
      setErrorState('documents', error.message || 'Failed to fetch more documents');
      return { hasMore: false };
    } finally {
      setLoadingState('documents', false);
    }
  }, []);

  const fetchVideos = useCallback(async (params?: { subject?: string; grade?: number; search?: string; limit?: number; offset?: number; append?: boolean }) => {
    try {
      setLoadingState('videos', true);
      setErrorState('videos', null);
      const response = await videosAPI.getAll(params);
      const transformedVideos = response.videos.map(transformVideoToVideoLesson);
      
      if (params?.append) {
        // Append new videos to existing ones
        setVideos(prev => [...prev, ...transformedVideos]);
      } else {
        // Replace videos (initial load or filter change)
        setVideos(transformedVideos);
      }
      
      return { hasMore: response.pagination.hasMore };
    } catch (error: any) {
      console.error('Fetch videos error:', error);
      setErrorState('videos', error.message || 'Failed to fetch videos');
    } finally {
      setLoadingState('videos', false);
    }
  }, []);

  const fetchMoreVideos = useCallback(async (params?: { subject?: string; grade?: number; search?: string; limit?: number; offset?: number }) => {
    try {
      setLoadingState('videos', true);
      const response = await videosAPI.getAll(params);
      const transformedVideos = response.videos.map(transformVideoToVideoLesson);
      setVideos(prev => [...prev, ...transformedVideos]);
      return { hasMore: response.pagination.hasMore };
    } catch (error: any) {
      console.error('Fetch more videos error:', error);
      setErrorState('videos', error.message || 'Failed to fetch more videos');
      return { hasMore: false };
    } finally {
      setLoadingState('videos', false);
    }
  }, []);

  const fetchForumPosts = useCallback(async (params?: { subject?: string; grade?: number; search?: string; limit?: number; offset?: number }) => {
    try {
      setLoadingState('forumPosts', true);
      setErrorState('forumPosts', null);
      const response = await forumAPI.getPosts(params);
      setForumPosts(response.posts);
    } catch (error: any) {
      console.error('Fetch forum posts error:', error);
      setErrorState('forumPosts', error.message || 'Failed to fetch forum posts');
    } finally {
      setLoadingState('forumPosts', false);
    }
  }, []);

  const fetchStudyEvents = useCallback(async (params?: { date?: string; type?: string; completed?: boolean }) => {
    try {
      setLoadingState('studyEvents', true);
      setErrorState('studyEvents', null);
      const events = await plannerAPI.getEvents(params);
      setStudyEvents(Array.isArray(events) ? events : []);
    } catch (error: any) {
      console.error('Fetch study events error:', error);
      setErrorState('studyEvents', error.message || 'Failed to fetch study events');
    } finally {
      setLoadingState('studyEvents', false);
    }
  }, []);

  const fetchUsers = useCallback(async (params?: { limit?: number; offset?: number; search?: string }) => {
    try {
      setLoadingState('users', true);
      setErrorState('users', null);
      const response = await adminAPI.getUsers(params);
      setAllUsers(response.users);
    } catch (error: any) {
      console.error('Fetch users error:', error);
      setErrorState('users', error.message || 'Failed to fetch users');
    } finally {
      setLoadingState('users', false);
    }
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoadingState('dashboard', true);
      setErrorState('dashboard', null);
      const data = await dashboardAPI.getData();

      // Transform todaysEvents to match StudyEvent interface
      const transformedEvents: StudyEvent[] = data.todaysEvents.map(event => ({
        id: event.id,
        title: event.title,
        subject: event.subject,
        date: new Date().toISOString().split('T')[0], // Today's date
        type: event.type,
        isCompleted: event.isCompleted,
        notes: event.notes
      }));

      setDashboardData({
        ...data,
        todaysEvents: transformedEvents
      });

      // Also update the studyEvents state for compatibility
      setStudyEvents(prev => {
        const existingIds = new Set(transformedEvents.map(e => e.id));
        const filteredExisting = prev.filter(e => !existingIds.has(e.id));
        return [...filteredExisting, ...transformedEvents];
      });
    } catch (error: any) {
      console.error('Fetch dashboard error:', error);
      // For timeout/network errors, don't show error state if we have cached data
      // This allows the dashboard to continue working with stale data
      if (error?.isTimeout || error?.isNetworkError) {
        // Only set error if we don't have any cached dashboard data
        if (!dashboardData) {
          setErrorState('dashboard', error.message || 'Connection timeout. Please check your internet connection.');
        } else {
          // Keep existing data and just log the error
          console.warn('Dashboard fetch failed, using cached data');
        }
      } else {
        setErrorState('dashboard', error.message || 'Failed to fetch dashboard data');
      }
    } finally {
      setLoadingState('dashboard', false);
    }
  }, [dashboardData]);

  // CRUD operations
  const createDocument = async (doc: Omit<Document, 'id' | 'created_at' | 'updated_at'>): Promise<Document> => {
    const createdDoc = await documentsAPI.create(doc);
    setDocuments(prev => [createdDoc, ...prev]);
    return createdDoc;
  };

  const updateDocument = async (id: string, updates: Partial<Document>): Promise<Document> => {
    const updatedDoc = await documentsAPI.update(id, updates);
    setDocuments(prev => prev.map(doc => doc.id === id ? updatedDoc : doc));
    return updatedDoc;
  };

  const deleteDocument = async (id: string): Promise<void> => {
    await documentsAPI.delete(id);
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  const createVideo = async (video: Omit<VideoLesson, 'id' | 'uploadedAt'>): Promise<VideoLesson> => {
    // Transform VideoLesson to Video format for API
    const apiVideo = {
      ...video,
      is_premium: video.isPremium,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      uploaded_by: 'admin' // Default for now
    };
    const createdVideo = await videosAPI.create(apiVideo as Omit<Video, 'id' | 'created_at' | 'updated_at'>);
    const transformedVideo = transformVideoToVideoLesson(createdVideo);
    setVideos(prev => [transformedVideo, ...prev]);
    return transformedVideo;
  };

  const updateVideo = async (id: string, updates: Partial<VideoLesson>): Promise<VideoLesson> => {
    // Map VideoLesson fields (camelCase) to Video API fields (snake_case)
    const apiUpdates: any = { ...updates };
    // Handle isPremium -> is_premium mapping
    if ('isPremium' in updates && updates.isPremium !== undefined) {
      apiUpdates.is_premium = updates.isPremium;
      delete apiUpdates.isPremium;
    }
    // If is_premium is already in updates (from Admin.tsx), keep it
    // This handles both cases: camelCase from VideoLesson or snake_case from direct API calls
    
    const updatedVideo = await videosAPI.update(id, apiUpdates);
    const transformedVideo = transformVideoToVideoLesson(updatedVideo);
    // Convert both IDs to strings for comparison to handle number/string mismatches
    setVideos(prev => prev.map(vid => String(vid.id) === String(id) ? transformedVideo : vid));
    return transformedVideo;
  };

  const deleteVideo = async (id: string): Promise<void> => {
    await videosAPI.delete(id);
    setVideos(prev => prev.filter(vid => vid.id !== id));
  };

  const createForumPost = async (post: { title: string; content: string; subject: string; grade: number; tags?: string[] }): Promise<ForumPost> => {
    const createdPost = await forumAPI.createPost(post);
    await fetchForumPosts(); // Refresh the list
    return createdPost;
  };

  const updateForumPost = async (id: string, updates: Partial<ForumPost>): Promise<ForumPost> => {
    const updatedPost = await forumAPI.updatePost(id, updates);
    setForumPosts(prev => prev.map(post => post.id === id ? { ...post, ...updates } : post));
    return updatedPost;
  };

  const deleteForumPost = async (id: string): Promise<void> => {
    await forumAPI.deletePost(id);
    setForumPosts(prev => prev.filter(post => post.id !== id));
  };

  const createStudyEvent = async (event: Omit<StudyEvent, 'id' | 'created_at' | 'updated_at'>): Promise<StudyEvent> => {
    const createdEvent = await plannerAPI.createEvent(event);
    setStudyEvents(prev => [...prev, createdEvent]);
    
    // Refresh dashboard if the event is for today
    const today = new Date().toISOString().split('T')[0];
    if (event.date === today) {
      await fetchDashboard();
    }
    
    return createdEvent;
  };

  const updateStudyEvent = async (id: string, updates: Partial<StudyEvent>): Promise<StudyEvent> => {
    const updatedEvent = await plannerAPI.updateEvent(id, updates);
    setStudyEvents(prev => prev.map(event => event.id === id ? updatedEvent : event));
    
    // Refresh dashboard if completion status changed (affects today's progress)
    if (updates.isCompleted !== undefined) {
      await fetchDashboard();
    }
    
    return updatedEvent;
  };

  const deleteStudyEvent = async (id: string): Promise<void> => {
    // Check if the event being deleted is for today before deleting
    const eventToDelete = studyEvents.find(e => e.id === id);
    const today = new Date().toISOString().split('T')[0];
    const isTodaysEvent = eventToDelete?.date === today;
    
    await plannerAPI.deleteEvent(id);
    setStudyEvents(prev => prev.filter(event => event.id !== id));
    
    // Refresh dashboard if the deleted event was for today
    if (isTodaysEvent) {
      await fetchDashboard();
    }
  };

  const updateUserStatus = async (id: string, updates: Partial<User>): Promise<void> => {
    await adminAPI.updateUserPremium(id, updates.isPremium || false);
    setAllUsers(prev => prev.map(user => user.id === id ? { ...user, ...updates } : user));
  };

  return (
    <DataContext.Provider value={{
      // Data
      documents,
      videos,
      forumPosts,
      studyEvents,
      allUsers,
      dashboardData,

      // Loading states
      loading,

      // Error states
      errors,

      // Data fetching
      fetchDocuments,
      fetchMoreDocuments,
      fetchVideos,
      fetchMoreVideos,
      fetchForumPosts,
      fetchStudyEvents,
      fetchUsers,
      fetchDashboard,

      // CRUD operations
      createDocument,
      updateDocument,
      deleteDocument,
      createVideo,
      updateVideo,
      deleteVideo,
      createForumPost,
      updateForumPost,
      deleteForumPost,
      createStudyEvent,
      updateStudyEvent,
      deleteStudyEvent,
      updateUserStatus
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};