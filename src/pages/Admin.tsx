
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, FileText, Trash2, Edit2, Search, CheckCircle, UserPlus, Mail, Shield, X, Save, Film, Youtube, PlaySquare, BarChart3, Users, MessageSquare, AlertTriangle, MoreVertical, Crown, Ban } from 'lucide-react';
import { GRADES, SUBJECTS } from '../constants';
import { FileType, Document, VideoLesson, UserRole } from '../types';
import CustomSelect, { Option } from '../components/CustomSelect';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';

// Mock Data for Admins
const MOCK_ADMINS = [
  { id: '1', name: 'System Admin', email: 'admin@smartstudy.com', role: 'Super Admin', status: 'Active', dateAdded: '2023-01-15' },
  { id: '2', name: 'Ms. Almaz', email: 'almaz.content@smartstudy.com', role: 'Content Manager', status: 'Active', dateAdded: '2023-03-10' },
];

const Admin: React.FC = () => {
  const { documents, videos, forumPosts, allUsers, addDocument, updateDocument, deleteDocument, addVideo, updateVideo, deleteVideo, deleteForumPost, updateUserStatus } = useData();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'students' | 'community' | 'team'>('overview');
  const [contentCategory, setContentCategory] = useState<'documents' | 'videos'>('documents');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  
  // Content Management State
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Edit Mode State
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

  // Video Specific State
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDuration, setVideoDuration] = useState('');
  const [videoInstructor, setVideoInstructor] = useState('');
  const [videoThumbnail, setVideoThumbnail] = useState('');

  // Team Management State
  const [admins, setAdmins] = useState(MOCK_ADMINS);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('Content Manager');

  // Options
  const gradeOptions: Option[] = GRADES.filter(g => g !== 'All').map(g => ({ label: `Grade ${g}`, value: g }));
  const subjectOptions: Option[] = SUBJECTS.filter(s => s !== 'All').map(s => ({ label: s, value: s }));
  const fileTypeOptions: Option[] = Object.values(FileType).map(t => ({ label: t, value: t }));
  const roleOptions: Option[] = [
    { label: 'Content Manager (Can upload & edit)', value: 'Content Manager' },
    { label: 'Super Admin (Full access)', value: 'Super Admin' },
    { label: 'Viewer (Read only)', value: 'Viewer' }
  ];

  // --- Helpers ---
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
    setFile(null);

    // Video reset
    setVideoUrl('');
    setVideoDuration('');
    setVideoInstructor('');
    setVideoThumbnail('');
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // --- Handlers ---

  const handleEditDocument = (doc: Document) => {
    setContentCategory('documents');
    setEditingId(doc.id);
    setTitle(doc.title);
    setDescription(doc.description);
    setGrade(doc.grade.toString());
    setSubject(doc.subject);
    setIsPremium(doc.isPremium);
    setDocAuthor(doc.author || '');
    setDocFileType(doc.fileType);
    scrollToTop();
  };

  const handleEditVideo = (video: VideoLesson) => {
    setContentCategory('videos');
    setEditingId(video.id);
    setTitle(video.title);
    setDescription(video.description);
    setGrade(video.grade.toString());
    setSubject(video.subject);
    setIsPremium(video.isPremium);
    setVideoUrl(video.videoUrl);
    setVideoDuration(video.duration);
    setVideoInstructor(video.instructor);
    setVideoThumbnail(video.thumbnail);
    scrollToTop();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);
    
    setTimeout(() => {
      setIsUploading(false);
      
      if (contentCategory === 'documents') {
        if (editingId) {
          // Update Document
          updateDocument(editingId, {
            title, description, subject, isPremium,
            grade: parseInt(grade),
            fileType: docFileType,
            author: docAuthor
          });
          addToast('Document updated successfully!', 'success');
        } else {
          // Create Document
          const newDoc: Document = {
            id: Math.random().toString(),
            title: title || (file ? file.name.split('.')[0] : "New Document"),
            description: description || "New uploaded material.",
            subject, grade: parseInt(grade),
            fileType: docFileType, isPremium,
            uploadedAt: new Date().toISOString().split('T')[0],
            downloads: 0,
            previewImage: "https://picsum.photos/400/300?random=" + Math.floor(Math.random() * 100),
            tags: [],
            author: docAuthor || "Admin"
          };
          addDocument(newDoc);
          addToast('Document published successfully!', 'success');
        }
      } else {
        if (editingId) {
          // Update Video
          updateVideo(editingId, {
            title, description, subject, isPremium,
            grade: parseInt(grade),
            videoUrl, duration: videoDuration, instructor: videoInstructor, thumbnail: videoThumbnail || "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&q=80"
          });
          addToast('Video lesson updated successfully!', 'success');
        } else {
          // Create Video
          const newVideo: VideoLesson = {
            id: 'v-' + Math.random().toString(),
            title: title || "New Video Lesson",
            description: description || "Video description.",
            subject, grade: parseInt(grade),
            isPremium,
            videoUrl, duration: videoDuration, instructor: videoInstructor,
            thumbnail: videoThumbnail || "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&q=80",
            views: 0,
            likes: 0,
            uploadedAt: new Date().toLocaleDateString()
          };
          addVideo(newVideo);
          addToast('Video lesson published successfully!', 'success');
        }
      }
      
      resetForm();
    }, 1000);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this item permanently?")) {
      if (contentCategory === 'documents') {
        deleteDocument(id);
        addToast('Document deleted permanently', 'info');
      } else {
        deleteVideo(id);
        addToast('Video deleted permanently', 'info');
      }
      if (editingId === id) resetForm();
    }
  };

  const handleDeletePost = (id: string) => {
    if (window.confirm("Delete this community post and all its comments?")) {
      deleteForumPost(id);
      addToast('Discussion post deleted', 'info');
    }
  };

  // --- Student Handlers ---
  const toggleStudentStatus = (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Active' ? 'Banned' : 'Active';
    updateUserStatus(id, { status: newStatus });
    addToast(`User marked as ${newStatus}`, newStatus === 'Active' ? 'success' : 'warning');
  };

  const toggleStudentPremium = (id: string, isPremium: boolean) => {
    updateUserStatus(id, { isPremium: !isPremium });
    addToast(
      !isPremium ? 'User upgraded to Premium Plan' : 'User downgraded to Free Plan', 
      'success'
    );
  };

  // --- Team Handlers ---
  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;
    setAdmins([...admins, {
      id: Math.random().toString(),
      name: inviteName, email: inviteEmail, role: inviteRole,
      status: 'Invited', dateAdded: new Date().toISOString().split('T')[0]
    }]);
    setIsInviteOpen(false);
    setInviteName('');
    setInviteEmail('');
    addToast(`Invitation sent to ${inviteEmail}`, 'success');
  };

  const handleRemoveAdmin = (id: string) => {
    if (window.confirm("Remove this user from the admin team?")) {
      setAdmins(admins.filter(a => a.id !== id));
      addToast('Team member removed', 'info');
    }
  };

  // Filtering
  const filteredItems = contentCategory === 'documents' 
    ? documents.filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase()) || d.subject.toLowerCase().includes(searchTerm.toLowerCase()))
    : videos.filter(v => v.title.toLowerCase().includes(searchTerm.toLowerCase()) || v.subject.toLowerCase().includes(searchTerm.toLowerCase()));

  const filteredStudents = allUsers.filter(s => s.role === UserRole.STUDENT && (s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.email.toLowerCase().includes(searchTerm.toLowerCase())));

  // Stats
  const stats = {
    totalUsers: allUsers.length + 2450, // Mock addition for realism
    premiumUsers: allUsers.filter(s => s.isPremium).length + 120,
    totalDocuments: documents.length,
    totalVideos: videos.length,
    totalPosts: forumPosts.length
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in space-y-8 pb-12">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2 py-1 rounded-md bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <Shield size={10} /> Admin Panel
            </span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">System Administration</h1>
        </div>

        {/* Main Tabs */}
        <div className="flex p-1 bg-zinc-100 rounded-lg overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'content', label: 'Content', icon: FileText },
            { id: 'students', label: 'Students', icon: Users },
            { id: 'community', label: 'Community', icon: MessageSquare },
            { id: 'team', label: 'Team', icon: Shield },
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' 
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* --- OVERVIEW TAB --- */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fade-in">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
               <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-zinc-100 text-zinc-700 rounded-lg"><Users size={20} /></div>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">+12%</span>
               </div>
               <div className="text-3xl font-bold text-zinc-900 tracking-tight">{stats.totalUsers.toLocaleString()}</div>
               <div className="text-sm text-zinc-500 mt-1">Total Students</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
               <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-zinc-100 text-zinc-700 rounded-lg"><Crown size={20} /></div>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">+5%</span>
               </div>
               <div className="text-3xl font-bold text-zinc-900 tracking-tight">{stats.premiumUsers.toLocaleString()}</div>
               <div className="text-sm text-zinc-500 mt-1">Premium Subscribers</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
               <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-zinc-100 text-zinc-700 rounded-lg"><FileText size={20} /></div>
                  <span className="text-xs font-bold text-zinc-400 bg-zinc-50 px-2 py-1 rounded-full">New</span>
               </div>
               <div className="text-3xl font-bold text-zinc-900 tracking-tight">{stats.totalDocuments + stats.totalVideos}</div>
               <div className="text-sm text-zinc-500 mt-1">Learning Resources</div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
               <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-zinc-100 text-zinc-700 rounded-lg"><MessageSquare size={20} /></div>
               </div>
               <div className="text-3xl font-bold text-zinc-900 tracking-tight">{stats.totalPosts}</div>
               <div className="text-sm text-zinc-500 mt-1">Community Posts</div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
            <h3 className="font-bold text-zinc-900 mb-4">Recent System Activity</h3>
            <div className="space-y-4">
               {[
                 { action: 'New User Registration', detail: 'Student "Abebe K." joined', time: '5 mins ago' },
                 { action: 'Premium Subscription', detail: 'User "Sara M." upgraded to Pro', time: '12 mins ago' },
                 { action: 'Content Upload', detail: 'Video "Physics Ch.3" added by Admin', time: '1 hour ago' },
                 { action: 'Forum Report', detail: 'Post #492 flagged for review', time: '2 hours ago' },
               ].map((item, i) => (
                 <div key={i} className="flex items-center justify-between py-3 border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors px-2 -mx-2 rounded-lg">
                    <div className="flex items-center gap-3">
                       <div className="w-2 h-2 rounded-full bg-zinc-300"></div>
                       <div>
                          <p className="text-sm font-medium text-zinc-900">{item.action}</p>
                          <p className="text-xs text-zinc-500">{item.detail}</p>
                       </div>
                    </div>
                    <span className="text-xs text-zinc-400">{item.time}</span>
                 </div>
               ))}
            </div>
          </div>
        </div>
      )}

      {/* --- CONTENT TAB --- */}
      {activeTab === 'content' && (
        <div className="space-y-8 animate-fade-in">
          
          {/* Content Type Toggle */}
          <div className="flex items-center gap-4">
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
          <section className={`bg-white p-6 md:p-8 rounded-xl border shadow-sm transition-colors ${editingId ? 'border-zinc-400 ring-4 ring-zinc-100' : 'border-zinc-200'}`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                {editingId ? <Edit2 size={20} className="text-zinc-900" /> : <Upload size={20} className="text-zinc-400" />}
                {editingId ? `Edit ${contentCategory === 'documents' ? 'Document' : 'Video'}` : `Add New ${contentCategory === 'documents' ? 'Document' : 'Video'}`}
              </h2>
              {editingId && (
                <button 
                  onClick={resetForm}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-900 bg-zinc-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Title</label>
                  <input 
                    type="text" 
                    required 
                    className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm" 
                    placeholder={contentCategory === 'documents' ? "e.g., Grade 9 Biology Ch.1" : "e.g., Introduction to Algebra"}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                
                {contentCategory === 'documents' ? (
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

                {contentCategory === 'documents' ? (
                   <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5">File Type</label>
                        <CustomSelect 
                          options={fileTypeOptions}
                          value={docFileType}
                          onChange={(v) => setDocFileType(v as FileType)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Upload File</label>
                        <div className="relative border-2 border-dashed border-zinc-300 rounded-lg p-4 text-center hover:bg-zinc-50 transition-colors cursor-pointer group">
                           <input 
                             type="file" 
                             className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                             onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                           />
                           <Upload size={24} className="mx-auto text-zinc-400 group-hover:text-zinc-600 mb-2" />
                           <p className="text-xs text-zinc-500 group-hover:text-zinc-700 truncate">
                             {file ? file.name : "Drag & drop or click to upload"}
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
                      <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Duration</label>
                            <input 
                              type="text" 
                              className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm"
                              placeholder="e.g. 10:30"
                              value={videoDuration}
                              onChange={(e) => setVideoDuration(e.target.value)}
                            />
                         </div>
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
                   disabled={isUploading}
                   className="px-8 py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors shadow-lg shadow-zinc-900/10 flex items-center gap-2"
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
             <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <h3 className="font-bold text-zinc-900 text-sm flex items-center gap-2">
                  {contentCategory === 'documents' ? <FileText size={16} /> : <PlaySquare size={16} />}
                  Manage {contentCategory === 'documents' ? 'Documents' : 'Videos'}
                </h3>
                <div className="relative">
                   <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                   <input 
                     type="text" 
                     placeholder="Search content..." 
                     className="pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded-md text-xs focus:outline-none focus:border-zinc-400 w-48 transition-all"
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                   />
                </div>
             </div>
             
             <div className="overflow-x-auto">
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
                                {contentCategory === 'documents' ? <FileText size={16} /> : <PlaySquare size={16} />}
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
                             <span>Grade {item.grade}</span>
                          </div>
                       </td>
                       <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {item.isPremium && (
                              <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-200 uppercase">Pro</span>
                            )}
                            <span className="bg-zinc-100 text-zinc-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-zinc-200 uppercase">
                              {contentCategory === 'documents' ? (item as Document).fileType : 'Video'}
                            </span>
                          </div>
                       </td>
                       <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                               onClick={() => contentCategory === 'documents' ? handleEditDocument(item as Document) : handleEditVideo(item as VideoLesson)}
                               className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 rounded-lg transition-colors"
                             >
                               <Edit2 size={16} />
                             </button>
                             <button 
                               onClick={() => handleDelete(item.id)}
                               className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                             >
                               <Trash2 size={16} />
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
          </section>
        </div>
      )}

      {/* --- STUDENTS TAB --- */}
      {activeTab === 'students' && (
        <div className="space-y-6 animate-fade-in">
           <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
              <h2 className="text-lg font-bold text-zinc-900">Student Management</h2>
              <div className="relative">
                 <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                 <input 
                   type="text" 
                   placeholder="Search students..." 
                   className="pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-400 transition-all w-64"
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                 />
              </div>
           </div>

           <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Name</th>
                      <th className="px-6 py-3 font-semibold">Status</th>
                      <th className="px-6 py-3 font-semibold">Plan</th>
                      <th className="px-6 py-3 font-semibold">Joined</th>
                      <th className="px-6 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {filteredStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4">
                           <div>
                             <p className="font-medium text-zinc-900">{student.name}</p>
                             <p className="text-xs text-zinc-500">{student.email}</p>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                             student.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
                           }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${student.status === 'Active' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                              {student.status}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                           {student.isPremium ? (
                             <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100 flex items-center gap-1 w-fit">
                               <Crown size={12} /> PRO
                             </span>
                           ) : (
                             <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-1 rounded border border-zinc-200">Free</span>
                           )}
                        </td>
                        <td className="px-6 py-4 text-zinc-500 text-xs">
                           {student.joinedDate}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex justify-end items-center gap-2">
                              <button 
                                onClick={() => toggleStudentPremium(student.id, student.isPremium)}
                                className="text-xs font-medium text-zinc-500 hover:text-amber-600 hover:underline"
                              >
                                {student.isPremium ? 'Downgrade' : 'Upgrade'}
                              </button>
                              <div className="h-4 w-px bg-zinc-200"></div>
                              <button 
                                onClick={() => toggleStudentStatus(student.id, student.status)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  student.status === 'Active' ? 'text-zinc-400 hover:text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={student.status === 'Active' ? 'Ban User' : 'Activate User'}
                              >
                                {student.status === 'Active' ? <Ban size={16} /> : <CheckCircle size={16} />}
                              </button>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
           </div>
        </div>
      )}

      {/* --- COMMUNITY TAB --- */}
      {activeTab === 'community' && (
         <div className="space-y-6 animate-fade-in">
            <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm mb-6">
              <h2 className="text-lg font-bold text-zinc-900 mb-2">Community Moderation</h2>
              <p className="text-sm text-zinc-500">Review flagged posts and manage discussions.</p>
            </div>

            <div className="grid gap-4">
               {forumPosts.map(post => (
                 <div key={post.id} className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm flex gap-4">
                    <div className="flex flex-col items-center gap-1 text-zinc-400 pt-1">
                       <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                       <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-zinc-900 text-sm">{post.title}</h3>
                          <button 
                            onClick={() => handleDeletePost(post.id)}
                            className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 px-2 py-1 rounded hover:bg-red-100 transition-colors"
                          >
                            Delete Post
                          </button>
                       </div>
                       <p className="text-sm text-zinc-600 line-clamp-2 mb-3 bg-zinc-50 p-3 rounded-lg border border-zinc-100 italic">
                          "{post.content}"
                       </p>
                       <div className="flex items-center gap-4 text-xs text-zinc-400">
                          <span>Posted by <span className="font-medium text-zinc-600">{post.author}</span></span>
                          <span>• {post.createdAt}</span>
                          <span>• {post.comments.length} comments</span>
                       </div>
                    </div>
                 </div>
               ))}
               {forumPosts.length === 0 && (
                 <div className="text-center py-12 text-zinc-400">No community posts to moderate.</div>
               )}
            </div>
         </div>
      )}

      {/* --- TEAM TAB --- */}
      {activeTab === 'team' && (
        <div className="space-y-8 animate-fade-in">
           <div className="flex justify-between items-end">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Admin Team</h2>
                <p className="text-sm text-zinc-500">Manage access to the admin panel.</p>
              </div>
              <button 
                onClick={() => setIsInviteOpen(true)}
                className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                <UserPlus size={16} /> Invite Member
              </button>
           </div>

           <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
                    <tr>
                      <th className="px-6 py-3 font-semibold">User</th>
                      <th className="px-6 py-3 font-semibold">Role</th>
                      <th className="px-6 py-3 font-semibold">Status</th>
                      <th className="px-6 py-3 font-semibold">Added</th>
                      <th className="px-6 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {admins.map((admin) => (
                      <tr key={admin.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                                 {admin.name.charAt(0)}
                              </div>
                              <div>
                                <p className="font-medium text-zinc-900">{admin.name}</p>
                                <p className="text-xs text-zinc-500">{admin.email}</p>
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-4 text-zinc-600">
                           {admin.role}
                        </td>
                        <td className="px-6 py-4">
                           <span className={`text-xs px-2 py-1 rounded-full border ${
                             admin.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                           }`}>
                             {admin.status}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-zinc-500 text-xs">
                           {admin.dateAdded}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <button 
                             onClick={() => handleRemoveAdmin(admin.id)}
                             className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                           >
                             <Trash2 size={16} />
                           </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
           </div>

           {/* Invite Modal */}
           {isInviteOpen && mounted && createPortal(
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up">
                  <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 rounded-t-xl">
                     <h3 className="font-bold text-zinc-900">Invite Team Member</h3>
                     <button onClick={() => setIsInviteOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-900 rounded hover:bg-zinc-200">
                       <X size={20} />
                     </button>
                  </div>
                  <form onSubmit={handleInvite} className="p-6 space-y-4">
                     <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Full Name</label>
                        <input 
                          type="text" 
                          required
                          className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500"
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Email Address</label>
                        <input 
                          type="email" 
                          required
                          className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Role</label>
                        <CustomSelect 
                          options={roleOptions}
                          value={inviteRole}
                          onChange={setInviteRole}
                        />
                     </div>
                     <button 
                       type="submit"
                       className="w-full py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors mt-2"
                     >
                       Send Invitation
                     </button>
                  </form>
                </div>
              </div>,
              document.body
           )}
        </div>
      )}
    </div>
  );
};

export default Admin;
