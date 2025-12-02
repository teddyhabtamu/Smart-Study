
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, BookOpen, Lock, Filter, ArrowUpDown, Bookmark } from 'lucide-react';
import { SUBJECTS, GRADES } from '../constants';
import { Document } from '../types';
import CustomSelect, { Option } from '../components/CustomSelect';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';

const Library: React.FC = () => {
  const { documents } = useData();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [selectedGrade, setSelectedGrade] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [showSavedOnly, setShowSavedOnly] = useState(false);

  const filteredDocs = useMemo(() => {
    let docs = documents.filter(doc => {
      const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            doc.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSubject = selectedSubject === 'All' || doc.subject === selectedSubject;
      const matchesGrade = selectedGrade === 'All' || doc.grade.toString() === selectedGrade;
      const matchesSaved = !showSavedOnly || (user?.bookmarks?.includes(doc.id));
      return matchesSearch && matchesSubject && matchesGrade && matchesSaved;
    });

    // Sorting Logic
    return docs.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      if (sortBy === 'popular') return b.downloads - a.downloads;
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return 0;
    });
  }, [documents, searchTerm, selectedSubject, selectedGrade, sortBy, showSavedOnly, user]);

  const subjectOptions: Option[] = SUBJECTS.map(s => ({ label: s === 'All' ? 'All Subjects' : s, value: s }));
  const gradeOptions: Option[] = GRADES.map(g => ({ label: g === 'All' ? 'All Grades' : `Grade ${g}`, value: g }));
  const sortOptions: Option[] = [
    { label: 'Newest First', value: 'newest' },
    { label: 'Most Popular', value: 'popular' },
    { label: 'A-Z Title', value: 'title' },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Library</h1>
          <p className="text-zinc-500">Explore educational resources.</p>
        </div>

        {/* Search & Filters */}
        <div className="space-y-4">
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-zinc-400" />
             </div>
             <input
               type="text"
               className="block w-full pl-10 pr-3 py-3 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-300 transition-all shadow-sm"
               placeholder="Search by title, topic, or keyword..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
            <div className="hidden lg:flex h-[42px] w-9 items-center justify-center bg-zinc-100 rounded-lg text-zinc-500 border border-zinc-200 flex-shrink-0">
               <Filter size={14} />
            </div>
            
            <div className="w-full lg:w-48">
              <CustomSelect 
                options={subjectOptions}
                value={selectedSubject}
                onChange={setSelectedSubject}
                placeholder="Select Subject"
              />
            </div>

            <div className="w-full lg:w-40">
              <CustomSelect 
                options={gradeOptions}
                value={selectedGrade}
                onChange={setSelectedGrade}
                placeholder="Select Grade"
              />
            </div>

            {user && (
              <button
                onClick={() => setShowSavedOnly(!showSavedOnly)}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  showSavedOnly 
                    ? 'bg-amber-50 text-amber-700 border-amber-200' 
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                <Bookmark size={16} className={showSavedOnly ? "fill-current" : ""} />
                <span className="whitespace-nowrap">Saved</span>
              </button>
            )}

            <div className="w-full lg:w-48 lg:ml-auto flex items-center gap-2">
               <div className="hidden lg:flex h-[42px] w-9 items-center justify-center bg-zinc-100 rounded-lg text-zinc-500 border border-zinc-200 flex-shrink-0">
                 <ArrowUpDown size={14} />
               </div>
               <CustomSelect 
                  options={sortOptions}
                  value={sortBy}
                  onChange={setSortBy}
                  placeholder="Sort By"
                />
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDocs.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} />
        ))}
      </div>

      {filteredDocs.length === 0 && (
        <div className="py-20 text-center border border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
          <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-3 text-zinc-400">
             <Search size={20} />
          </div>
          <p className="text-zinc-900 font-medium text-sm">No documents found</p>
          <p className="text-zinc-500 text-xs mt-1">
            {showSavedOnly ? "You haven't saved any documents matching these filters." : "Try adjusting your search or filters."}
          </p>
          <button 
            onClick={() => {setSearchTerm(''); setSelectedSubject('All'); setSelectedGrade('All'); setShowSavedOnly(false);}}
            className="mt-4 text-xs font-medium text-zinc-900 hover:text-black bg-zinc-100 px-3 py-1.5 rounded-md transition-colors"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
};

const DocumentCard: React.FC<{ doc: Document }> = ({ doc }) => (
  <Link to={`/document/${doc.id}`} className="group bg-white rounded-xl border border-zinc-200 overflow-hidden hover:border-zinc-300 hover:shadow-card transition-all flex flex-col h-full">
    <div className="relative h-40 bg-zinc-100 overflow-hidden">
      <img src={doc.previewImage} alt={doc.title} className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-500" />
      
      {doc.isPremium && (
        <div className="absolute top-3 right-3 bg-zinc-900/90 text-white px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm shadow-sm">
          <Lock size={10} /> Premium
        </div>
      )}
      <div className="absolute bottom-3 left-3 flex gap-2">
         <span className="bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-zinc-800 border border-black/5 shadow-sm">
           {doc.subject}
         </span>
         <span className="bg-white/90 backdrop-blur-sm px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-zinc-800 border border-black/5 shadow-sm">
           Grade {doc.grade}
         </span>
      </div>
    </div>
    
    <div className="p-5 flex-1 flex flex-col">
      <h3 className="font-semibold text-zinc-900 leading-snug mb-2 line-clamp-2 group-hover:text-zinc-600 transition-colors">{doc.title}</h3>
      <p className="text-zinc-500 text-sm mb-4 line-clamp-2 flex-1 font-light leading-relaxed">
        {doc.description}
      </p>
      
      <div className="flex items-center justify-between pt-4 border-t border-zinc-50 mt-auto">
        <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-1">
          {doc.fileType} • {doc.downloads} Downloads
        </span>
        <span className="text-xs font-medium text-zinc-900 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
          View Document <BookOpen size={14} />
        </span>
      </div>
    </div>
  </Link>
);

export default Library;
