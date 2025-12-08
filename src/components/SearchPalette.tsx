import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, FileText, PlayCircle, MessageSquare, ArrowRight, LayoutDashboard, CalendarDays, Sparkles, BrainCircuit, Users, User, Command, Crown, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { searchAPI } from '../services/api';
import { useToast } from '../context/ToastContext';

interface SearchPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATIC_PAGES = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, keywords: ['home', 'overview'] },
  { title: 'Study Planner', url: '/planner', icon: CalendarDays, keywords: ['schedule', 'calendar', 'task'] },
  { title: 'AI Tutor', url: '/ai-tutor', icon: Sparkles, keywords: ['chat', 'help', 'bot', 'gemini'] },
  { title: 'Practice Center', url: '/practice', icon: BrainCircuit, keywords: ['quiz', 'test', 'exam'] },
  { title: 'Library', url: '/library', icon: Search, keywords: ['books', 'documents', 'files', 'resources'] },
  { title: 'Video Classroom', url: '/videos', icon: PlayCircle, keywords: ['watch', 'lessons', 'tutorials', 'class'] },
  { title: 'Community', url: '/community', icon: Users, keywords: ['forum', 'discussion', 'help'] },
  { title: 'My Profile', url: '/profile', icon: User, keywords: ['account', 'settings'] },
  { title: 'Subscription', url: '/subscription', icon: Crown, keywords: ['upgrade', 'pro', 'plan', 'billing'] },
];

const SearchPalette: React.FC<SearchPaletteProps> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { documents, videos, forumPosts } = useData();
  const navigate = useNavigate();
  const { addToast } = useToast();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedIndex(0);
      // Small timeout to ensure DOM is rendered before focus
      setTimeout(() => inputRef.current?.focus(), 10);
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // Search effect
  useEffect(() => {
    const performSearch = async () => {
      if (!searchTerm.trim()) {
        setSearchResults([]);
        setSuggestions([]);
        return;
      }

      setIsSearching(true);
      try {
        // Get search suggestions for autocomplete
        const suggestionResult = await searchAPI.suggestions(searchTerm, 5);
        setSuggestions(suggestionResult.suggestions);

        // Perform main search
        const searchResult = await searchAPI.basic({
          q: searchTerm,
          limit: 8
        });

        // Filter Navigation Pages (client-side for now)
        const lowerTerm = searchTerm.toLowerCase();
        const pages = STATIC_PAGES.filter(p =>
          p.title.toLowerCase().includes(lowerTerm) ||
          p.keywords.some(k => k.includes(lowerTerm))
        ).map(p => ({ ...p, type: 'navigation' as const }));

        // Combine backend results with navigation pages
        setSearchResults([...pages, ...searchResult.results]);

      } catch (error) {
        console.error('Search error:', error);
        addToast('Search failed. Please try again.', 'error');
        setSearchResults([]);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(performSearch, 300); // Debounce search
    return () => clearTimeout(debounceTimer);
  }, [searchTerm, addToast]);

  // Use searchResults instead of computed results
  const results = searchResults;

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          navigate(results[selectedIndex].url);
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, navigate, onClose, isSearching]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[70vh]">
        <div className="flex items-center px-4 py-4 border-b border-zinc-100 gap-3">
          <Search className="text-zinc-400" size={20} />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-lg focus:outline-none placeholder-zinc-400 text-zinc-900"
            placeholder="Search pages, documents, videos..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <button 
            onClick={onClose}
            className="p-1 bg-zinc-100 rounded text-xs font-medium text-zinc-500 hover:bg-zinc-200"
          >
            ESC
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1 p-2">
          {isSearching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-zinc-400" />
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-1">
              <p className="px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Results {results.length > 0 && <span className="text-zinc-500">({results.length})</span>}
              </p>
              {results.map((result, index) => (
                <div
                  key={`${result.type}-${(result as any).id || result.title}`}
                  onClick={() => {
                    navigate(result.url);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                    index === selectedIndex ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    result.type === 'navigation' ? 'bg-zinc-900 text-white' :
                    result.type === 'document' ? 'bg-indigo-100 text-indigo-600' :
                    result.type === 'video' ? 'bg-rose-100 text-rose-600' :
                    'bg-emerald-100 text-emerald-600'
                  }`}>
                    {result.type === 'navigation' && React.createElement((result as any).icon, { size: 16 })}
                    {result.type === 'document' && <FileText size={16} />}
                    {result.type === 'video' && <PlayCircle size={16} />}
                    {result.type === 'post' && <MessageSquare size={16} />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-zinc-900 truncate">{result.title}</h4>
                    {result.type === 'navigation' && (
                      <p className="text-xs text-zinc-500 truncate">Go to page</p>
                    )}
                    {result.type === 'document' && (
                      <p className="text-xs text-zinc-500 truncate">
                        Document • {result.subject} • Grade {result.grade}
                        {result.isPremium && <span className="ml-1 text-amber-600">★</span>}
                      </p>
                    )}
                    {result.type === 'video' && (
                      <p className="text-xs text-zinc-500 truncate">
                        Video • {result.subject} • Grade {result.grade}
                        {result.isPremium && <span className="ml-1 text-amber-600">★</span>}
                      </p>
                    )}
                    {result.type === 'post' && (
                      <p className="text-xs text-zinc-500 truncate">
                        Discussion • {result.subject} • Grade {result.grade}
                        {result.commentCount !== undefined && ` • ${result.commentCount} replies`}
                      </p>
                    )}
                  </div>
                  
                  {index === selectedIndex && <ArrowRight size={16} className="text-zinc-400" />}
                </div>
              ))}
            </div>
          ) : searchTerm ? (
            <div className="py-12 text-center text-zinc-500">
              <p>No results found for "{searchTerm}"</p>
            </div>
          ) : (
            <div className="py-12 text-center">
              <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-3 text-zinc-300">
                <Command size={24} />
              </div>
              <p className="text-sm text-zinc-400">Type to search across the entire platform.</p>
              <div className="flex justify-center gap-4 mt-4">
                 <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-50 px-2 py-1 rounded border border-zinc-100">
                    <LayoutDashboard size={12} /> Pages
                 </div>
                 <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-50 px-2 py-1 rounded border border-zinc-100">
                    <FileText size={12} /> Documents
                 </div>
                 <div className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-50 px-2 py-1 rounded border border-zinc-100">
                    <PlayCircle size={12} /> Videos
                 </div>
              </div>
            </div>
          )}
        </div>
        
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50 text-xs text-zinc-400 flex justify-between">
            <span>Select with <kbd className="font-sans font-semibold">↑</kbd> <kbd className="font-sans font-semibold">↓</kbd></span>
            <span>Open with <kbd className="font-sans font-semibold">Enter</kbd></span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SearchPalette;