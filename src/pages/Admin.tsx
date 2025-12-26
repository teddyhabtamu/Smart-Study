
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Upload, FileText, Trash2, Edit2, Search, CheckCircle, UserPlus, Mail, Shield, X, Save, Film, Youtube, PlaySquare, BarChart3, Users, MessageSquare, AlertTriangle, MoreVertical, Crown, Ban, Loader2, Briefcase, MapPin, Clock, ScrollText, RefreshCw, Archive, ArchiveRestore } from 'lucide-react';
import { GRADES, SUBJECTS } from '../constants';
import { FileType, Document, VideoLesson, UserRole, User } from '../types';
import CustomSelect, { Option } from '../components/CustomSelect';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { adminAPI, careersAPI } from '../services/api';

// Enhanced Skeleton Components with better styling and animations
const StatsCardSkeleton: React.FC = () => (
  <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm animate-pulse">
    <div className="flex justify-between items-start mb-4">
      <div className="w-10 h-10 bg-zinc-200 rounded-lg"></div>
      <div className="w-12 h-4 bg-zinc-200 rounded"></div>
    </div>
    <div className="w-20 h-9 bg-zinc-200 rounded mb-2"></div>
    <div className="w-32 h-4 bg-zinc-200 rounded"></div>
  </div>
);

const RecentActivitySkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
    <div className="w-48 h-6 bg-zinc-200 rounded mb-6 animate-pulse"></div>
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center justify-between py-3 border-b border-zinc-50 last:border-0 animate-pulse">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-2 h-2 bg-zinc-200 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="w-48 h-4 bg-zinc-200 rounded"></div>
              <div className="w-64 h-3 bg-zinc-200 rounded"></div>
            </div>
          </div>
          <div className="w-20 h-3 bg-zinc-200 rounded"></div>
        </div>
      ))}
    </div>
  </div>
);

const StudentsTableSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
          <tr>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-12 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-20 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3 text-right"><div className="w-20 h-4 bg-zinc-200 rounded animate-pulse ml-auto"></div></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <tr key={i} className="animate-pulse">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-200 rounded-full"></div>
                  <div className="space-y-2">
                    <div className="w-32 h-4 bg-zinc-200 rounded"></div>
                    <div className="w-48 h-3 bg-zinc-200 rounded"></div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="w-20 h-6 bg-zinc-200 rounded-full"></div>
              </td>
              <td className="px-6 py-4">
                <div className="w-16 h-6 bg-zinc-200 rounded"></div>
              </td>
              <td className="px-6 py-4">
                <div className="w-24 h-4 bg-zinc-200 rounded"></div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <div className="w-20 h-8 bg-zinc-200 rounded"></div>
                  <div className="w-8 h-8 bg-zinc-200 rounded"></div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const PositionsSkeleton: React.FC = () => (
  <div className="space-y-3 sm:space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-6 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-16 h-5 bg-zinc-200 rounded-md"></div>
              <div className="flex-1 h-5 bg-zinc-200 rounded"></div>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="w-24 h-4 bg-zinc-200 rounded"></div>
              <div className="w-20 h-4 bg-zinc-200 rounded"></div>
              <div className="w-32 h-4 bg-zinc-200 rounded"></div>
            </div>
            <div className="space-y-2">
              <div className="w-full h-3 bg-zinc-200 rounded"></div>
              <div className="w-3/4 h-3 bg-zinc-200 rounded"></div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-10 h-10 bg-zinc-200 rounded-lg"></div>
            <div className="w-10 h-10 bg-zinc-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

const ApplicationsSkeleton: React.FC = () => (
  <div className="space-y-3 sm:space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-6 animate-pulse">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-20 h-5 bg-zinc-200 rounded-md"></div>
                <div className="flex-1 h-5 bg-zinc-200 rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="w-48 h-4 bg-zinc-200 rounded"></div>
                <div className="w-64 h-4 bg-zinc-200 rounded"></div>
                <div className="w-56 h-4 bg-zinc-200 rounded"></div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="w-32 h-9 bg-zinc-200 rounded-lg"></div>
              <div className="w-24 h-9 bg-zinc-200 rounded-lg"></div>
            </div>
          </div>
          <div className="pt-3 border-t border-zinc-100 space-y-2">
            <div className="w-full h-3 bg-zinc-200 rounded"></div>
            <div className="w-5/6 h-3 bg-zinc-200 rounded"></div>
            <div className="w-4/5 h-3 bg-zinc-200 rounded"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

const ContentTableSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
          <tr>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-20 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3 text-right"><div className="w-20 h-4 bg-zinc-200 rounded animate-pulse ml-auto"></div></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {[1, 2, 3, 4, 5].map((i) => (
            <tr key={i} className="animate-pulse">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-200 rounded-lg"></div>
                  <div className="space-y-2">
                    <div className="w-56 h-4 bg-zinc-200 rounded"></div>
                    <div className="w-72 h-3 bg-zinc-200 rounded"></div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="space-y-2">
                  <div className="w-24 h-3 bg-zinc-200 rounded"></div>
                  <div className="w-16 h-3 bg-zinc-200 rounded"></div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-5 bg-zinc-200 rounded-full"></div>
                  <div className="w-16 h-5 bg-zinc-200 rounded"></div>
                </div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <div className="w-8 h-8 bg-zinc-200 rounded"></div>
                  <div className="w-8 h-8 bg-zinc-200 rounded"></div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const CommunityPostsSkeleton: React.FC = () => (
  <div className="grid gap-4">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm flex gap-4 animate-pulse">
        <div className="flex flex-col items-center gap-1 pt-1">
          <div className="w-5 h-5 bg-zinc-200 rounded"></div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-3">
            <div className="w-64 h-5 bg-zinc-200 rounded"></div>
            <div className="w-24 h-6 bg-zinc-200 rounded"></div>
          </div>
          <div className="mb-3 bg-zinc-50 p-3 rounded-lg border border-zinc-100">
            <div className="w-full h-4 bg-zinc-200 rounded mb-2"></div>
            <div className="w-5/6 h-4 bg-zinc-200 rounded"></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-32 h-3 bg-zinc-200 rounded"></div>
            <div className="w-20 h-3 bg-zinc-200 rounded"></div>
            <div className="w-24 h-3 bg-zinc-200 rounded"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

const AdminTeamSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
          <tr>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-12 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-20 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3 text-right"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse ml-auto"></div></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {[1, 2, 3].map((i) => (
            <tr key={i} className="animate-pulse">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-200"></div>
                  <div className="space-y-2">
                    <div className="w-32 h-4 bg-zinc-200 rounded"></div>
                    <div className="w-48 h-3 bg-zinc-200 rounded"></div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="w-24 h-4 bg-zinc-200 rounded"></div>
              </td>
              <td className="px-6 py-4">
                <div className="w-20 h-6 bg-zinc-200 rounded-full"></div>
              </td>
              <td className="px-6 py-4">
                <div className="w-24 h-4 bg-zinc-200 rounded"></div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="w-8 h-8 bg-zinc-200 rounded ml-auto"></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// Admin component state will be managed with real backend data

const Admin: React.FC = () => {
  const { documents, videos, forumPosts, allUsers, createDocument, updateDocument, deleteDocument, createVideo, updateVideo, deleteVideo, deleteForumPost, updateUserStatus, fetchUsers, fetchDocuments, fetchVideos, fetchForumPosts, loading } = useData();
  const { addToast } = useToast();
  const { user } = useAuth();
  const isModerator = user?.role === UserRole.MODERATOR || String(user?.role) === 'MODERATOR';
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'students' | 'community' | 'team' | 'audit' | 'careers'>(isModerator ? 'content' : 'overview');
  const [contentCategory, setContentCategory] = useState<'documents' | 'videos' | 'past-exams'>('documents');
  const [mounted, setMounted] = useState(false);
  const [admins, setAdmins] = useState<User[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminStats, setAdminStats] = useState<any>(null);

  // Audit Log State (Admin-only)
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditExpandedId, setAuditExpandedId] = useState<string | null>(null);
  const [auditPagination, setAuditPagination] = useState<{ total: number; limit: number; offset: number; hasMore: boolean }>({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false
  });

  const fetchAuditLogs = useCallback(async (opts?: { offset?: number }) => {
    try {
      setAuditLoading(true);
      const limit = 50;
      const offset = opts?.offset ?? 0;
      const result = await adminAPI.getAuditLogs({ limit, offset, search: auditSearch.trim() || undefined });
      setAuditLogs(result.logs || []);
      setAuditPagination(result.pagination || { total: 0, limit, offset, hasMore: false });
    } catch (error: any) {
      console.error('Failed to fetch audit logs:', error);
      addToast('Failed to load audit logs', 'error');
    } finally {
      setAuditLoading(false);
    }
  }, [addToast, auditSearch]);

  const formatAuditValue = useCallback((value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }, []);

  const computeAuditChanges = useCallback((before: any, after: any) => {
    const b = (before && typeof before === 'object') ? before : null;
    const a = (after && typeof after === 'object') ? after : null;

    // Create
    if (!b && a) {
      return Object.keys(a).sort().map((key) => ({ key, before: undefined, after: a[key] }));
    }
    // Delete
    if (b && !a) {
      return Object.keys(b).sort().map((key) => ({ key, before: b[key], after: undefined }));
    }
    // Unknown / nothing
    if (!b && !a) return [];

    const keys = new Set<string>([...Object.keys(b!), ...Object.keys(a!)]);
    const changes: Array<{ key: string; before: any; after: any }> = [];

    Array.from(keys).sort().forEach((key) => {
      const bv = (b as any)[key];
      const av = (a as any)[key];
      // Compare via stable-ish JSON for primitives/objects
      const bs = (() => { try { return JSON.stringify(bv); } catch { return String(bv); } })();
      const as = (() => { try { return JSON.stringify(av); } catch { return String(av); } })();
      if (bs !== as) changes.push({ key, before: bv, after: av });
    });

    return changes;
  }, []);

  // Fetch admin team members
  const fetchAdmins = useCallback(async () => {
    try {
      setAdminLoading(true);
      const adminData = await adminAPI.getAdmins();
      setAdmins(adminData);
    } catch (error: any) {
      console.error('Failed to fetch admins:', error);
      addToast('Failed to load admin team', 'error');
    } finally {
      setAdminLoading(false);
    }
  }, [addToast]);

  // Fetch admin stats
  const fetchAdminStats = useCallback(async () => {
    try {
      const stats = await adminAPI.getAdminStats();
      setAdminStats(stats);
    } catch (error: any) {
      console.error('Failed to fetch admin stats:', error);
    }
  }, []);

  // Prevent moderators from accessing restricted tabs
  useEffect(() => {
    if (isModerator && activeTab !== 'content') {
      setActiveTab('content');
    }
  }, [isModerator, activeTab]);

  useEffect(() => {
    setMounted(true);

    // Set admin loading to true before fetching
    setAdminLoading(true);

    // Fetch initial data (fetch functions handle their own loading states)
    fetchDocuments();
    fetchVideos();
    
    // Only fetch these for admins, not moderators
    if (!isModerator) {
      fetchAdminStats();
      fetchForumPosts();
      fetchUsers();
      fetchAdmins();
    }

    return () => setMounted(false);
  }, [fetchDocuments, fetchVideos, fetchAdminStats, fetchForumPosts, fetchUsers, fetchAdmins, isModerator]);

  // Load audit logs when opening Audit tab (Admin-only)
  useEffect(() => {
    if (!isModerator && activeTab === 'audit') {
      fetchAuditLogs({ offset: 0 });
    }
  }, [activeTab, fetchAuditLogs, isModerator]);
  
  // Content Management State
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isDeletingPosition, setIsDeletingPosition] = useState<string | null>(null);
  const [isUpdatingApplication, setIsUpdatingApplication] = useState<string | null>(null);
  const [isArchivingApplication, setIsArchivingApplication] = useState<string | null>(null);
  const [isDeletingApplication, setIsDeletingApplication] = useState<string | null>(null);
  const [isSavingPosition, setIsSavingPosition] = useState(false);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [isRemovingAdmin, setIsRemovingAdmin] = useState<string | null>(null);
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
  const [docFileUrl, setDocFileUrl] = useState('');
  const [docThumbnailUrl, setDocThumbnailUrl] = useState('');

  // Video Specific State
  const [videoUrl, setVideoUrl] = useState(''); // Note: variable name stays camelCase for UI state
  const [videoInstructor, setVideoInstructor] = useState('');
  const [videoThumbnail, setVideoThumbnail] = useState('');

  // Team Management State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('Content Manager');

  // Careers Management State
  const [positions, setPositions] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [careersLoading, setCareersLoading] = useState(false);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [positionView, setPositionView] = useState<'positions' | 'applications'>('positions');
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [isPositionFormOpen, setIsPositionFormOpen] = useState(false);
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [positionForm, setPositionForm] = useState({
    title: '',
    description: '',
    requirements: '',
    department: '',
    employment_type: 'Full-time' as 'Full-time' | 'Part-time' | 'Contract' | 'Internship',
    location: '',
    is_active: true
  });
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<string>('all');
  const [archiveStatusFilter, setArchiveStatusFilter] = useState<string>('active');

  // Confirmation Modal State
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    type: 'upgrade' | 'downgrade' | 'activate' | 'ban' | null;
    studentId: string | null;
    studentName: string | null;
    currentStatus?: string;
    isPremium?: boolean;
  }>({
    isOpen: false,
    type: null,
    studentId: null,
    studentName: null
  });

  // Delete Confirmation Modal State
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

  // Application Delete Confirmation Modal State
  const [deleteApplicationConfirmation, setDeleteApplicationConfirmation] = useState<{
    isOpen: boolean;
    applicationId: string | null;
    applicantName: string | null;
  }>({
    isOpen: false,
    applicationId: null,
    applicantName: null
  });

  // Team Member Removal Confirmation Modal State
  const [removeTeamMemberConfirmation, setRemoveTeamMemberConfirmation] = useState<{
    isOpen: boolean;
    id: string | null;
    name: string | null;
  }>({
    isOpen: false,
    id: null,
    name: null
  });

  // Delete Post Confirmation Modal State
  const [deletePostConfirmation, setDeletePostConfirmation] = useState<{
    isOpen: boolean;
    id: string | null;
    title: string | null;
  }>({
    isOpen: false,
    id: null,
    title: null
  });

  // Options
  const gradeOptions: Option[] = GRADES.filter(g => g !== 'All').map(g => ({ label: `Grade ${g}`, value: g }));
  const subjectOptions: Option[] = SUBJECTS.filter(s => s !== 'All').map(s => ({ label: s, value: s }));
  const fileTypeOptions: Option[] = ['PDF', 'DOCX', 'PPT'].map(t => ({ label: t, value: t }));
  const roleOptions: Option[] = [
    { label: 'Content Manager (Can upload & edit)', value: 'Content Manager' },
    { label: 'Super Admin (Full access)', value: 'Super Admin' },
    { label: 'Viewer (Read only)', value: 'Viewer' }
  ];
  const applicationStatusOptions: Option[] = [
    { label: 'All Statuses', value: 'all' },
    { label: 'Pending', value: 'Pending' },
    { label: 'Under Review', value: 'Under Review' },
    { label: 'Interview', value: 'Interview' },
    { label: 'Accepted', value: 'Accepted' },
    { label: 'Rejected', value: 'Rejected' }
  ];

  const archiveStatusOptions: Option[] = [
    { label: 'Active Only', value: 'active' },
    { label: 'Archived Only', value: 'archived' },
    { label: 'All Applications', value: 'all' }
  ];
  const statusUpdateOptions: Option[] = [
    { label: 'Pending', value: 'Pending' },
    { label: 'Under Review', value: 'Under Review' },
    { label: 'Interview', value: 'Interview' },
    { label: 'Accepted', value: 'Accepted' },
    { label: 'Rejected', value: 'Rejected' }
  ];
  const employmentTypeOptions: Option[] = [
    { label: 'Full-time', value: 'Full-time' },
    { label: 'Part-time', value: 'Part-time' },
    { label: 'Contract', value: 'Contract' },
    { label: 'Internship', value: 'Internship' }
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
    setDocFileUrl('');
    setDocThumbnailUrl('');
    setFile(null);

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

  const handleEditDocument = (doc: Document) => {
    console.log('Editing document:', { id: doc.id, title: doc.title });
    setContentCategory('documents');
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
            console.error('Document not found in local state:', editingId);
            console.log('Available document IDs:', documents.map(d => d.id));
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

          console.log('Updating document:', { id: editingId, updateData });
          await updateDocument(editingId, updateData);
          addToast(contentCategory === 'past-exams' ? 'Past exam updated successfully!' : 'Document updated successfully!', 'success');
        } else {
          // Create Document or Past Exam - Use adminAPI for proper field mapping
          const documentData: any = {
            title: title || (file ? file.name.split('.')[0] : contentCategory === 'past-exams' ? "New Past Exam" : "New Document"),
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
          // Create Video
          await createVideo({
            title: title || "New Video Lesson",
            description: description || "Video description.",
            subject,
            grade: grade === 'General' ? 0 : parseInt(grade),
            isPremium,
            video_url: videoUrl,
            instructor: videoInstructor,
            thumbnail: videoThumbnail || "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&q=80",
            views: 0,
            likes: 0
          });
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

  const handleDeletePost = (id: string, title: string) => {
    setDeletePostConfirmation({
      isOpen: true,
      id: id,
      title: title
    });
  };

  const confirmDeletePost = async () => {
    if (!deletePostConfirmation.id) return;

    try {
      await deleteForumPost(deletePostConfirmation.id);
      await fetchForumPosts(); // Refresh posts list
      addToast('Discussion post deleted successfully', 'success');
      setDeletePostConfirmation({ isOpen: false, id: null, title: null });
    } catch (error: any) {
      console.error('Delete post error:', error);
      const errorMessage = error?.message || 'Failed to delete post. Please try again.';
      addToast(errorMessage, 'error');
    }
  };

  const closeDeletePostConfirmation = () => {
    setDeletePostConfirmation({ isOpen: false, id: null, title: null });
  };

  // --- Student Handlers ---
  const openStatusConfirmation = (student: any) => {
    const currentStatus = student.status || 'Active';
    const isActive = currentStatus === 'Active';
    setConfirmationModal({
      isOpen: true,
      type: isActive ? 'ban' : 'activate',
      studentId: student.id,
      studentName: student.name,
      currentStatus: currentStatus
    });
  };

  const openPremiumConfirmation = (student: any) => {
    setConfirmationModal({
      isOpen: true,
      type: student.isPremium ? 'downgrade' : 'upgrade',
      studentId: student.id,
      studentName: student.name,
      isPremium: student.isPremium
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmationModal.studentId || !confirmationModal.type) return;

    setIsConfirmingAction(true);
    try {
      if (confirmationModal.type === 'upgrade' || confirmationModal.type === 'downgrade') {
        // Premium toggle
        await adminAPI.updateUserPremium(confirmationModal.studentId, confirmationModal.type === 'upgrade');
        await fetchUsers();
        addToast(
          confirmationModal.type === 'upgrade' 
            ? 'User upgraded to Premium Plan' 
            : 'User downgraded to Free Plan',
          'success'
        );
      } else if (confirmationModal.type === 'ban' || confirmationModal.type === 'activate') {
        // Status toggle
        const newStatus = confirmationModal.type === 'ban' ? 'Banned' : 'Active';
        await adminAPI.updateUserStatus(confirmationModal.studentId, newStatus);
        await fetchUsers();
        addToast(
          `User marked as ${newStatus}`, 
          newStatus === 'Active' ? 'success' : 'warning'
        );
      }

      // Close modal
      setConfirmationModal({
        isOpen: false,
        type: null,
        studentId: null,
        studentName: null
      });
    } catch (error: any) {
      addToast(error.message || 'Failed to update user', 'error');
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const closeConfirmationModal = () => {
    setConfirmationModal({
      isOpen: false,
      type: null,
      studentId: null,
      studentName: null
    });
  };

  // --- Team Handlers ---
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;

    setIsInviting(true);
    try {
      await adminAPI.inviteAdmin({
        email: inviteEmail,
        name: inviteName,
        role: inviteRole === 'Super Admin' ? 'ADMIN' : 'MODERATOR'
      });
      setIsInviteOpen(false);
      setInviteName('');
      setInviteEmail('');
      addToast(`Invitation sent to ${inviteEmail}`, 'success');
    } catch (error: any) {
      addToast(error.message || 'Failed to send invitation', 'error');
    } finally {
      setIsInviting(false);
    }
  };

  // Careers Management Functions
  const fetchPositions = useCallback(async () => {
    try {
      setCareersLoading(true);
      const data = await careersAPI.admin.getPositions();
      setPositions(data);
    } catch (error: any) {
      console.error('Failed to fetch positions:', error);
      addToast('Failed to load job positions', 'error');
    } finally {
      setCareersLoading(false);
    }
  }, [addToast]);

  const fetchApplications = useCallback(async (positionId?: string) => {
    try {
      setApplicationsLoading(true);
      const params: any = {};
      if (positionId) params.position_id = positionId;
      if (applicationStatusFilter !== 'all') params.status = applicationStatusFilter;
      if (archiveStatusFilter === 'active') params.archived = 'false';
      else if (archiveStatusFilter === 'archived') params.archived = 'true';
      else if (archiveStatusFilter === 'all') params.archived = 'all';

      const data = await careersAPI.admin.getApplications(params);
      setApplications(data);
    } catch (error: any) {
      console.error('Failed to fetch applications:', error);
      addToast('Failed to load applications', 'error');
    } finally {
      setApplicationsLoading(false);
    }
  }, [applicationStatusFilter, archiveStatusFilter, addToast]);

  useEffect(() => {
    if (activeTab === 'careers') {
      fetchPositions();
      if (positionView === 'applications') {
        fetchApplications(selectedPositionId || undefined);
      }
    }
  }, [activeTab, positionView, selectedPositionId, fetchPositions, fetchApplications]);

  // Fetch applications when filters change
  useEffect(() => {
    if (activeTab === 'careers' && positionView === 'applications') {
      fetchApplications(selectedPositionId || undefined);
    }
  }, [applicationStatusFilter, archiveStatusFilter, activeTab, positionView, selectedPositionId, fetchApplications]);

  const handlePositionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPosition(true);
    try {
      if (editingPositionId) {
        await careersAPI.admin.updatePosition(editingPositionId, positionForm);
        addToast('Job position updated successfully', 'success');
      } else {
        await careersAPI.admin.createPosition(positionForm);
        addToast('Job position created successfully', 'success');
      }
      setIsPositionFormOpen(false);
      setEditingPositionId(null);
      resetPositionForm();
      fetchPositions();
    } catch (error: any) {
      addToast(error.message || 'Failed to save position', 'error');
    } finally {
      setIsSavingPosition(false);
    }
  };

  const handleEditPosition = (position: any) => {
    setEditingPositionId(position.id);
    setPositionForm({
      title: position.title,
      description: position.description,
      requirements: position.requirements || '',
      department: position.department || '',
      employment_type: position.employment_type,
      location: position.location || '',
      is_active: position.is_active
    });
    setIsPositionFormOpen(true);
  };

  const handleDeletePosition = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this position?")) {
      setIsDeletingPosition(id);
      try {
        await careersAPI.admin.deletePosition(id);
        addToast('Position deleted successfully', 'success');
        fetchPositions();
      } catch (error: any) {
        addToast(error.message || 'Failed to delete position', 'error');
      } finally {
        setIsDeletingPosition(null);
      }
    }
  };

  const handleUpdateApplicationStatus = async (applicationId: string, status: 'Pending' | 'Under Review' | 'Interview' | 'Accepted' | 'Rejected', notes?: string) => {
    setIsUpdatingApplication(applicationId);
    try {
      await careersAPI.admin.updateApplicationStatus(applicationId, { status, notes });
      addToast('Application status updated', 'success');
      fetchApplications(selectedPositionId || undefined);
    } catch (error: any) {
      addToast(error.message || 'Failed to update application', 'error');
    } finally {
      setIsUpdatingApplication(null);
    }
  };

  const handleArchiveApplication = async (applicationId: string, isArchived: boolean) => {
    setIsArchivingApplication(applicationId);
    try {
      await careersAPI.admin.archiveApplication(applicationId, isArchived);
      addToast(`Application ${isArchived ? 'archived' : 'activated'}`, 'success');
      fetchApplications(selectedPositionId || undefined);
    } catch (error: any) {
      addToast(error.message || 'Failed to archive application', 'error');
    } finally {
      setIsArchivingApplication(null);
    }
  };

  const handleDeleteApplication = (applicationId: string, applicantName: string) => {
    setDeleteApplicationConfirmation({
      isOpen: true,
      applicationId,
      applicantName
    });
  };

  const confirmDeleteApplication = async () => {
    if (!deleteApplicationConfirmation.applicationId || !deleteApplicationConfirmation.applicantName) return;

    setIsDeletingApplication(deleteApplicationConfirmation.applicationId);
    try {
      await careersAPI.admin.deleteApplication(deleteApplicationConfirmation.applicationId);
      addToast('Application deleted permanently', 'success');
      fetchApplications(selectedPositionId || undefined);
    } catch (error: any) {
      addToast(error.message || 'Failed to delete application', 'error');
    } finally {
      setIsDeletingApplication(null);
      setDeleteApplicationConfirmation({
        isOpen: false,
        applicationId: null,
        applicantName: null
      });
    }
  };

  const resetPositionForm = () => {
    setPositionForm({
      title: '',
      description: '',
      requirements: '',
      department: '',
      employment_type: 'Full-time',
      location: '',
      is_active: true
    });
    setEditingPositionId(null);
  };

  const handleRemoveAdmin = (id: string, name: string) => {
    setRemoveTeamMemberConfirmation({
      isOpen: true,
      id: id,
      name: name
    });
  };

  const confirmRemoveTeamMember = async () => {
    if (!removeTeamMemberConfirmation.id) return;

    setIsRemovingAdmin(removeTeamMemberConfirmation.id);
    try {
      await adminAPI.removeAdmin(removeTeamMemberConfirmation.id);
      await fetchAdmins(); // Refresh admin list
      addToast('Team member removed successfully', 'success');
      setRemoveTeamMemberConfirmation({ isOpen: false, id: null, name: null });
    } catch (error: any) {
      console.error('Remove admin error:', error);
      // Extract error message - could be in error.message or error.response.data.message
      const errorMessage = error?.message || error?.response?.data?.message || 'Failed to remove team member. Please try again.';
      addToast(errorMessage, 'error');
    } finally {
      setIsRemovingAdmin(null);
    }
  };

  const closeRemoveTeamMemberConfirmation = () => {
    setRemoveTeamMemberConfirmation({ isOpen: false, id: null, name: null });
  };

  // Filtering
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

  const filteredStudents = allUsers.filter(s => s.role === UserRole.STUDENT && ((s.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (s.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())));

  // Stats
  const stats = adminStats ? {
    totalUsers: adminStats.total_users,
    premiumUsers: adminStats.premium_users,
    totalDocuments: adminStats.total_documents,
    totalVideos: adminStats.total_videos,
    totalPosts: adminStats.total_forum_posts
  } : {
    totalUsers: allUsers.length,
    premiumUsers: allUsers.filter(s => s.isPremium).length,
    totalDocuments: documents.length,
    totalVideos: videos.length,
    totalPosts: forumPosts.length
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in space-y-4 sm:space-y-8 pb-12 px-2 sm:px-0">
      
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4 border-b border-zinc-200 pb-4 sm:pb-6">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <span className="px-2 py-1 rounded-md bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Shield size={10} /> Admin Panel
              </span>
            </div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-zinc-900 tracking-tight">System Administration</h1>
          </div>

          {/* Main Tabs - Mobile Optimized */}
          <div className="flex p-1 bg-zinc-100 rounded-lg overflow-x-auto hide-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0">
            <div className="flex gap-1 min-w-max">
              {[
                ...(isModerator ? [] : [{ id: 'overview', label: 'Overview', icon: BarChart3 }]),
                { id: 'content', label: 'Content', icon: FileText },
                ...(isModerator ? [] : [
                  { id: 'students', label: 'Students', icon: Users },
                  { id: 'community', label: 'Community', icon: MessageSquare },
                  { id: 'team', label: 'Team', icon: Shield },
                  { id: 'audit', label: 'Audit Log', icon: ScrollText },
                  { id: 'careers', label: 'Careers', icon: Briefcase },
                ]),
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-700 active:bg-white/50'
                  }`}
                >
                  <tab.icon size={16} className="flex-shrink-0" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* --- OVERVIEW TAB --- */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-8 animate-fade-in">
              {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {adminLoading || !adminStats ? (
              <>
                <StatsCardSkeleton />
                <StatsCardSkeleton />
                <StatsCardSkeleton />
                <StatsCardSkeleton />
              </>
            ) : (
              <>
                <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-zinc-700 rounded-lg"><Users size={18} className="sm:w-5 sm:h-5" /></div>
                      <span className="text-[10px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">+12%</span>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight">{stats.totalUsers.toLocaleString()}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Total Students</div>
                </div>
                <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-zinc-700 rounded-lg"><Crown size={18} className="sm:w-5 sm:h-5" /></div>
                      <span className="text-[10px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">+5%</span>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight">{stats.premiumUsers.toLocaleString()}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Premium Subscribers</div>
                </div>
                <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-zinc-700 rounded-lg"><FileText size={18} className="sm:w-5 sm:h-5" /></div>
                      <span className="text-[10px] sm:text-xs font-bold text-zinc-400 bg-zinc-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">New</span>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight">{stats.totalDocuments + stats.totalVideos}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Learning Resources</div>
                </div>
                <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-zinc-700 rounded-lg"><MessageSquare size={18} className="sm:w-5 sm:h-5" /></div>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight">{stats.totalPosts}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Community Posts</div>
                </div>
              </>
            )}
          </div>

          {/* Recent Activity */}
          {adminLoading || !adminStats ? (
            <RecentActivitySkeleton />
          ) : (
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
              <h3 className="font-bold text-zinc-900 mb-4">Recent System Activity</h3>
              <div className="space-y-4">
                 {adminStats?.recent_activity && adminStats.recent_activity.length > 0 ? (
                   adminStats.recent_activity.map((item: any, i: number) => (
                     <div key={i} className="flex items-center justify-between py-3 border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors px-2 -mx-2 rounded-lg">
                        <div className="flex items-center gap-3">
                           <div className={`w-2 h-2 rounded-full ${
                             item.type === 'user_registration' ? 'bg-blue-400' :
                             item.type === 'premium_subscription' ? 'bg-purple-400' :
                             item.type === 'content_upload' ? 'bg-green-400' :
                             'bg-zinc-300'
                           }`}></div>
                           <div>
                              <p className="text-sm font-medium text-zinc-900">
                                {item.type === 'user_registration' ? 'New User Registration' :
                                 item.type === 'premium_subscription' ? 'Premium Subscription' :
                                 item.type === 'content_upload' ? 'Content Upload' :
                                 'System Activity'}
                              </p>
                              <p className="text-xs text-zinc-500">{item.message}</p>
                           </div>
                        </div>
                        <span className="text-xs text-zinc-400">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                     </div>
                   ))
                 ) : (
                   <div className="text-center py-8 text-zinc-500">
                     <p className="text-sm">No recent activity to display</p>
                   </div>
                 )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- AUDIT LOG TAB (ADMIN ONLY) --- */}
      {activeTab === 'audit' && !isModerator && (
        <div className="space-y-4 sm:space-y-6 animate-fade-in">
          <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-zinc-100 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-900">Admin Activity Log</h2>
                <p className="text-xs sm:text-sm text-zinc-500">Who changed what (premium, status, content, team).</p>
              </div>
              <div className="flex gap-2 sm:gap-3 items-center w-full sm:w-auto">
                <div className="relative w-full sm:w-80">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-zinc-400" />
                  </div>
                  <input
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search (action, email, target, summary)..."
                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-300 transition-all"
                  />
                </div>
                <button
                  onClick={() => fetchAuditLogs({ offset: 0 })}
                  disabled={auditLoading}
                  className="px-3 py-2.5 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  title="Refresh"
                >
                  {auditLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 sm:px-6 py-3">Time</th>
                    <th className="px-4 sm:px-6 py-3">Actor</th>
                    <th className="px-4 sm:px-6 py-3">Action</th>
                    <th className="px-4 sm:px-6 py-3">Target</th>
                    <th className="px-4 sm:px-6 py-3">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {auditLoading ? (
                    <tr>
                      <td className="px-4 sm:px-6 py-6 text-zinc-500" colSpan={5}>Loading audit logs...</td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td className="px-4 sm:px-6 py-6 text-zinc-500" colSpan={5}>No audit logs found.</td>
                    </tr>
                  ) : (
                    auditLogs.map((row: any) => {
                      const id = String(row.id);
                      const expanded = auditExpandedId === id;
                      const changes = expanded ? computeAuditChanges(row.before, row.after) : [];
                      return (
                        <React.Fragment key={id}>
                          <tr
                            className="hover:bg-zinc-50 cursor-pointer"
                            onClick={() => setAuditExpandedId(expanded ? null : id)}
                          >
                            <td className="px-4 sm:px-6 py-4 text-xs text-zinc-600 whitespace-nowrap">
                              {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                            </td>
                            <td className="px-4 sm:px-6 py-4">
                              <div className="text-zinc-900 font-medium">{row.actor_name || row.actor_email || 'Unknown'}</div>
                              <div className="text-[11px] text-zinc-500">{row.actor_role || ''}</div>
                            </td>
                            <td className="px-4 sm:px-6 py-4 font-mono text-xs text-zinc-700">{row.action || '-'}</td>
                            <td className="px-4 sm:px-6 py-4 text-xs text-zinc-600">
                              <div>{row.target_type || '-'}</div>
                              <div className="font-mono text-[11px] text-zinc-400">{row.target_id || ''}</div>
                            </td>
                            <td className="px-4 sm:px-6 py-4 text-zinc-700">{row.summary || '-'}</td>
                          </tr>
                          {expanded && (
                            <tr className="bg-zinc-50/50">
                              <td className="px-4 sm:px-6 py-4" colSpan={5}>
                                <div className="space-y-3 sm:space-y-4">
                                  <div className="bg-white border border-zinc-200 rounded-lg p-3">
                                    <div className="text-xs font-semibold text-zinc-700 mb-2">Changes</div>
                                    {changes.length === 0 ? (
                                      <div className="text-xs text-zinc-500">No field-level changes available.</div>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                          <thead className="text-[11px] text-zinc-500 uppercase">
                                            <tr>
                                              <th className="text-left py-2 pr-3">Field</th>
                                              <th className="text-left py-2 pr-3">Before</th>
                                              <th className="text-left py-2">After</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-zinc-100">
                                            {changes.slice(0, 30).map((c) => (
                                              <tr key={c.key}>
                                                <td className="py-2 pr-3 font-mono text-zinc-700">{c.key}</td>
                                                <td className="py-2 pr-3 text-zinc-600 break-words">{formatAuditValue(c.before)}</td>
                                                <td className="py-2 text-zinc-600 break-words">{formatAuditValue(c.after)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                        {changes.length > 30 && (
                                          <div className="mt-2 text-[11px] text-zinc-500">Showing first 30 changes.</div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                                    <details className="bg-white border border-zinc-200 rounded-lg p-3">
                                      <summary className="text-xs font-semibold text-zinc-700 cursor-pointer select-none">Raw Before JSON</summary>
                                      <pre className="mt-2 text-[11px] text-zinc-700 whitespace-pre-wrap break-words max-h-[320px] overflow-auto">{JSON.stringify(row.before ?? null, null, 2)}</pre>
                                    </details>
                                    <details className="bg-white border border-zinc-200 rounded-lg p-3">
                                      <summary className="text-xs font-semibold text-zinc-700 cursor-pointer select-none">Raw After JSON</summary>
                                      <pre className="mt-2 text-[11px] text-zinc-700 whitespace-pre-wrap break-words max-h-[320px] overflow-auto">{JSON.stringify(row.after ?? null, null, 2)}</pre>
                                    </details>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 sm:p-6 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
              <div>
                Showing <span className="font-medium text-zinc-700">{auditLogs.length}</span> of{' '}
                <span className="font-medium text-zinc-700">{auditPagination.total}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchAuditLogs({ offset: Math.max(0, auditPagination.offset - auditPagination.limit) })}
                  disabled={auditLoading || auditPagination.offset === 0}
                  className="px-3 py-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  onClick={() => fetchAuditLogs({ offset: auditPagination.offset + auditPagination.limit })}
                  disabled={auditLoading || !auditPagination.hasMore}
                  className="px-3 py-2 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CONTENT TAB --- */}
      {activeTab === 'content' && (
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
                           onClick={() => (contentCategory === 'documents' || contentCategory === 'past-exams') ? handleEditDocument(item as Document) : handleEditVideo(item as VideoLesson)}
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
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                               onClick={() => (contentCategory === 'documents' || contentCategory === 'past-exams') ? handleEditDocument(item as Document) : handleEditVideo(item as VideoLesson)}
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
      )}

      {/* --- STUDENTS TAB --- */}
      {activeTab === 'students' && (
        <div className="space-y-4 sm:space-y-6 animate-fade-in">
           <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-3 sm:p-4 rounded-xl border border-zinc-200 shadow-sm">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900">Student Management</h2>
              <div className="relative w-full sm:w-auto">
                 <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                 <input 
                   type="text" 
                   placeholder="Search students..." 
                   className="pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-400 transition-all w-full sm:w-64"
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                 />
              </div>
           </div>

           {loading.users ? (
             <StudentsTableSkeleton />
           ) : (
             <>
               {/* Mobile Card Layout */}
               <div className="md:hidden space-y-3">
                 {filteredStudents.map((student) => (
                   <div key={student.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4">
                     <div className="flex items-start justify-between mb-3">
                       <div className="flex-1 min-w-0">
                         <h4 className="font-medium text-zinc-900 truncate">{student.name}</h4>
                         <p className="text-xs text-zinc-500 truncate">{student.email}</p>
                       </div>
                       <button 
                         onClick={() => openStatusConfirmation(student)}
                         className={`ml-2 p-2 rounded-lg transition-colors ${
                           (student.status === 'Active' || !student.status) ? 'text-zinc-400 hover:text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                         }`}
                       >
                         {(student.status === 'Active' || !student.status) ? <Ban size={16} /> : <CheckCircle size={16} />}
                       </button>
                     </div>
                     <div className="flex items-center justify-between gap-2 text-xs">
                       <div className="flex items-center gap-2">
                         <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border text-[10px] ${
                           (student.status === 'Active' || !student.status) ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
                         }`}>
                           <span className={`w-1 h-1 rounded-full ${(student.status === 'Active' || !student.status) ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                           {student.status || 'Active'}
                         </span>
                         {student.isPremium ? (
                           <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 flex items-center gap-1">
                             <Crown size={10} /> PRO
                           </span>
                         ) : (
                           <span className="text-[10px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">Free</span>
                         )}
                       </div>
                       <button 
                         onClick={() => openPremiumConfirmation(student)}
                         className="text-[10px] font-medium text-zinc-500 hover:text-amber-600 hover:underline"
                       >
                         {student.isPremium ? 'Downgrade' : 'Upgrade'}
                       </button>
                     </div>
                     <div className="mt-2 text-[10px] text-zinc-400">
                       Joined {new Date(student.joinedDate || '').toLocaleDateString()}
                     </div>
                   </div>
                 ))}
                 {filteredStudents.length === 0 && (
                   <div className="text-center py-12 text-zinc-400 text-sm">No students found.</div>
                 )}
               </div>

               {/* Desktop Table Layout */}
               <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
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
                             (student.status === 'Active' || !student.status) ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
                           }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${(student.status === 'Active' || !student.status) ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                              {student.status || 'Active'}
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
                           {new Date(student.joinedDate || '').toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex justify-end items-center gap-2">
                              <button 
                                onClick={() => openPremiumConfirmation(student)}
                                className="text-xs font-medium text-zinc-500 hover:text-amber-600 hover:underline"
                              >
                                {student.isPremium ? 'Downgrade' : 'Upgrade'}
                              </button>
                              <div className="h-4 w-px bg-zinc-200"></div>
                              <button 
                                onClick={() => openStatusConfirmation(student)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  (student.status === 'Active' || !student.status) ? 'text-zinc-400 hover:text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={(student.status === 'Active' || !student.status) ? 'Ban User' : 'Activate User'}
                              >
                                {(student.status === 'Active' || !student.status) ? <Ban size={16} /> : <CheckCircle size={16} />}
                              </button>
                           </div>
                        </td>
                      </tr>
                      ))}
                      {filteredStudents.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 text-sm">
                            No students found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
             </>
           )}
        </div>
      )}

      {/* --- COMMUNITY TAB --- */}
      {activeTab === 'community' && (
         <div className="space-y-4 sm:space-y-6 animate-fade-in">
            <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 mb-2">Community Moderation</h2>
              <p className="text-xs sm:text-sm text-zinc-500">Review flagged posts and manage discussions.</p>
            </div>

            {loading.forumPosts ? (
              <CommunityPostsSkeleton />
            ) : (
              <div className="grid gap-3 sm:gap-4">
                 {forumPosts.map(post => (
                   <div key={post.id} className="bg-white p-4 sm:p-5 rounded-xl border border-zinc-200 shadow-sm flex gap-3 sm:gap-4">
                      <div className="flex flex-col items-center gap-1 text-zinc-400 pt-1 hidden sm:flex">
                         <AlertTriangle size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-2">
                            <h3 className="font-bold text-zinc-900 text-sm flex-1 min-w-0 line-clamp-1">{post.title}</h3>
                            <button
                              onClick={() => handleDeletePost(post.id, post.title)}
                              className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 px-2 py-1 rounded hover:bg-red-100 transition-colors whitespace-nowrap"
                            >
                              Delete
                            </button>
                         </div>
                         <p className="text-xs sm:text-sm text-zinc-600 line-clamp-2 mb-3 bg-zinc-50 p-2 sm:p-3 rounded-lg border border-zinc-100 italic">
                            "{post.content}"
                         </p>
                         <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-zinc-400">
                            <span className="truncate">Posted by <span className="font-medium text-zinc-600">{post.author}</span></span>
                            <span className="hidden sm:inline">•</span>
                            <span className="text-[10px] sm:text-xs">{post.createdAt}</span>
                            <span className="hidden sm:inline">•</span>
                            <span className="text-[10px] sm:text-xs">{post.comment_count} comments</span>
                         </div>
                      </div>
                   </div>
                 ))}
                 {forumPosts.length === 0 && (
                   <div className="text-center py-12 text-zinc-400">No community posts to moderate.</div>
                 )}
              </div>
            )}
         </div>
      )}

      {/* --- CAREERS TAB --- */}
      {activeTab === 'careers' && (
        <div className="space-y-4 sm:space-y-6 animate-fade-in">
          {/* View Toggle */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-3 sm:p-4 rounded-xl border border-zinc-200 shadow-sm">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">Careers Management</h2>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPositionView('positions');
                  setSelectedPositionId(null);
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  positionView === 'positions'
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                Positions
              </button>
              <button
                onClick={() => {
                  setPositionView('applications');
                  fetchApplications();
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  positionView === 'applications'
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                Applications
              </button>
              {positionView === 'positions' && (
                <button
                  onClick={() => {
                    resetPositionForm();
                    setIsPositionFormOpen(true);
                  }}
                  className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
                >
                  <UserPlus size={16} /> New Position
                </button>
              )}
            </div>
          </div>

          {/* Positions View */}
          {positionView === 'positions' && (
            <div className="space-y-4">
              {careersLoading ? (
                <PositionsSkeleton />
              ) : positions.length === 0 ? (
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-8 sm:p-12 text-center">
                  <Briefcase size={48} className="mx-auto text-zinc-300 mb-4" />
                  <p className="text-zinc-500 text-sm sm:text-base">No job positions yet. Create your first position!</p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {positions.map((position) => (
                    <div key={position.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-6 hover:border-zinc-300 hover:shadow-md transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3 mb-2 flex-wrap">
                            <div className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                              position.is_active
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                            }`}>
                              {position.is_active ? 'Active' : 'Inactive'}
                            </div>
                            <h3 className="font-bold text-zinc-900 text-base sm:text-lg flex-1 min-w-0">{position.title}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-zinc-500 mb-3">
                            {position.department && (
                              <span className="flex items-center gap-1.5">
                                <Briefcase size={12} className="text-zinc-400" />
                                {position.department}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              <Clock size={12} className="text-zinc-400" />
                              {position.employment_type}
                            </span>
                            {position.location && (
                              <span className="flex items-center gap-1.5">
                                <MapPin size={12} className="text-zinc-400" />
                                {position.location}
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-zinc-600 line-clamp-2 leading-relaxed">{position.description}</p>
                        </div>
                        <div className="flex gap-2 sm:flex-shrink-0">
                          <button
                            onClick={() => handleEditPosition(position)}
                            className="p-2.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                            title="Edit position"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDeletePosition(position.id)}
                            disabled={isDeletingPosition === position.id}
                            className="p-2.5 text-zinc-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete position"
                          >
                            {isDeletingPosition === position.id ? (
                              <Loader2 size={18} className="animate-spin" />
                            ) : (
                              <Trash2 size={18} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Applications View */}
          {positionView === 'applications' && (
            <div className="space-y-4">
              {/* Filter */}
              <div className="bg-white p-3 sm:p-4 rounded-xl border border-zinc-200 shadow-sm">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                      <label className="text-xs font-semibold text-zinc-700 sm:mr-2 whitespace-nowrap">Filter by Status:</label>
                      <div className="flex-1 sm:flex-initial sm:w-48">
                        <CustomSelect
                          options={applicationStatusOptions}
                          value={applicationStatusFilter}
                          onChange={(value) => {
                            setApplicationStatusFilter(value);
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                      <label className="text-xs font-semibold text-zinc-700 sm:mr-2 whitespace-nowrap">Archive Status:</label>
                      <div className="flex-1 sm:flex-initial sm:w-48">
                        <CustomSelect
                          options={archiveStatusOptions}
                          value={archiveStatusFilter}
                          onChange={(value) => {
                            setArchiveStatusFilter(value);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {applicationsLoading ? (
                <ApplicationsSkeleton />
              ) : applications.length === 0 ? (
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-8 sm:p-12 text-center">
                  <Mail size={48} className="mx-auto text-zinc-300 mb-4" />
                  <p className="text-zinc-500 text-sm sm:text-base">No applications found.</p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {applications.map((application) => {
                    const position = positions.find(p => p.id === application.position_id);
                    return (
                      <div key={application.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-6 hover:border-zinc-300 hover:shadow-md transition-all">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-3 mb-2 flex-wrap">
                                <div className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                                  application.status === 'Accepted' 
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                                    : application.status === 'Rejected' 
                                    ? 'bg-red-100 text-red-700 border-red-200'
                                    : application.status === 'Interview' 
                                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                                    : application.status === 'Under Review'
                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                    : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                                }`}>
                                  {application.status}
                                </div>
                                <h3 className="font-bold text-zinc-900 text-base sm:text-lg flex-1 min-w-0">{application.applicant_name}</h3>
                              </div>
                              <div className="space-y-1.5 mb-3">
                                <p className="text-xs sm:text-sm text-zinc-500 flex items-center gap-1.5">
                                  <Mail size={12} className="text-zinc-400" />
                                  {application.applicant_email}
                                </p>
                                {application.applicant_phone && (
                                  <p className="text-xs sm:text-sm text-zinc-500 flex items-center gap-1.5">
                                    <span className="text-zinc-400">📞</span>
                                    {application.applicant_phone}
                                  </p>
                                )}
                                {position && (
                                  <p className="text-xs sm:text-sm text-zinc-600 flex items-center gap-1.5">
                                    <Briefcase size={12} className="text-zinc-400" />
                                    Applied for: <strong className="text-zinc-900">{position.title}</strong>
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 sm:flex-shrink-0">
                              <div className="w-full sm:w-40">
                                <CustomSelect
                                  options={statusUpdateOptions}
                                  value={application.status}
                                  onChange={(value) => handleUpdateApplicationStatus(application.id, value as 'Pending' | 'Under Review' | 'Interview' | 'Accepted' | 'Rejected')}
                                />
                              </div>
                              {application.resume_url && (
                                <a
                                  href={application.resume_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-2 bg-zinc-100 text-zinc-700 rounded-lg text-xs sm:text-sm hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1.5 font-medium whitespace-nowrap"
                                >
                                  <FileText size={14} />
                                  Resume
                                </a>
                              )}
                              <button
                                onClick={() => handleArchiveApplication(application.id, !application.is_archived)}
                                disabled={isArchivingApplication === application.id}
                                className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-xs sm:text-sm hover:bg-amber-200 transition-colors flex items-center justify-center gap-1.5 font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isArchivingApplication === application.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : application.is_archived ? (
                                  <ArchiveRestore size={14} />
                                ) : (
                                  <Archive size={14} />
                                )}
                                {application.is_archived ? 'Activate' : 'Archive'}
                              </button>
                              <button
                                onClick={() => handleDeleteApplication(application.id, application.applicant_name)}
                                disabled={isDeletingApplication === application.id}
                                className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-xs sm:text-sm hover:bg-red-200 transition-colors flex items-center justify-center gap-1.5 font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isDeletingApplication === application.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                                Delete
                              </button>
                            </div>
                          </div>
                          {application.cover_letter && (
                            <div className="pt-4 border-t border-zinc-100">
                              <p className="text-xs font-semibold text-zinc-700 mb-2">Cover Letter:</p>
                              <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">{application.cover_letter}</p>
                            </div>
                          )}
                          {application.created_at && (
                            <div className="pt-2 border-t border-zinc-50">
                              <p className="text-xs text-zinc-400">
                                Applied on {new Date(application.created_at).toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Position Form Modal */}
          {isPositionFormOpen && mounted && createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl relative animate-slide-up max-h-[90vh] overflow-hidden flex flex-col">
                {/* Sticky Header */}
                <div className="p-3 sm:p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 rounded-t-xl sticky top-0 z-10">
                  <h3 className="font-bold text-zinc-900 text-sm sm:text-base flex items-center gap-2">
                    <Briefcase size={18} className="text-zinc-600" />
                    {editingPositionId ? 'Edit Position' : 'Create New Position'}
                  </h3>
                  <button
                    onClick={() => {
                      setIsPositionFormOpen(false);
                      resetPositionForm();
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-900 rounded hover:bg-zinc-200 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                {/* Form Content */}
                <form onSubmit={handlePositionSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Job Title *</label>
                    <input
                      type="text"
                      value={positionForm.title}
                      onChange={(e) => setPositionForm({ ...positionForm, title: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm"
                      placeholder="e.g., Senior Content Developer (Physics)"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Description *</label>
                    <textarea
                      value={positionForm.description}
                      onChange={(e) => setPositionForm({ ...positionForm, description: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm resize-none"
                      rows={5}
                      placeholder="Describe the role, responsibilities, and what makes it exciting..."
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Requirements & Qualifications</label>
                    <textarea
                      value={positionForm.requirements}
                      onChange={(e) => setPositionForm({ ...positionForm, requirements: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm resize-none"
                      rows={4}
                      placeholder="List required skills, experience, education, etc."
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Department</label>
                      <input
                        type="text"
                        value={positionForm.department}
                        onChange={(e) => setPositionForm({ ...positionForm, department: e.target.value })}
                        className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm"
                        placeholder="e.g., Content, Engineering"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Employment Type *</label>
                      <CustomSelect
                        options={employmentTypeOptions}
                        value={positionForm.employment_type}
                        onChange={(value) => setPositionForm({ ...positionForm, employment_type: value as any })}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Location</label>
                    <input
                      type="text"
                      value={positionForm.location}
                      onChange={(e) => setPositionForm({ ...positionForm, location: e.target.value })}
                      className="w-full px-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm"
                      placeholder="e.g., Addis Ababa / Remote"
                    />
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={positionForm.is_active}
                      onChange={(e) => setPositionForm({ ...positionForm, is_active: e.target.checked })}
                      className="w-4 h-4 text-zinc-900 bg-white border-zinc-300 rounded focus:ring-zinc-900/5 focus:ring-2"
                    />
                    <label htmlFor="is_active" className="text-xs sm:text-sm text-zinc-700 cursor-pointer">
                      <span className="font-medium">Active Position</span>
                      <span className="text-zinc-500 block mt-0.5">Visible to applicants on the careers page</span>
                    </label>
                  </div>
                  
                  <div className="flex gap-3 pt-4 border-t border-zinc-100">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPositionFormOpen(false);
                        resetPositionForm();
                      }}
                      className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingPosition}
                      className="flex-1 px-4 py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSavingPosition ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          {editingPositionId ? 'Saving...' : 'Creating...'}
                        </>
                      ) : editingPositionId ? (
                        <>
                          <Save size={16} />
                          Update Position
                        </>
                      ) : (
                        <>
                          <CheckCircle size={16} />
                          Create Position
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}
        </div>
      )}

      {/* --- TEAM TAB --- */}
      {activeTab === 'team' && (
        <div className="space-y-4 sm:space-y-8 animate-fade-in">
           <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-end gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-900">Admin Team</h2>
                <p className="text-xs sm:text-sm text-zinc-500">Manage admins and moderators with access to the admin panel.</p>
              </div>
              <button 
                onClick={() => setIsInviteOpen(true)}
                className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <UserPlus size={16} /> <span>Invite Member</span>
              </button>
           </div>

           {adminLoading ? (
             <AdminTeamSkeleton />
           ) : (
             <>
               {/* Separate Active and Inactive Members */}
               {(() => {
                 const activeMembers = admins.filter((member: any) => (member.status || 'Active') === 'Active');
                 const inactiveMembers = admins.filter((member: any) => (member.status || 'Active') !== 'Active');
                 
                 return (
                   <div className="space-y-6">
                     {/* Active Members Section */}
                     <div>
                       <div className="flex items-center gap-2 mb-4">
                         <div className="w-1 h-5 bg-emerald-500 rounded-full"></div>
                         <h3 className="text-sm font-bold text-zinc-900">Active Members ({activeMembers.length})</h3>
                       </div>
                       
                       {/* Mobile Card Layout - Active */}
                       <div className="md:hidden space-y-3">
                         {activeMembers.length > 0 ? (
                           activeMembers.map((member) => (
                             <div key={member.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4">
                               <div className="flex items-start justify-between mb-3">
                                 <div className="flex items-center gap-3 flex-1 min-w-0">
                                   <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-sm font-bold text-zinc-600 flex-shrink-0">
                                     {member.name.charAt(0)}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                     <h4 className="font-medium text-zinc-900 truncate">{member.name}</h4>
                                     <p className="text-xs text-zinc-500 truncate">{member.email}</p>
                                   </div>
                                 </div>
                                 <button
                                   onClick={() => handleRemoveAdmin(member.id, member.name)}
                                   disabled={isRemovingAdmin === member.id}
                                   className="ml-2 p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                 >
                                   {isRemovingAdmin === member.id ? (
                                     <Loader2 size={16} className="animate-spin" />
                                   ) : (
                                     <Trash2 size={16} />
                                   )}
                                 </button>
                               </div>
                               <div className="flex items-center justify-between text-xs">
                                 <div className="flex items-center gap-2 flex-wrap">
                                   <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                     member.role === 'ADMIN' 
                                       ? 'bg-zinc-900 text-white' 
                                       : 'bg-blue-50 text-blue-700 border border-blue-100'
                                   }`}>
                                     {member.role === 'ADMIN' ? 'Super Admin' : member.role === 'MODERATOR' ? 'Content Manager' : member.role}
                                   </span>
                                   <span className="px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px]">
                                     Active
                                   </span>
                                 </div>
                                 <span className="text-zinc-400 text-[10px]">
                                   {new Date((member as any).created_at || (member as any).joinedDate || '').toLocaleDateString()}
                                 </span>
                               </div>
                             </div>
                           ))
                         ) : (
                           <div className="text-center py-8 text-zinc-400 text-sm bg-white rounded-xl border border-zinc-200">No active members.</div>
                         )}
                       </div>

                       {/* Desktop Table Layout - Active */}
                       <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
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
                              {activeMembers.length > 0 ? (
                                activeMembers.map((member) => (
                                  <tr key={member.id} className="hover:bg-zinc-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                       <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                                             {member.name.charAt(0)}
                                          </div>
                                          <div>
                                            <p className="font-medium text-zinc-900">{member.name}</p>
                                            <p className="text-xs text-zinc-500">{member.email}</p>
                                          </div>
                                       </div>
                                    </td>
                                    <td className="px-6 py-4">
                                       <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                         member.role === 'ADMIN' 
                                           ? 'bg-zinc-900 text-white' 
                                           : 'bg-blue-50 text-blue-700 border border-blue-100'
                                       }`}>
                                         {member.role === 'ADMIN' ? 'Super Admin' : member.role === 'MODERATOR' ? 'Content Manager' : member.role}
                                       </span>
                                    </td>
                                    <td className="px-6 py-4">
                                       <span className="text-xs px-2 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100">
                                         Active
                                       </span>
                                    </td>
                                    <td className="px-6 py-4 text-zinc-500 text-xs">
                                       {new Date((member as any).created_at || (member as any).joinedDate || '').toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                       <button
                                         onClick={() => handleRemoveAdmin(member.id, member.name)}
                                         disabled={isRemovingAdmin === member.id}
                                         className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                       >
                                         {isRemovingAdmin === member.id ? (
                                           <Loader2 size={16} className="animate-spin" />
                                         ) : (
                                           <Trash2 size={16} />
                                         )}
                                       </button>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 text-sm">
                                    No active members.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                     </div>

                     {/* Inactive Members Section (Pending Invitations) */}
                     {inactiveMembers.length > 0 && (
                       <div>
                         <div className="flex items-center gap-2 mb-4">
                           <div className="w-1 h-5 bg-amber-500 rounded-full"></div>
                           <h3 className="text-sm font-bold text-zinc-900">Pending Invitations ({inactiveMembers.length})</h3>
                         </div>
                         
                         {/* Mobile Card Layout - Inactive */}
                         <div className="md:hidden space-y-3">
                           {inactiveMembers.map((member) => (
                             <div key={member.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 opacity-75">
                               <div className="flex items-start justify-between mb-3">
                                 <div className="flex items-center gap-3 flex-1 min-w-0">
                                   <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-sm font-bold text-zinc-600 flex-shrink-0">
                                     {member.name.charAt(0)}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                     <h4 className="font-medium text-zinc-900 truncate">{member.name}</h4>
                                     <p className="text-xs text-zinc-500 truncate">{member.email}</p>
                                   </div>
                                 </div>
                                 <button
                                   onClick={() => handleRemoveAdmin(member.id, member.name)}
                                   disabled={isRemovingAdmin === member.id}
                                   className="ml-2 p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                 >
                                   {isRemovingAdmin === member.id ? (
                                     <Loader2 size={16} className="animate-spin" />
                                   ) : (
                                     <Trash2 size={16} />
                                   )}
                                 </button>
                               </div>
                               <div className="flex items-center justify-between text-xs">
                                 <div className="flex items-center gap-2 flex-wrap">
                                   <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                     member.role === 'ADMIN' 
                                       ? 'bg-zinc-900 text-white' 
                                       : 'bg-blue-50 text-blue-700 border border-blue-100'
                                   }`}>
                                     {member.role === 'ADMIN' ? 'Super Admin' : member.role === 'MODERATOR' ? 'Content Manager' : member.role}
                                   </span>
                                   <span className="px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-100 text-[10px]">
                                     Pending
                                   </span>
                                 </div>
                                 <span className="text-zinc-400 text-[10px]">
                                   Invited {new Date((member as any).created_at || (member as any).joinedDate || '').toLocaleDateString()}
                                 </span>
                               </div>
                             </div>
                           ))}
                         </div>

                         {/* Desktop Table Layout - Inactive */}
                         <div className="hidden md:block bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden opacity-90">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                              <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
                                <tr>
                                  <th className="px-6 py-3 font-semibold">User</th>
                                  <th className="px-6 py-3 font-semibold">Role</th>
                                  <th className="px-6 py-3 font-semibold">Status</th>
                                  <th className="px-6 py-3 font-semibold">Invited</th>
                                  <th className="px-6 py-3 font-semibold text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-50">
                                {inactiveMembers.map((member) => (
                                  <tr key={member.id} className="hover:bg-zinc-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                       <div className="flex items-center gap-3">
                                          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                                             {member.name.charAt(0)}
                                          </div>
                                          <div>
                                            <p className="font-medium text-zinc-900">{member.name}</p>
                                            <p className="text-xs text-zinc-500">{member.email}</p>
                                          </div>
                                       </div>
                                    </td>
                                    <td className="px-6 py-4">
                                       <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                         member.role === 'ADMIN' 
                                           ? 'bg-zinc-900 text-white' 
                                           : 'bg-blue-50 text-blue-700 border border-blue-100'
                                       }`}>
                                         {member.role === 'ADMIN' ? 'Super Admin' : member.role === 'MODERATOR' ? 'Content Manager' : member.role}
                                       </span>
                                    </td>
                                    <td className="px-6 py-4">
                                       <span className="text-xs px-2 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-100">
                                         Pending
                                       </span>
                                    </td>
                                    <td className="px-6 py-4 text-zinc-500 text-xs">
                                       {new Date((member as any).created_at || (member as any).joinedDate || '').toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                       <button
                                         onClick={() => handleRemoveAdmin(member.id, member.name)}
                                         disabled={isRemovingAdmin === member.id}
                                         className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                       >
                                         {isRemovingAdmin === member.id ? (
                                           <Loader2 size={16} className="animate-spin" />
                                         ) : (
                                           <Trash2 size={16} />
                                         )}
                                       </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                       </div>
                     )}
                   </div>
                 );
               })()}
             </>
           )}

           {/* Invite Modal */}
           {isInviteOpen && mounted && createPortal(
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up max-h-[90vh] overflow-y-auto">
                  <div className="p-3 sm:p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 rounded-t-xl sticky top-0">
                     <h3 className="font-bold text-zinc-900 text-sm sm:text-base">Invite Team Member</h3>
                     <button onClick={() => setIsInviteOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-900 rounded hover:bg-zinc-200">
                       <X size={20} />
                     </button>
                  </div>
                  <form onSubmit={handleInvite} className="p-4 sm:p-6 space-y-4">
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
                       disabled={isInviting}
                       className="w-full py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                     >
                       {isInviting ? (
                         <>
                           <Loader2 size={16} className="animate-spin" />
                           Sending...
                         </>
                       ) : (
                         'Send Invitation'
                       )}
                     </button>
                  </form>
                </div>
              </div>,
              document.body
           )}
        </div>
      )}

      {/* Confirmation Modal - Outside all tabs so it can be shown from any tab */}
      {confirmationModal.isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up">
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-3 rounded-full ${
                  confirmationModal.type === 'ban' 
                    ? 'bg-red-100 text-red-600' 
                    : confirmationModal.type === 'activate'
                    ? 'bg-emerald-100 text-emerald-600'
                    : confirmationModal.type === 'upgrade'
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-zinc-100 text-zinc-600'
                }`}>
                  {confirmationModal.type === 'ban' && <Ban size={24} />}
                  {confirmationModal.type === 'activate' && <CheckCircle size={24} />}
                  {confirmationModal.type === 'upgrade' && <Crown size={24} />}
                  {confirmationModal.type === 'downgrade' && <X size={24} />}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-zinc-900 text-lg mb-2">
                    {confirmationModal.type === 'upgrade' && 'Upgrade to Premium?'}
                    {confirmationModal.type === 'downgrade' && 'Downgrade to Free Plan?'}
                    {confirmationModal.type === 'ban' && 'Ban User?'}
                    {confirmationModal.type === 'activate' && 'Activate User?'}
                  </h3>
                  <p className="text-sm text-zinc-600">
                    {confirmationModal.type === 'upgrade' && (
                      <>Are you sure you want to upgrade <strong>{confirmationModal.studentName}</strong> to Premium Plan? They will gain access to all premium content.</>
                    )}
                    {confirmationModal.type === 'downgrade' && (
                      <>Are you sure you want to downgrade <strong>{confirmationModal.studentName}</strong> to Free Plan? They will lose access to premium content.</>
                    )}
                    {confirmationModal.type === 'ban' && (
                      <>Are you sure you want to ban <strong>{confirmationModal.studentName}</strong>? They will not be able to access the platform.</>
                    )}
                    {confirmationModal.type === 'activate' && (
                      <>Are you sure you want to activate <strong>{confirmationModal.studentName}</strong>? They will regain access to the platform.</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-zinc-100">
                <button
                  onClick={closeConfirmationModal}
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={isConfirmingAction}
                  className={`flex-1 px-4 py-2.5 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    confirmationModal.type === 'ban'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : confirmationModal.type === 'activate'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : confirmationModal.type === 'upgrade'
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-zinc-600 text-white hover:bg-zinc-700'
                  }`}
                >
                  {isConfirmingAction ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {confirmationModal.type === 'upgrade' && 'Upgrading...'}
                      {confirmationModal.type === 'downgrade' && 'Downgrading...'}
                      {confirmationModal.type === 'ban' && 'Banning...'}
                      {confirmationModal.type === 'activate' && 'Activating...'}
                    </>
                  ) : (
                    <>
                      {confirmationModal.type === 'upgrade' && 'Upgrade'}
                      {confirmationModal.type === 'downgrade' && 'Downgrade'}
                      {confirmationModal.type === 'ban' && 'Ban User'}
                      {confirmationModal.type === 'activate' && 'Activate'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
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

      {/* Remove Team Member Confirmation Modal */}
      {removeTeamMemberConfirmation.isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up">
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                  <Trash2 size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-zinc-900 text-lg mb-2">
                    Remove Team Member?
                  </h3>
                  <p className="text-sm text-zinc-600">
                    Are you sure you want to remove <strong>"{removeTeamMemberConfirmation.name}"</strong> from the admin team? This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-zinc-100">
                <button
                  onClick={closeRemoveTeamMemberConfirmation}
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemoveTeamMember}
                  disabled={isRemovingAdmin === removeTeamMemberConfirmation.id}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRemovingAdmin === removeTeamMemberConfirmation.id ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Removing...
                    </>
                  ) : (
                    'Remove Member'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Post Confirmation Modal */}
      {deletePostConfirmation.isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up">
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                  <Trash2 size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-zinc-900 text-lg mb-2">
                    Delete Community Post?
                  </h3>
                  <p className="text-sm text-zinc-600">
                    Are you sure you want to delete <strong>"{deletePostConfirmation.title}"</strong>? This will also delete all comments associated with this post. This action is permanent and cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-zinc-100">
                <button
                  onClick={closeDeletePostConfirmation}
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeletePost}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  Delete Forever
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Application Confirmation Modal */}
      {deleteApplicationConfirmation.isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up">
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                  <Trash2 size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-zinc-900 text-lg mb-2">
                    Delete Application?
                  </h3>
                  <p className="text-sm text-zinc-600">
                    Are you sure you want to permanently delete the application from <strong>{deleteApplicationConfirmation.applicantName}</strong>? This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-zinc-100">
                <button
                  onClick={() => setDeleteApplicationConfirmation({ isOpen: false, applicationId: null, applicantName: null })}
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteApplication}
                  disabled={isDeletingApplication === deleteApplicationConfirmation.applicationId}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeletingApplication === deleteApplicationConfirmation.applicationId ? (
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
    </div>
  );
};

export default Admin;
