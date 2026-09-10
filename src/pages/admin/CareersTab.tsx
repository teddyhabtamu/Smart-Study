import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, Briefcase, CheckCircle, Clock, Edit2, FileText, Loader2, Mail, MapPin, Save, Trash2, UserPlus, X } from 'lucide-react';
import CustomSelect, { Option } from '../../components/CustomSelect';
import { useToast } from '../../context/ToastContext';
import { careersAPI } from '../../services/api';
import { PositionsSkeleton, ApplicationsSkeleton } from './skeletons';

// Careers management tab (extracted from Admin.tsx): job positions,
// applications review, position form. Fully self-contained.
const CareersTab: React.FC = () => {
  const { addToast } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Careers Management State
  const [positions, setPositions] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [careersLoading, setCareersLoading] = useState(false);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [isSavingPosition, setIsSavingPosition] = useState(false);
  const [isDeletingPosition, setIsDeletingPosition] = useState<string | null>(null);
  const [isUpdatingApplication, setIsUpdatingApplication] = useState<string | null>(null);
  const [isArchivingApplication, setIsArchivingApplication] = useState<string | null>(null);
  const [isDeletingApplication, setIsDeletingApplication] = useState<string | null>(null);
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


  // Fetch applications when filters change

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

  // Load positions on mount (mount == tab open); applications follow the view.
  useEffect(() => {
    fetchPositions();
    if (positionView === 'applications') {
      fetchApplications(selectedPositionId || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch applications when filters change
  useEffect(() => {
    if (positionView === 'applications') {
      fetchApplications(selectedPositionId || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationStatusFilter, archiveStatusFilter, positionView, selectedPositionId]);

  return (
    <>
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
    </>
  );
};

export default CareersTab;
