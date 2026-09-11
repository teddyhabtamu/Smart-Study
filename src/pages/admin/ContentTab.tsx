import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, FileText, Trash2, Edit2, Search, CheckCircle, Youtube, PlaySquare, Loader2 } from 'lucide-react';
import { GRADES, SUBJECTS } from '../../constants';
import { FileType, Document, VideoLesson } from '../../types';
import CustomSelect, { Option } from '../../components/CustomSelect';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { adminAPI } from '../../services/api';
import { ContentTableSkeleton } from './skeletons';

// Content management tab (extracted from Admin.tsx): documents, videos and
// past-exam papers with create/edit/delete. Owns all form + modal state.
const ContentTab: React.FC = () => {
  const { documents, videos, createDocument, updateDocument, deleteDocument, createVideo, updateVideo, deleteVideo, fetchDocuments, fetchVideos, loading } = useData();
  const { addToast } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const [contentCategory, setContentCategory] = useState<'documents' | 'videos' | 'past-exams'>('documents');
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Common Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [grade, setGrade] = useState('9');
  const [subject, setSubject] = useState('Mathematics');
  const [isPremium, setIsPremium] = useState(false);

  // Document Specific State
  const [docAuthor, setDocAuthor] = useState('');
  const [docFileType, setDocFileType] = useState(FileType.PDF);
  const [docFileUrl, setDocFileUrl] = useState('');
  const [docThumbnailUrl, setDocThumbnailUrl] = useState('');

  // Video Specific State
  const [videoUrl, setVideoUrl] = useState(''); // Note: variable name stays camelCase for UI state
  const [videoInstructor, setVideoInstructor] = useState('');
  const [videoThumbnail, setVideoThumbnail] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    id: string | null;
    title: string | null;
    type: 'document' | 'video' | null;
  }>({
    isOpen: false,
    id: null,
    title: null,
    type: null
  });
  const [searchTerm, setSearchTerm] = useState('');

  const gradeOptions: Option[] = GRADES.filter(g => g !== 'All').map(g => ({ label: `Grade ${g}`, value: g }));
  const subjectOptions: Option[] = SUBJECTS.filter(s => s !== 'All').map(s => ({ label: s, value: s }));
  const fileTypeOptions: Option[] = ['PDF', 'DOCX', 'PPT'].map(t => ({ label: t, value: t }));

  const filteredItems = contentCategory === 'documents'
    ? documents.filter(d => {
        // Exclude past exams from documents view
        const tags = Array.isArray(d.tags) ? d.tags : (d.tags ? [d.tags] : []);
        const isPastExam = tags.some((t: string) => t.toLowerCase() === 'past-exam');
        if (isPastExam) return false;
        return (d.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (d.subject?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      })
    : contentCategory === 'past-exams'
    ? documents.filter(d => {
        // Only show past exams
        const tags = Array.isArray(d.tags) ? d.tags : (d.tags ? [d.tags] : []);
        const isPastExam = tags.some((t: string) => t.toLowerCase() === 'past-exam');
        if (!isPastExam) return false;
        return (d.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (d.subject?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      })
    : videos.filter(v => (v.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (v.subject?.toLowerCase() || '').includes(searchTerm.toLowerCase()));

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setGrade('9');
    setSubject('Mathematics');
    setIsPremium(false);
    
    // Doc reset
    setDocAuthor('');
    setDocFileType(FileType.PDF);
    setDocFileUrl('');
    setDocThumbnailUrl('');

    // Video reset
    setVideoUrl('');
    setVideoInstructor('');
    setVideoThumbnail('');
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const formSectionRef = useRef<HTMLElement>(null);
  
  const scrollToForm = () => {
    if (formSectionRef.current) {
      formSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // --- Handlers ---

  const handleEditDocument = (doc: Document, category: 'documents' | 'past-exams' = 'documents') => {
    // Stay on the tab the admin was looking at: editing a past exam from
    // the Past Exams list used to flip the whole form to Documents.
    setContentCategory(category);
    setEditingId(doc.id);
    setTitle(doc.title);
    setDescription(doc.description);
    setGrade(doc.grade === 0 ? 'General' : doc.grade.toString());
    setSubject(doc.subject);
    setIsPremium(doc.is_premium);
    setDocAuthor(doc.author || '');
    setDocFileType(doc.file_type);
    setDocFileUrl(doc.file_url || '');
    setDocThumbnailUrl(doc.preview_image || '');
    // Use setTimeout to ensure state updates are applied before scrolling
    setTimeout(() => {
      scrollToForm();
    }, 100);
  };

  const handleEditVideo = (video: VideoLesson) => {
    setContentCategory('videos');
    setEditingId(video.id);
    setTitle(video.title);
    setDescription(video.description);
    setGrade(video.grade === 0 ? 'General' : video.grade.toString());
    setSubject(video.subject);
    setIsPremium(video.isPremium);
    setVideoUrl(video.video_url);
    setVideoInstructor(video.instructor);
    setVideoThumbnail(video.thumbnail);
    // Use setTimeout to ensure state updates are applied before scrolling
    setTimeout(() => {
      scrollToForm();
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if ((contentCategory === 'documents' || contentCategory === 'past-exams') && !editingId && (!docFileUrl || !docFileUrl.trim())) {
      addToast(contentCategory === 'past-exams' ? 'Document URL is required to create an exam paper.' : 'Document URL is required to create a document.', 'error');
      return;
    }

    setIsUploading(true);

    try {
      if (contentCategory === 'documents' || contentCategory === 'past-exams') {
        if (editingId) {
          // Verify document exists before updating
          const documentExists = documents.find(doc => doc.id === editingId);
          if (!documentExists) {
            addToast('Document not found. Refreshing document list...', 'warning');
            await fetchDocuments();
            resetForm();
            return;
          }

          // Update Document
          const updateData: any = {
            title, 
            description, 
            subject, 
            is_premium: isPremium, // Backend expects snake_case
            grade: grade === 'General' ? 0 : parseInt(grade),
            file_type: docFileType,
            author: docAuthor
          };

          // Only include file_url if it's not empty
          if (docFileUrl && docFileUrl.trim()) {
            updateData.file_url = docFileUrl.trim();
          }

          // Include thumbnail_url if provided
          if (docThumbnailUrl && docThumbnailUrl.trim()) {
            updateData.preview_image = docThumbnailUrl.trim();
          }

          // Update tags for past exams
          if (contentCategory === 'past-exams') {
            const existingDoc = documents.find(doc => doc.id === editingId);
            const existingTags = existingDoc?.tags || [];
            const hasPastExamTag = existingTags.some((t: string) => t.toLowerCase() === 'past-exam');
            if (!hasPastExamTag) {
              updateData.tags = [...existingTags, 'past-exam'];
            }
          }

          await updateDocument(editingId, updateData);
          addToast(contentCategory === 'past-exams' ? 'Past exam updated successfully!' : 'Document updated successfully!', 'success');
        } else {
          // Create Document or Past Exam - Use adminAPI for proper field mapping
          // (title falls back to a placeholder: there is no file picker, so
          // the old `file.name` fallback it replaced was dead code)
          const documentData: any = {
            title: title || (contentCategory === 'past-exams' ? "New Past Exam" : "New Document"),
            description: description || (contentCategory === 'past-exams' ? "Past exam paper for practice." : "New uploaded material."),
            subject,
            grade: grade === 'General' ? 0 : parseInt(grade),
            file_type: docFileType,
            is_premium: isPremium, // Backend expects snake_case
            author: docAuthor || "Admin",
            tags: contentCategory === 'past-exams' ? ['past-exam'] : []
          };

          // Include file_url (validated above)
          if (docFileUrl && docFileUrl.trim()) {
            documentData.file_url = docFileUrl.trim();
          }

          // Include thumbnail_url if provided
          if (docThumbnailUrl && docThumbnailUrl.trim()) {
            documentData.preview_image = docThumbnailUrl.trim();
          }

          // Use adminAPI instead of createDocument from useData
          await adminAPI.createDocument(documentData);
          addToast(contentCategory === 'past-exams' ? 'Past exam published successfully!' : 'Document published successfully!', 'success');
        }
      } else {
        if (editingId) {
          // Update Video
          const updateData: any = {
            title, description, subject, isPremium,
            grade: grade === 'General' ? 0 : parseInt(grade),
            instructor: videoInstructor
          };

          // Only include video_url if it's not empty
          if (videoUrl && videoUrl.trim()) {
            updateData.video_url = videoUrl.trim();
          }

          // Only include thumbnail if it's not empty
          if (videoThumbnail && videoThumbnail.trim()) {
            updateData.thumbnail = videoThumbnail.trim();
          }

          await updateVideo(editingId, updateData);
          addToast('Video lesson updated successfully!', 'success');
        } else {
          // Create Video (no stock thumbnail: the card renders a gradient
          // fallback when thumbnail is absent, which beats hotlinking a
          // random Unsplash photo into every imageless lesson)
          const videoData: any = {
            title: title || "New Video Lesson",
            description: description || "Video description.",
            subject,
            grade: grade === 'General' ? 0 : parseInt(grade),
            isPremium,
            video_url: videoUrl,
            instructor: videoInstructor,
            views: 0,
            likes: 0
          };
          // Omit entirely when empty: the backend rejects '' as a URL
          if (videoThumbnail.trim()) videoData.thumbnail = videoThumbnail.trim();
          await createVideo(videoData);
          addToast('Video lesson published successfully!', 'success');
        }
      }

      // Refresh data to ensure consistency
      fetchDocuments();
      fetchVideos();
      resetForm();
    } catch (error: any) {
      console.error('Error submitting content:', error);
      const errorMessage = error.message || 'Failed to save content';
      
      // If document not found, refresh the list and reset form (likely stale data)
      if (errorMessage.includes('Document not found') || errorMessage.includes('not found')) {
        addToast('Document not found. Refreshing document list...', 'warning');
        fetchDocuments();
        resetForm();
      } else {
        addToast(errorMessage, 'error');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (id: string) => {
    // Find the item to get its title
    const item = contentCategory === 'documents' 
      ? documents.find(doc => doc.id === id)
      : videos.find(vid => vid.id === id);
    
    if (item) {
      setDeleteConfirmation({
        isOpen: true,
        id: id,
        title: item.title,
        type: (contentCategory === 'documents' || contentCategory === 'past-exams') ? 'document' : 'video'
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation.id || !deleteConfirmation.type) return;

    setIsDeleting(deleteConfirmation.id);
    try {
      if (deleteConfirmation.type === 'document') {
        await deleteDocument(deleteConfirmation.id);
        addToast('Document deleted permanently', 'info');
      } else {
        await deleteVideo(deleteConfirmation.id);
        addToast('Video deleted permanently', 'info');
      }
      if (editingId === deleteConfirmation.id) resetForm();
      setDeleteConfirmation({ isOpen: false, id: null, title: null, type: null });
    } catch (error: any) {
      addToast(error.message || 'Failed to delete item', 'error');
    } finally {
      setIsDeleting(null);
    }
  };

  const closeDeleteConfirmation = () => {
    setDeleteConfirmation({ isOpen: false, id: null, title: null, type: null });
  };

  return (
    <>
        <div className="space-y-4 sm:space-y-8 animate-fade-in">
          
          {/* Content Type Toggle */}
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
             <button 
               onClick={() => { setContentCategory('documents'); resetForm(); }}
               className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                 contentCategory === 'documents' 
                   ? 'bg-zinc-900 text-white border-zinc-900' 
                   : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               <FileText size={16} /> Documents
             </button>
             <button 
               onClick={() => { setContentCategory('past-exams'); resetForm(); }}
               className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                 contentCategory === 'past-exams' 
                   ? 'bg-zinc-900 text-white border-zinc-900' 
                   : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               <FileText size={16} /> Past Exams
             </button>
             <button 
               onClick={() => { setContentCategory('videos'); resetForm(); }}
               className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                 contentCategory === 'videos' 
                   ? 'bg-zinc-900 text-white border-zinc-900' 
                   : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               <PlaySquare size={16} /> Video Lessons
             </button>
          </div>

          {/* Form Section */}
          <section ref={formSectionRef} className={`bg-white p-4 sm:p-6 md:p-8 rounded-xl border shadow-sm transition-colors ${editingId ? 'border-zinc-400 ring-4 ring-zinc-100' : 'border-zinc-200'}`}>
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 flex items-center gap-2">
                {editingId ? <Edit2 size={18} className="text-zinc-900 sm:w-5 sm:h-5" /> : <Upload size={18} className="text-zinc-400 sm:w-5 sm:h-5" />}
                <span className="line-clamp-1">{editingId ? `Edit ${contentCategory === 'documents' ? 'Document' : contentCategory === 'past-exams' ? 'Past Exam' : 'Video'}` : `Add New ${contentCategory === 'documents' ? 'Document' : contentCategory === 'past-exams' ? 'Past Exam' : 'Video'}`}</span>
              </h2>
              {editingId && (
                <button 
                  onClick={resetForm}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-900 bg-zinc-100 px-2 sm:px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
              )}
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Title</label>
                  <input 
                    type="text" 
                    required 
                    className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm" 
                    placeholder={contentCategory === 'documents' ? "e.g., Grade 9 Biology Ch.1" : contentCategory === 'past-exams' ? "e.g., Grade 10 Mathematics Final Exam 2023" : "e.g., Introduction to Algebra"}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                
                {(contentCategory === 'documents' || contentCategory === 'past-exams') ? (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Author/Source</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm" 
                      placeholder="e.g., Ministry of Education"
                      value={docAuthor}
                      onChange={(e) => setDocAuthor(e.target.value)}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Instructor Name</label>
                    <input 
                      type="text" 
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm" 
                      placeholder="e.g., Khan Academy"
                      value={videoInstructor}
                      onChange={(e) => setVideoInstructor(e.target.value)}
                    />
                  </div>
                )}

                <div>
                   <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Subject</label>
                   <CustomSelect 
                     options={subjectOptions}
                     value={subject}
                     onChange={setSubject}
                   />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Grade Level</label>
                    <CustomSelect 
                      options={gradeOptions}
                      value={grade}
                      onChange={setGrade}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Premium Content</label>
                    <div 
                      onClick={() => setIsPremium(!isPremium)}
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm flex items-center justify-between cursor-pointer transition-colors ${isPremium ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-300 text-zinc-600'}`}
                    >
                      <span>{isPremium ? 'Yes, Premium Only' : 'No, Free for All'}</span>
                      {isPremium && <CheckCircle size={16} />}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Description</label>
                  <textarea 
                    rows={3}
                    className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 resize-none transition-shadow shadow-sm"
                    placeholder="Briefly describe the content..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                {(contentCategory === 'documents' || contentCategory === 'past-exams') ? (
                   <div className="md:col-span-2 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div>
                           <label className="block text-xs font-semibold text-zinc-700 mb-1.5">File Type</label>
                           <CustomSelect
                             options={fileTypeOptions}
                             value={docFileType}
                             onChange={(v) => setDocFileType(v as FileType)}
                           />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                             Document URL <span className="text-red-500">*</span>
                           </label>
                           <input
                             type="url"
                             required
                             className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm"
                             placeholder="https://example.com/document.pdf"
                             value={docFileUrl}
                             onChange={(e) => setDocFileUrl(e.target.value)}
                           />
                           <p className="text-xs text-zinc-400 mt-1">Required: Enter the URL where the document file is hosted (PDF, DOCX, etc.)</p>
                         </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div>
                           <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Document Author</label>
                           <input
                             type="text"
                             className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm"
                             placeholder="e.g. John Smith"
                             value={docAuthor}
                             onChange={(e) => setDocAuthor(e.target.value)}
                           />
                         </div>
                         <div>
                           <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Thumbnail URL</label>
                           <input
                             type="url"
                             className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm"
                             placeholder="https://example.com/thumbnail.jpg"
                             value={docThumbnailUrl}
                             onChange={(e) => setDocThumbnailUrl(e.target.value)}
                           />
                           <p className="text-xs text-zinc-400 mt-1">
                             Optional: URL of a thumbnail image (JPG, PNG). For Google Drive: convert sharing links using <code>https://drive.google.com/uc?export=view&id=FILE_ID</code>
                           </p>
                         </div>
                      </div>
                   </div>
                ) : (
                   <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Video URL (YouTube)</label>
                        <div className="relative">
                          <Youtube size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                          <input 
                            type="url" 
                            className="w-full pl-10 pr-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm"
                            placeholder="https://youtube.com/watch?v=..."
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                         <div>
                            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Thumbnail URL</label>
                            <input
                              type="text"
                              className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm"
                              placeholder="https://..."
                              value={videoThumbnail}
                              onChange={(e) => setVideoThumbnail(e.target.value)}
                            />
                         </div>
                      </div>
                   </div>
                )}
              </div>

              <div className="pt-6 border-t border-zinc-100 flex justify-end gap-3">
                 {editingId && (
                   <button 
                     type="button"
                     onClick={resetForm}
                     className="px-5 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                   >
                     Cancel
                   </button>
                 )}
                 <button
                   type="submit"
                   disabled={isUploading || ((contentCategory === 'documents' || contentCategory === 'past-exams') && !editingId && (!docFileUrl || !docFileUrl.trim()))}
                   className="px-8 py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors shadow-lg shadow-zinc-900/10 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   {isUploading ? (
                     <>Saving...</>
                   ) : (
                     <>
                       {editingId ? <Edit2 size={18} /> : <Upload size={18} />}
                       {editingId ? 'Update Content' : 'Publish Content'}
                     </>
                   )}
                 </button>
              </div>
            </form>
          </section>

          {/* List Section */}
          <section className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
             <div className="p-3 sm:p-4 border-b border-zinc-100 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-zinc-50/50">
                <h3 className="font-bold text-zinc-900 text-sm flex items-center gap-2">
                  {contentCategory === 'documents' || contentCategory === 'past-exams' ? <FileText size={16} /> : <PlaySquare size={16} />}
                  <span className="hidden sm:inline">Manage {contentCategory === 'documents' ? 'Documents' : contentCategory === 'past-exams' ? 'Past Exams' : 'Videos'}</span>
                  <span className="sm:hidden">{contentCategory === 'documents' ? 'Documents' : contentCategory === 'past-exams' ? 'Past Exams' : 'Videos'}</span>
                </h3>
                <div className="relative w-full sm:w-auto">
                   <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                   <input 
                     type="text" 
                     placeholder="Search..." 
                     className="pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-md text-xs focus:outline-none focus:border-zinc-400 w-full sm:w-48 transition-all"
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                   />
                </div>
             </div>
             
             {loading.documents || loading.videos ? (
               <ContentTableSkeleton />
             ) : (
               <>
                 {/* Mobile Card Layout */}
                 <div className="md:hidden p-3 space-y-3">
                   {filteredItems.map((item) => (
                     <div key={item.id} className="border border-zinc-200 rounded-lg p-3 bg-zinc-50/50">
                       <div className="flex items-start gap-3 mb-2">
                         <div className="w-10 h-10 rounded bg-zinc-200 flex items-center justify-center text-zinc-500 flex-shrink-0">
                           {contentCategory === 'documents' || contentCategory === 'past-exams' ? <FileText size={18} /> : <PlaySquare size={18} />}
                         </div>
                         <div className="flex-1 min-w-0">
                           <h4 className="font-medium text-zinc-900 text-sm line-clamp-1">{item.title}</h4>
                           <p className="text-xs text-zinc-500 line-clamp-1 mt-0.5">{item.description}</p>
                         </div>
                       </div>
                       <div className="flex items-center justify-between gap-2 mb-2">
                         <div className="flex flex-col gap-1 text-xs">
                           <span className="font-medium text-zinc-700">{item.subject}</span>
                           <span className="text-zinc-500">{item.grade === 0 ? 'General' : `Grade ${item.grade}`}</span>
                         </div>
                         <div className="flex items-center gap-1.5">
                           {((item as any).isPremium || (item as any).is_premium) && (
                             <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200 uppercase">Pro</span>
                           )}
                           <span className="bg-zinc-100 text-zinc-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-200 uppercase">
                             {(contentCategory === 'documents' || contentCategory === 'past-exams') ? (item as Document).file_type : 'Video'}
                           </span>
                         </div>
                       </div>
                       <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200">
                         <button 
                           onClick={() => (contentCategory === 'documents' || contentCategory === 'past-exams') ? handleEditDocument(item as Document, contentCategory === 'past-exams' ? 'past-exams' : 'documents') : handleEditVideo(item as VideoLesson)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded-lg transition-colors"
                         >
                           <Edit2 size={14} /> Edit
                         </button>
                         <button 
                           onClick={() => handleDelete(item.id)}
                           disabled={isDeleting === item.id}
                           className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                           {isDeleting === item.id ? (
                             <>
                               <Loader2 size={14} className="animate-spin" />
                               Deleting...
                             </>
                           ) : (
                             <>
                               <Trash2 size={14} /> Delete
                             </>
                           )}
                         </button>
                       </div>
                     </div>
                   ))}
                   {filteredItems.length === 0 && (
                     <div className="text-center py-12 text-zinc-400 text-xs">
                       No content found matching your filters.
                     </div>
                   )}
                 </div>

                 {/* Desktop Table Layout */}
                 <div className="hidden md:block overflow-x-auto">
                   <table className="w-full text-sm text-left">
                     <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
                       <tr>
                         <th className="px-6 py-3 font-semibold">Title</th>
                         <th className="px-6 py-3 font-semibold">Details</th>
                         <th className="px-6 py-3 font-semibold">Type</th>
                         <th className="px-6 py-3 font-semibold text-right">Actions</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-zinc-50">
                       {filteredItems.map((item) => (
                     <tr key={item.id} className="hover:bg-zinc-50/80 transition-colors group">
                       <td className="px-6 py-4 font-medium text-zinc-900">
                          <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded bg-zinc-100 flex items-center justify-center text-zinc-500">
                                {contentCategory === 'documents' || contentCategory === 'past-exams' ? <FileText size={16} /> : <PlaySquare size={16} />}
                             </div>
                             <div>
                               <p className="line-clamp-1">{item.title}</p>
                               <p className="text-xs text-zinc-400 font-normal mt-0.5 line-clamp-1">{item.description}</p>
                             </div>
                          </div>
                       </td>
                       <td className="px-6 py-4 text-zinc-500">
                          <div className="flex flex-col gap-1 text-xs">
                             <span className="font-medium text-zinc-700">{item.subject}</span>
                             <span>{item.grade === 0 ? 'General' : `Grade ${item.grade}`}</span>
                          </div>
                       </td>
                       <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {((item as any).isPremium || (item as any).is_premium) && (
                              <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-200 uppercase">Pro</span>
                            )}
                            <span className="bg-zinc-100 text-zinc-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-zinc-200 uppercase">
                              {(contentCategory === 'documents' || contentCategory === 'past-exams') ? (item as Document).file_type : 'Video'}
                            </span>
                          </div>
                       </td>
                        <td className="px-6 py-4 text-right">
                           {/* Hover-reveal on desktop; always visible on touch (no hover) */}
                           <div className="flex items-center justify-end gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button
                                onClick={() => (contentCategory === 'documents' || contentCategory === 'past-exams') ? handleEditDocument(item as Document, contentCategory === 'past-exams' ? 'past-exams' : 'documents') : handleEditVideo(item as VideoLesson)}
                                className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 rounded-lg transition-colors"
                             >
                               <Edit2 size={16} />
                             </button>
                             <button 
                               onClick={() => handleDelete(item.id)}
                               disabled={isDeleting === item.id}
                               className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                             >
                               {isDeleting === item.id ? (
                                 <Loader2 size={16} className="animate-spin" />
                               ) : (
                                 <Trash2 size={16} />
                               )}
                             </button>
                          </div>
                       </td>
                     </tr>
                       ))}
                       {filteredItems.length === 0 && (
                         <tr>
                           <td colSpan={4} className="px-6 py-12 text-center text-zinc-400 text-xs">
                             No content found matching your filters.
                           </td>
                         </tr>
                       )}
                     </tbody>
                   </table>
                 </div>
               </>
             )}
          </section>
        </div>
      {deleteConfirmation.isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up">
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                  <Trash2 size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-zinc-900 text-lg mb-2">
                    Delete {deleteConfirmation.type === 'document' ? 'Document' : 'Video'}?
                  </h3>
                  <p className="text-sm text-zinc-600">
                    Are you sure you want to delete <strong>"{deleteConfirmation.title}"</strong>? This action is permanent and cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-zinc-100">
                <button
                  onClick={closeDeleteConfirmation}
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting === deleteConfirmation.id}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting === deleteConfirmation.id ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Forever'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default ContentTab;
