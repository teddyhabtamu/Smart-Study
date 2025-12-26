import React, { useState, useEffect } from 'react';
import { Shield, Mail, Calendar } from 'lucide-react';
import Footer from '../components/Footer';
import { careersAPI } from '../services/api';

const PrivacyPolicy: React.FC = () => {
  const [privacyPolicy, setPrivacyPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrivacyPolicy = async () => {
      try {
        const data = await careersAPI.getPrivacyPolicy();
        setPrivacyPolicy(data);
      } catch (error) {
        console.error('Failed to fetch privacy policy:', error);
        // Fallback to default content if API fails
        setPrivacyPolicy({
          content: `
Privacy Policy

Last updated: December 2025

Welcome to SmartStudy. Your privacy is important to us, and this Privacy Policy explains how we collect, use, protect, and handle your information when you use our platform.

1. Information We Collect

We may collect the following types of information:

Personal Information:
Name, email address, and account details when you sign up or log in.

Usage Information:
How you interact with the platform, such as pages visited, features used, and study activity.

Device & Technical Data:
Browser type, device type, IP address, and general location (non-precise).

User Content:
Study notes, questions, or inputs you provide while using SmartStudy.

2. How We Use Your Information

We use your information to:

• Provide and improve SmartStudy services
• Personalize learning experiences
• Enable AI-powered features
• Maintain platform security
• Communicate important updates or support responses

We do not sell or rent your personal data to third parties.

3. AI & Data Usage

SmartStudy uses AI technologies to assist learning. User inputs may be processed to generate helpful responses, summaries, or recommendations.

• Your data is used only to improve your learning experience
• We do not use your private data to train public AI models without consent

4. Cookies and Tracking Technologies

We may use cookies and similar technologies to:

• Keep you logged in
• Improve performance and usability
• Understand platform usage

You can control cookies through your browser settings.

5. Data Security

We take reasonable technical and organizational measures to protect your data from unauthorized access, loss, or misuse. However, no system is 100% secure, and we cannot guarantee absolute security.

6. Third-Party Services

SmartStudy may use trusted third-party services (such as hosting, analytics, or authentication providers) to operate the platform. These services are required to protect your data and use it only for intended purposes.

7. Children's Privacy

SmartStudy is designed for students. We do not knowingly collect personal data from children without appropriate consent where required. If you believe a child's data has been collected improperly, please contact us.

8. Your Rights

You have the right to:

• Access your personal data
• Request correction or deletion of your data
• Control account settings and privacy preferences

You can do this by contacting us or through your account settings.

9. Changes to This Policy

We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated date.

10. Contact Us

If you have any questions or concerns about this Privacy Policy, please contact us:

Email: smartstudy.ethio@gmail.com
Platform: SmartStudy
          `,
          lastUpdated: 'December 2025'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPrivacyPolicy();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 animate-fade-in pb-12">
        {/* Hero */}
        <div className="bg-zinc-900 text-white py-8 sm:py-12 px-4 sm:px-6 rounded-b-2xl sm:rounded-b-3xl mb-8 sm:mb-12">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium mb-4 sm:mb-6">
              <Shield size={14} className="sm:w-4 sm:h-4" /> Privacy Policy
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 tracking-tight">
              Your Privacy Matters to Us
            </h1>
            <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              Learn how SmartStudy protects your data and respects your privacy while helping you learn.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-zinc-400">
              <Calendar size={16} />
              Last updated: {privacyPolicy?.lastUpdated}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 sm:p-8 md:p-12">
            <div className="prose prose-zinc max-w-none">
              <div className="whitespace-pre-line text-sm sm:text-base leading-relaxed text-zinc-700">
                {privacyPolicy?.content}
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div className="mt-8 sm:mt-12 bg-zinc-50 rounded-2xl p-6 sm:p-8 text-center">
            <h3 className="text-lg sm:text-xl font-bold text-zinc-900 mb-4">Questions about your privacy?</h3>
            <p className="text-zinc-600 mb-6 text-sm sm:text-base">
              If you have any questions or concerns about this Privacy Policy or how we handle your data, please don't hesitate to contact us.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="flex items-center gap-2 text-zinc-600">
                <Mail size={16} />
                <span className="text-sm">smartstudy.ethio@gmail.com</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
