import React, { useState, useEffect } from 'react';
import { FileText, Mail, Calendar } from 'lucide-react';

// Helper function to render text with line breaks
const renderTextWithLineBreaks = (text: string) => {
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
import Footer from '../components/Footer';
import { careersAPI } from '../services/api';

const TermsOfService: React.FC = () => {
  const [termsOfService, setTermsOfService] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTermsOfService = async () => {
      try {
        const data = await careersAPI.getTermsOfService();
        setTermsOfService(data);
      } catch (error) {
        console.error('Failed to fetch terms of service:', error);
        // Fallback to default content if API fails
        setTermsOfService({
          content: `<h2>Terms of Service</h2><p><em>Last updated: December 2025</em></p><p>Welcome to SmartStudy. By accessing or using our platform, you agree to be bound by these Terms of Service. Please read them carefully.</p><h3>1. Acceptance of Terms</h3><p>By creating an account, accessing, or using SmartStudy, you agree to comply with and be legally bound by these Terms. If you do not agree, please do not use the platform.</p><h3>2. Description of Service</h3><p>SmartStudy is an educational platform designed to help students learn more effectively through structured content, study tools, and AI-powered assistance.</p><p>We may update, improve, or modify features at any time to enhance user experience.</p><h3>3. User Accounts</h3><ul><li>You are responsible for maintaining the confidentiality of your account credentials</li><li>You agree to provide accurate and complete information</li><li>You are responsible for all activities that occur under your account</li><li>SmartStudy reserves the right to suspend or terminate accounts that violate these Terms.</li></ul><h3>4. Acceptable Use</h3><p>You agree not to:</p><ul><li>Use the platform for unlawful or harmful purposes</li><li>Attempt to hack, disrupt, or misuse the system</li><li>Upload malicious code or harmful content</li><li>Impersonate others or provide false information</li><li>SmartStudy is intended for educational use only.</li></ul><h3>5. User Content</h3><p>You may submit content such as questions, notes, or study materials.</p><p>By submitting content:</p><ul><li>You retain ownership of your content</li><li>You grant SmartStudy permission to use it only to provide and improve services</li><li>You agree not to upload content that is illegal, offensive, or violates others' rights</li></ul><h3>6. AI Features Disclaimer</h3><p>SmartStudy uses AI to assist learning. While we strive for accuracy:</p><ul><li>AI-generated content is for educational support only</li><li>It should not be considered professional, academic, or legal advice</li><li>Users should verify important information independently</li></ul><h3>7. Intellectual Property</h3><p>All platform content, branding, logos, design, and software belong to SmartStudy unless otherwise stated.</p><p>You may not copy, distribute, or reproduce any part of the platform without permission.</p><h3>8. Third-Party Services</h3><p>SmartStudy may integrate third-party tools or services. We are not responsible for the content or practices of third-party platforms.</p><h3>9. Termination</h3><p>We reserve the right to suspend or terminate access to SmartStudy at any time if these Terms are violated or if misuse is detected.</p><p>Users may stop using the platform at any time.</p><h3>10. Limitation of Liability</h3><p>SmartStudy is provided on an "as-is" basis. We are not liable for:</p><ul><li>Data loss</li><li>Academic outcomes</li><li>Service interruptions</li><li>Errors or inaccuracies in content</li><li>Use of the platform is at your own risk.</li></ul><h3>11. Changes to These Terms</h3><p>We may update these Terms from time to time. Continued use of SmartStudy after changes means you accept the updated Terms.</p><h3>12. Governing Law</h3><p>These Terms are governed by applicable laws. Any disputes will be handled under relevant legal jurisdictions.</p><h3>13. Contact Us</h3><p>If you have questions about these Terms of Service, please contact us:</p><p><strong>Email:</strong> smartstudy.ethio@gmail.com<br><strong>Platform:</strong> SmartStudy</p>`,
          lastUpdated: 'December 2025'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTermsOfService();
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
              <FileText size={14} className="sm:w-4 sm:h-4" /> Terms of Service
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 tracking-tight">
              Terms of Service
            </h1>
            <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              Please read these terms carefully before using SmartStudy. By using our platform, you agree to these terms.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-zinc-400">
              <Calendar size={16} />
              Last updated: {termsOfService?.lastUpdated}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 sm:p-8 md:p-12">
            <div className="prose prose-zinc max-w-none">
              <div className="text-sm sm:text-base leading-relaxed">
                {renderTextWithLineBreaks(termsOfService?.content) || 'Loading terms of service...'}
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="mt-8 bg-zinc-50 rounded-xl p-6 border border-zinc-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <Mail className="w-6 h-6 text-zinc-600 mt-1" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900 mb-2">Questions about these Terms?</h3>
                <p className="text-sm text-zinc-600 mb-3">
                  If you have any questions about these Terms of Service, please contact us.
                </p>
                <div className="text-sm text-zinc-500">
                  <p><strong>Email:</strong> smartstudy.ethio@gmail.com</p>
                  <p><strong>Platform:</strong> SmartStudy</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default TermsOfService;
