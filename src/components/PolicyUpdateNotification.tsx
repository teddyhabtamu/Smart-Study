import React, { useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { authAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

const PolicyUpdateNotification: React.FC = () => {
    const { addToast } = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        const checkPolicyVersions = async () => {
            try {
                const versions = await authAPI.getPolicyVersions();

                const lastSeenPrivacy = localStorage.getItem('last_seen_privacy_policy');
                const lastSeenTerms = localStorage.getItem('last_seen_terms_of_service');

                // One combined banner when both changed: two stacked toasts
                // cover the whole auth heading on phones for 3 seconds.
                const privacyNew = versions.privacyPolicyUpdated &&
                    (!lastSeenPrivacy || new Date(versions.privacyPolicyUpdated) > new Date(lastSeenPrivacy));
                const termsNew = versions.termsOfServiceUpdated &&
                    (!lastSeenTerms || new Date(versions.termsOfServiceUpdated) > new Date(lastSeenTerms));

                if (privacyNew && termsNew) {
                    addToast('Our Privacy Policy and Terms of Service have been updated. Please review the changes.', 'info');
                    localStorage.setItem('last_seen_privacy_policy', versions.privacyPolicyUpdated);
                    localStorage.setItem('last_seen_terms_of_service', versions.termsOfServiceUpdated);
                } else if (privacyNew) {
                    addToast('Our Privacy Policy has been updated. Please review the changes.', 'info');
                    localStorage.setItem('last_seen_privacy_policy', versions.privacyPolicyUpdated);
                } else if (termsNew) {
                    addToast('Our Terms of Service have been updated. Please review the changes.', 'info');
                    localStorage.setItem('last_seen_terms_of_service', versions.termsOfServiceUpdated);
                }

                // Optional: If any were updated, we could provide a button in the toast.
                // Current ToastContext only supports message and type. 
                // We could enhance it later if needed.
            } catch (error) {
                console.error('Failed to check policy versions:', error);
            }
        };

        // Check on mount (app load)
        checkPolicyVersions();

        // Optional: Periodically check every 30 minutes if the app is left open
        const interval = setInterval(checkPolicyVersions, 30 * 60 * 1000);

        return () => clearInterval(interval);
    }, [addToast]);

    return null; // This component doesn't render anything itself
};

export default PolicyUpdateNotification;
