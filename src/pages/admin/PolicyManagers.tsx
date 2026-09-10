import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, X, Edit2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { careersAPI } from '../../services/api';

// Shared data hook for both policy documents (extracted from Admin.tsx).
// Takes the active admin tab so documents load lazily on open + refresh.
export const usePolicyDocuments = (activeTab: string) => {
  const { addToast } = useToast();

  const [privacyPolicy, setPrivacyPolicy] = useState<{ content: string; lastUpdated: string }>({
    content: '',
    lastUpdated: ''
  });
  const [privacyPolicyLoading, setPrivacyPolicyLoading] = useState(false);
  const [isUpdatingPrivacyPolicy, setIsUpdatingPrivacyPolicy] = useState(false);
  const [privacyPolicyRefreshTrigger, setPrivacyPolicyRefreshTrigger] = useState(0);

  const [termsOfService, setTermsOfService] = useState<{ content: string; lastUpdated: string }>({
    content: '',
    lastUpdated: ''
  });
  const [termsOfServiceLoading, setTermsOfServiceLoading] = useState(false);
  const [isUpdatingTermsOfService, setIsUpdatingTermsOfService] = useState(false);
  const [termsOfServiceRefreshTrigger, setTermsOfServiceRefreshTrigger] = useState(0);

  const updatePrivacyPolicy = async (content: string, lastUpdated?: string) => {
    try {
      setIsUpdatingPrivacyPolicy(true);
      await careersAPI.admin.updatePrivacyPolicy({ content, lastUpdated });
      addToast('Privacy policy updated successfully', 'success');
      setPrivacyPolicyRefreshTrigger(prev => prev + 1);
    } catch (error: any) {
      console.error('Failed to update privacy policy:', error);
      addToast(error.message || 'Failed to update privacy policy', 'error');
    } finally {
      setIsUpdatingPrivacyPolicy(false);
    }
  };

  const fetchPrivacyPolicy = useCallback(async () => {
    try {
      setPrivacyPolicyLoading(true);
      const data = await careersAPI.admin.getPrivacyPolicy();
      setPrivacyPolicy(data);
    } catch (error: any) {
      console.error('Failed to fetch privacy policy:', error);
      addToast('Failed to load privacy policy', 'error');
    } finally {
      setPrivacyPolicyLoading(false);
    }
  }, [addToast]);

  const updateTermsOfService = async (content: string, lastUpdated?: string) => {
    try {
      setIsUpdatingTermsOfService(true);
      await careersAPI.admin.updateTermsOfService({ content, lastUpdated });
      addToast('Terms of service updated successfully', 'success');
      setTermsOfServiceRefreshTrigger(prev => prev + 1);
    } catch (error: any) {
      console.error('Failed to update terms of service:', error);
      addToast(error.message || 'Failed to update terms of service', 'error');
    } finally {
      setIsUpdatingTermsOfService(false);
    }
  };

  const fetchTermsOfService = useCallback(async () => {
    try {
      setTermsOfServiceLoading(true);
      const data = await careersAPI.admin.getTermsOfService();
      setTermsOfService(data);
    } catch (error: any) {
      console.error('Failed to fetch terms of service:', error);
      addToast('Failed to load terms of service', 'error');
    } finally {
      setTermsOfServiceLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (activeTab === 'privacy-policy') {
      fetchPrivacyPolicy();
    }
  }, [activeTab, privacyPolicyRefreshTrigger, fetchPrivacyPolicy]);

  useEffect(() => {
    if (activeTab === 'terms-of-service') {
      fetchTermsOfService();
    }
  }, [activeTab, termsOfServiceRefreshTrigger, fetchTermsOfService]);

  return {
    privacyPolicy, privacyPolicyLoading, privacyPolicyRefreshTrigger, updatePrivacyPolicy,
    termsOfService, termsOfServiceLoading, termsOfServiceRefreshTrigger, updateTermsOfService,
  };
};

// Policy content managers (extracted from Admin.tsx).
export const renderTextWithLineBreaks = (text: string) => {
  if (!text) return null;

  // Handle both actual newlines and escaped \n characters
  const processedText = text.replace(/\\n/g, '\n');
  return processedText.split('\n').map((line: string, index: number) => (
    <React.Fragment key={index}>
      {line}
      {index < processedText.split('\n').length - 1 && <br />}
    </React.Fragment>
  ));
};


// Privacy Policy Manager Component
interface PrivacyPolicyManagerProps {
  privacyPolicy: {
    content: string;
    lastUpdated: string;
  };
  privacyPolicyLoading: boolean;
  privacyPolicyRefreshTrigger: number;
  updatePrivacyPolicy: (content: string, lastUpdated?: string) => Promise<void>;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const PrivacyPolicyManager: React.FC<PrivacyPolicyManagerProps> = ({
  privacyPolicy,
  privacyPolicyLoading,
  privacyPolicyRefreshTrigger,
  updatePrivacyPolicy,
  addToast
}) => {
  const [editingContent, setEditingContent] = useState('');
  const [editingLastUpdated, setEditingLastUpdated] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Note: Data fetching is now handled in the parent component

  const handleStartEdit = () => {
    // Convert escaped newlines to actual newlines for proper editing
    const processedContent = privacyPolicy.content.replace(/\\n/g, '\n');
    setEditingContent(processedContent);
    setEditingLastUpdated(privacyPolicy.lastUpdated);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editingContent.trim()) {
      addToast('Privacy policy content cannot be empty', 'error');
      return;
    }
    await updatePrivacyPolicy(editingContent, editingLastUpdated || undefined);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingContent('');
    setEditingLastUpdated('');
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-zinc-900">Privacy Policy Management</h2>
            <p className="text-sm text-zinc-500 mt-1">Update the privacy policy that users see on the website</p>
          </div>
          {!isEditing && (
            <button
              onClick={handleStartEdit}
              className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Policy
            </button>
          )}
        </div>

        {privacyPolicyLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <>
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-2">Privacy Policy Content</label>
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    className="w-full h-96 p-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 resize-vertical"
                    placeholder="Enter privacy policy content..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-2">Last Updated (optional)</label>
                  <input
                    type="text"
                    value={editingLastUpdated}
                    onChange={(e) => setEditingLastUpdated(e.target.value)}
                    className="w-full p-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500"
                    placeholder="e.g., December 2025"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 bg-zinc-500 text-white text-sm font-medium rounded-lg hover:bg-zinc-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
                  <div>
                    <strong>Last Updated:</strong> {privacyPolicy.lastUpdated || 'Not set'}
                  </div>
                </div>
                <div className="border border-zinc-200 rounded-lg">
                  <div className="p-4 bg-zinc-50 border-b border-zinc-200">
                    <h3 className="font-semibold text-zinc-900">Preview</h3>
                  </div>
                  <div className="p-4 max-h-96 overflow-y-auto">
                    <div className="prose prose-zinc max-w-none">
                      <div className="text-sm leading-relaxed text-zinc-700">
                        {renderTextWithLineBreaks(privacyPolicy.content) || 'No privacy policy content set.'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Terms of Service Manager Component
interface TermsOfServiceManagerProps {
  termsOfService: {
    content: string;
    lastUpdated: string;
  };
  termsOfServiceLoading: boolean;
  termsOfServiceRefreshTrigger: number;
  updateTermsOfService: (content: string, lastUpdated?: string) => Promise<void>;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const TermsOfServiceManager: React.FC<TermsOfServiceManagerProps> = ({
  termsOfService,
  termsOfServiceLoading,
  termsOfServiceRefreshTrigger,
  updateTermsOfService,
  addToast
}) => {
  const [editingContent, setEditingContent] = useState('');
  const [editingLastUpdated, setEditingLastUpdated] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Note: Data fetching is now handled in the parent component

  const handleStartEdit = () => {
    // Convert escaped newlines to actual newlines for proper editing
    const processedContent = termsOfService.content.replace(/\\n/g, '\n');
    setEditingContent(processedContent);
    setEditingLastUpdated(termsOfService.lastUpdated);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editingContent.trim()) {
      addToast('Terms of service content cannot be empty', 'error');
      return;
    }
    await updateTermsOfService(editingContent, editingLastUpdated || undefined);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingContent('');
    setEditingLastUpdated('');
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-zinc-900">Terms of Service Management</h2>
            <p className="text-sm text-zinc-500 mt-1">Update the terms of service that users see on the website</p>
          </div>
          {!isEditing && (
            <button
              onClick={handleStartEdit}
              className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Terms
            </button>
          )}
        </div>

        {termsOfServiceLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <>
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-2">Terms of Service Content</label>
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    className="w-full h-96 p-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500 resize-vertical"
                    placeholder="Enter terms of service content..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-zinc-700 mb-2">Last Updated (optional)</label>
                  <input
                    type="text"
                    value={editingLastUpdated}
                    onChange={(e) => setEditingLastUpdated(e.target.value)}
                    className="w-full p-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-500 focus:border-zinc-500"
                    placeholder="e.g., December 2025"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 bg-zinc-500 text-white text-sm font-medium rounded-lg hover:bg-zinc-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
                  <div>
                    <strong>Last Updated:</strong> {termsOfService.lastUpdated || 'Not set'}
                  </div>
                </div>
                <div className="border border-zinc-200 rounded-lg">
                  <div className="p-4 bg-zinc-50 border-b border-zinc-200">
                    <h3 className="font-semibold text-zinc-900">Preview</h3>
                  </div>
                  <div className="p-4 max-h-96 overflow-y-auto">
                    <div className="prose prose-zinc max-w-none">
                      <div className="text-sm leading-relaxed text-zinc-700">
                        {renderTextWithLineBreaks(termsOfService.content) || 'No terms of service content set.'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
