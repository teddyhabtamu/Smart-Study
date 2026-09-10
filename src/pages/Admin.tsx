
import React, { useState, useEffect } from 'react';

import { FileText, Shield, Users, MessageSquare, BarChart3, Briefcase, ScrollText } from 'lucide-react';
import { UserRole } from '../types';
import OverviewTab from './admin/OverviewTab';
import CommunityTab from './admin/CommunityTab';
import ContentTab from './admin/ContentTab';
import CareersTab from './admin/CareersTab';
import StudentsTab from './admin/StudentsTab';
import AuditTab from './admin/AuditTab';
import TeamTab from './admin/TeamTab';
import { PrivacyPolicyManager, TermsOfServiceManager, usePolicyDocuments } from './admin/PolicyManagers';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const Admin: React.FC = () => {
  const { fetchUsers, fetchDocuments, fetchVideos, fetchForumPosts } = useData();
  const { addToast } = useToast();
  const { user } = useAuth();
  const isModerator = user?.role === UserRole.MODERATOR || String(user?.role) === 'MODERATOR';
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'students' | 'community' | 'team' | 'audit' | 'careers' | 'privacy-policy' | 'terms-of-service'>(isModerator ? 'content' : 'overview');

  // Prevent moderators from accessing restricted tabs
  useEffect(() => {
    if (isModerator && activeTab !== 'content') {
      setActiveTab('content');
    }
  }, [isModerator, activeTab]);

  useEffect(() => {
    // Fetch initial data (fetch functions handle their own loading states)
    fetchDocuments();
    fetchVideos();

    // Only fetch these for admins, not moderators
    if (!isModerator) {
      fetchForumPosts();
      fetchUsers();
    }
  }, [fetchDocuments, fetchVideos, fetchForumPosts, fetchUsers, isModerator]);

  // Policy documents (privacy + terms) via shared hook
  const {
    privacyPolicy, privacyPolicyLoading, privacyPolicyRefreshTrigger, updatePrivacyPolicy,
    termsOfService, termsOfServiceLoading, termsOfServiceRefreshTrigger, updateTermsOfService,
  } = usePolicyDocuments(activeTab);


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
                  { id: 'privacy-policy', label: 'Privacy Policy', icon: Shield },
                  { id: 'terms-of-service', label: 'Terms of Service', icon: ScrollText },
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
      {activeTab === 'overview' && <OverviewTab />}

      {/* --- AUDIT LOG TAB (ADMIN ONLY) --- */}
      {activeTab === 'audit' && !isModerator && <AuditTab />}

      {/* --- CONTENT TAB --- */}
      {activeTab === 'content' && <ContentTab />}

      {/* --- STUDENTS TAB --- */}
      {activeTab === 'students' && <StudentsTab />}

      {/* --- COMMUNITY TAB --- */}
      {activeTab === 'community' && <CommunityTab />}

      {/* --- CAREERS TAB --- */}
      {activeTab === 'careers' && <CareersTab />}

      {/* --- TEAM TAB --- */}
      {activeTab === 'team' && <TeamTab />}


      {/* --- PRIVACY POLICY TAB --- */}
      {activeTab === 'privacy-policy' && (
        <PrivacyPolicyManager
          privacyPolicy={privacyPolicy}
          privacyPolicyLoading={privacyPolicyLoading}
          privacyPolicyRefreshTrigger={privacyPolicyRefreshTrigger}
          updatePrivacyPolicy={updatePrivacyPolicy}
          addToast={addToast}
        />
      )}

      {/* --- TERMS OF SERVICE TAB --- */}
      {activeTab === 'terms-of-service' && (
        <TermsOfServiceManager
          termsOfService={termsOfService}
          termsOfServiceLoading={termsOfServiceLoading}
          termsOfServiceRefreshTrigger={termsOfServiceRefreshTrigger}
          updateTermsOfService={updateTermsOfService}
          addToast={addToast}
        />
      )}

    </div>
  );
};

export default Admin;
