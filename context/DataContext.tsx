import React, { createContext, useContext, useState, useEffect } from 'react';
import { Document, VideoLesson, ForumPost, StudyEvent } from './types';
import { MOCK_DOCUMENTS, MOCK_VIDEOS, MOCK_FORUM_POSTS } from './constants';

interface DataContextType {
  documents: Document[];
  videos: VideoLesson[];
  forumPosts: ForumPost[];
  studyEvents: StudyEvent[];
  addDocument: (doc: Document) => void;
  updateDocument: (id: string, updatedDoc: Partial<Document>) => void;
  deleteDocument: (id: string) => void;
  addVideo: (video: VideoLesson) => void;
  updateVideo: (id: string, updatedVideo: Partial<VideoLesson>) => void;
  deleteVideo: (id: string) => void;
  addForumPost: (post: ForumPost) => void;
  updateForumPost: (id: string, updatedPost: Partial<ForumPost>) => void;
  addEvent: (event: StudyEvent) => void;
  toggleEvent: (id: string) => void;
  deleteEvent: (id: string) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [videos, setVideos] = useState<VideoLesson[]>([]);
  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [studyEvents, setStudyEvents] = useState<StudyEvent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from LocalStorage on mount
  useEffect(() => {
    const storedDocs = localStorage.getItem('smartstudy_documents');
    const storedVideos = localStorage.getItem('smartstudy_videos');
    const storedPosts = localStorage.getItem('smartstudy_posts');
    const storedEvents = localStorage.getItem('smartstudy_events');

    if (storedDocs) {
      setDocuments(JSON.parse(storedDocs));
    } else {
      setDocuments(MOCK_DOCUMENTS);
    }

    if (storedVideos) {
      setVideos(JSON.parse(storedVideos));
    } else {
      setVideos(MOCK_VIDEOS);
    }

    if (storedPosts) {
      setForumPosts(JSON.parse(storedPosts));
    } else {
      setForumPosts(MOCK_FORUM_POSTS);
    }

    if (storedEvents) {
      setStudyEvents(JSON.parse(storedEvents));
    } else {
      setStudyEvents([]);
    }
    
    setIsLoaded(true);
  }, []);

  // Save to LocalStorage whenever state changes
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('smartstudy_documents', JSON.stringify(documents));
    }
  }, [documents, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('smartstudy_videos', JSON.stringify(videos));
    }
  }, [videos, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('smartstudy_posts', JSON.stringify(forumPosts));
    }
  }, [forumPosts, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('smartstudy_events', JSON.stringify(studyEvents));
    }
  }, [studyEvents, isLoaded]);

  // Document Actions
  const addDocument = (doc: Document) => {
    setDocuments(prev => [doc, ...prev]);
  };

  const updateDocument = (id: string, updatedDoc: Partial<Document>) => {
    setDocuments(prev => prev.map(doc => doc.id === id ? { ...doc, ...updatedDoc } : doc));
  };

  const deleteDocument = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  // Video Actions
  const addVideo = (video: VideoLesson) => {
    setVideos(prev => [video, ...prev]);
  };

  const updateVideo = (id: string, updatedVideo: Partial<VideoLesson>) => {
    setVideos(prev => prev.map(vid => vid.id === id ? { ...vid, ...updatedVideo } : vid));
  };

  const deleteVideo = (id: string) => {
    setVideos(prev => prev.filter(vid => vid.id !== id));
  };

  // Forum Actions
  const addForumPost = (post: ForumPost) => {
    setForumPosts(prev => [post, ...prev]);
  };

  const updateForumPost = (id: string, updatedPost: Partial<ForumPost>) => {
    setForumPosts(prev => prev.map(post => post.id === id ? { ...post, ...updatedPost } : post));
  };

  // Planner Actions
  const addEvent = (event: StudyEvent) => {
    setStudyEvents(prev => [...prev, event]);
  };

  const toggleEvent = (id: string) => {
    setStudyEvents(prev => prev.map(e => e.id === id ? { ...e, isCompleted: !e.isCompleted } : e));
  };

  const deleteEvent = (id: string) => {
    setStudyEvents(prev => prev.filter(e => e.id !== id));
  };

  return (
    <DataContext.Provider value={{
      documents,
      videos,
      forumPosts,
      studyEvents,
      addDocument,
      updateDocument,
      deleteDocument,
      addVideo,
      updateVideo,
      deleteVideo,
      addForumPost,
      updateForumPost,
      addEvent,
      toggleEvent,
      deleteEvent
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