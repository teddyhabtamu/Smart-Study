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

                let updated = false;

                // Check Privacy Policy
                if (versions.privacyPolicyUpdated) {
                    if (!lastSeenPrivacy || new Date(versions.privacyPolicyUpdated) > new Date(lastSeenPrivacy)) {
                        addToast('Our Privacy Policy has been updated. Please review the changes.', 'info');
                        localStorage.setItem('last_seen_privacy_policy', versions.privacyPolicyUpdated);
                        updated = true;
                    }
                }

                // Check Terms of Service
                if (versions.termsOfServiceUpdated) {
                    if (!lastSeenTerms || new Date(versions.termsOfServiceUpdated) > new Date(lastSeenTerms)) {
                        // If both updated, show two separate toasts or a combined one. 
                        // Separate toasts are clearer in the existing ToastContext.
                        addToast('Our Terms of Service have been updated. Please review the changes.', 'info');
                        localStorage.setItem('last_seen_terms_of_service', versions.termsOfServiceUpdated);
                        updated = true;
                    }
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
