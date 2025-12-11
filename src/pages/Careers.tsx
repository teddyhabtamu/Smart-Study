
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, MapPin, Clock, ArrowRight, Code, PenTool, MessageCircle, X, Loader2, CheckCircle, FileText } from 'lucide-react';
import Footer from '../components/Footer';
import { careersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const iconMap: { [key: string]: any } = {
  'Content': PenTool,
  'Engineering': Code,
  'Operations': MessageCircle,
  'default': Briefcase
};

const Careers: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState<any | null>(null);
  const [isApplicationOpen, setIsApplicationOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailPosition, setDetailPosition] = useState<any | null>(null);
  const [applicationForm, setApplicationForm] = useState({
    applicant_name: '',
    applicant_email: '',
    applicant_phone: '',
    cover_letter: '',
    resume_url: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchPositions();
  }, []);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const data = await careersAPI.getPositions();
      setPositions(data);
    } catch (error: any) {
      console.error('Failed to fetch positions:', error);
      addToast('Failed to load job positions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (position: any) => {
    setDetailPosition(position);
    setIsDetailOpen(true);
  };

  const handleApplyClick = (position: any) => {
    setSelectedPosition(position);
    setApplicationForm({
      applicant_name: user?.name || '',
      applicant_email: user?.email || '',
      applicant_phone: '',
      cover_letter: '',
      resume_url: ''
    });
    setIsApplicationOpen(true);
  };

  const handleApplyFromDetail = () => {
    if (detailPosition) {
      setIsDetailOpen(false);
      handleApplyClick(detailPosition);
    }
  };

  const handleApplicationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPosition) return;

    try {
      setIsSubmitting(true);
      await careersAPI.apply(selectedPosition.id, applicationForm);
      addToast('Application submitted successfully!', 'success');
      setIsApplicationOpen(false);
      setSelectedPosition(null);
      setApplicationForm({
        applicant_name: '',
        applicant_email: '',
        applicant_phone: '',
        cover_letter: '',
        resume_url: ''
      });
    } catch (error: any) {
      addToast(error.message || 'Failed to submit application', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 animate-fade-in max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-zinc-900 mb-4 sm:mb-6">Join our mission</h1>
          <p className="text-base sm:text-lg md:text-xl text-zinc-500 max-w-2xl mx-auto">
            Help us build the future of education in Ethiopia. We're looking for passionate individuals who want to make a real impact on high school students' lives.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 mb-12 sm:mb-16 md:mb-20">
           <div className="bg-zinc-50 p-4 sm:p-6 md:p-8 rounded-2xl border border-zinc-100">
              <h3 className="font-bold text-zinc-900 mb-3 text-base sm:text-lg">Impact at Scale</h3>
              <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">Your work will directly help thousands of students across Ethiopia succeed in their national exams.</p>
           </div>
           <div className="bg-zinc-50 p-4 sm:p-6 md:p-8 rounded-2xl border border-zinc-100">
              <h3 className="font-bold text-zinc-900 mb-3 text-base sm:text-lg">Remote-First Culture</h3>
              <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">We value output over hours. Work from anywhere in Ethiopia (or the world) with flexible schedules.</p>
           </div>
           <div className="bg-zinc-50 p-4 sm:p-6 md:p-8 rounded-2xl border border-zinc-100">
              <h3 className="font-bold text-zinc-900 mb-3 text-base sm:text-lg">Growth & Learning</h3>
              <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">We invest in our team. Get access to courses, books, and mentorship to grow your career.</p>
           </div>
        </div>

        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-6 sm:mb-8 flex items-center gap-2">
            <Briefcase className="text-zinc-600 w-5 h-5 sm:w-6 sm:h-6" /> Open Positions
          </h2>

          {loading ? (
            <div className="space-y-3 sm:space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-6 animate-pulse">
                  <div className="h-6 bg-zinc-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-zinc-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : positions.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-8 sm:p-12 text-center">
              <Briefcase size={48} className="mx-auto text-zinc-300 mb-4" />
              <p className="text-zinc-500 text-sm sm:text-base">No open positions at the moment. Check back soon!</p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {positions.map((position) => {
                const Icon = iconMap[position.department || ''] || iconMap.default;
                return (
                  <div key={position.id} className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-6 hover:border-zinc-300 hover:shadow-md transition-all group">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                      <div className="flex gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-500 group-hover:bg-zinc-900 group-hover:text-white transition-colors flex-shrink-0">
                          <Icon size={16} className="sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => handleViewDetails(position)}
                            className="text-left w-full"
                          >
                            <h3 className="font-bold text-base sm:text-lg text-zinc-900 group-hover:text-black transition-colors hover:text-zinc-700">{position.title}</h3>
                          </button>
                          <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-1 sm:gap-y-2 text-xs sm:text-sm text-zinc-500 mt-1 sm:mt-2">
                            {position.department && (
                              <span className="flex items-center gap-1">
                                <Briefcase size={12} className="sm:w-3.5 sm:h-3.5" /> {position.department}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock size={12} className="sm:w-3.5 sm:h-3.5" /> {position.employment_type}
                            </span>
                            {position.location && (
                              <span className="flex items-center gap-1">
                                <MapPin size={12} className="sm:w-3.5 sm:h-3.5" /> {position.location}
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-zinc-600 mt-2 line-clamp-2">{position.description}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewDetails(position)}
                          className="px-3 sm:px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg font-medium opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 sm:gap-2 text-xs sm:text-sm hover:bg-zinc-200"
                        >
                          <FileText size={14} className="sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">Details</span>
                        </button>
                        <button
                          onClick={() => handleApplyClick(position)}
                          className="px-4 sm:px-6 py-2 bg-zinc-900 text-white rounded-lg font-medium opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 sm:gap-2 text-sm sm:text-base w-fit"
                        >
                          Apply Now <ArrowRight size={14} className="sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-8 sm:mt-12 text-center bg-zinc-50 rounded-xl p-6 sm:p-8 border border-zinc-200">
             <p className="text-zinc-600 mb-4 text-sm sm:text-base">Don't see a role that fits? We're always looking for talent.</p>
             <a href="mailto:careers@smartstudy.com" className="text-zinc-900 font-bold hover:underline inline-flex items-center gap-2 text-sm sm:text-base">
               Email us your CV <ArrowRight size={12} className="sm:w-3.5 sm:h-3.5" />
             </a>
          </div>
        </div>
      </div>

      {/* Job Details Modal */}
      {isDetailOpen && detailPosition && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto relative animate-slide-up">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  {(() => {
                    const Icon = iconMap[detailPosition.department || ''] || iconMap.default;
                    return (
                      <div className="w-12 h-12 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-500">
                        <Icon size={20} />
                      </div>
                    );
                  })()}
                  <div>
                    <h3 className="font-bold text-xl text-zinc-900">{detailPosition.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-zinc-500 mt-1">
                      {detailPosition.department && (
                        <span className="flex items-center gap-1">
                          <Briefcase size={12} /> {detailPosition.department}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> {detailPosition.employment_type}
                      </span>
                      {detailPosition.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} /> {detailPosition.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsDetailOpen(false);
                    setDetailPosition(null);
                  }}
                  className="p-2 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Description */}
                <div>
                  <h4 className="font-semibold text-zinc-900 mb-2 text-sm">About the Role</h4>
                  <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">{detailPosition.description}</p>
                </div>

                {/* Requirements */}
                {detailPosition.requirements && (
                  <div>
                    <h4 className="font-semibold text-zinc-900 mb-2 text-sm">Requirements & Qualifications</h4>
                    <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-100">
                      <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap">{detailPosition.requirements}</p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDetailOpen(false);
                      setDetailPosition(null);
                    }}
                    className="flex-1 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleApplyFromDetail}
                    className="flex-1 px-4 py-2 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={16} />
                    Apply Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Application Modal */}
      {isApplicationOpen && selectedPosition && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative animate-slide-up">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-zinc-900">Apply for {selectedPosition.title}</h3>
                <button
                  onClick={() => {
                    setIsApplicationOpen(false);
                    setSelectedPosition(null);
                  }}
                  className="p-2 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleApplicationSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={applicationForm.applicant_name}
                    onChange={(e) => setApplicationForm({ ...applicationForm, applicant_name: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={applicationForm.applicant_email}
                    onChange={(e) => setApplicationForm({ ...applicationForm, applicant_email: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={applicationForm.applicant_phone}
                    onChange={(e) => setApplicationForm({ ...applicationForm, applicant_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Resume URL</label>
                  <input
                    type="url"
                    value={applicationForm.resume_url}
                    onChange={(e) => setApplicationForm({ ...applicationForm, resume_url: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500"
                    placeholder="https://..."
                  />
                  <p className="text-xs text-zinc-500 mt-1">Upload your resume to a file sharing service and paste the link here</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Cover Letter</label>
                  <textarea
                    value={applicationForm.cover_letter}
                    onChange={(e) => setApplicationForm({ ...applicationForm, cover_letter: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500"
                    rows={5}
                    placeholder="Tell us why you're interested in this position..."
                  />
                </div>
                <div className="flex gap-3 pt-4 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsApplicationOpen(false);
                      setSelectedPosition(null);
                    }}
                    className="flex-1 px-4 py-2 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} />
                        Submit Application
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      <Footer />
    </div>
  );
};

export default Careers;
