import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Brain, Users, PlayCircle, CheckCircle2, Star, HelpCircle, FileText, Briefcase } from 'lucide-react';
import Footer from '../components/Footer';
import OnboardingTour from '../components/OnboardingTour';
import { useSEO, pageSEO } from '../utils/seoUtils';
import { careersAPI } from '../services/api';

const Landing: React.FC = () => {
  const { updateSEO } = useSEO();

  useEffect(() => {
    updateSEO(pageSEO.home);
  }, [updateSEO]);

  // Open roles for the hiring promo. Null = not loaded or fetch failed, and
  // the promo simply doesn't render — a careers fetch must never break or
  // delay the landing page.
  const [openRoles, setOpenRoles] = useState<any[] | null>(null);
  // First-run tour dialog (guests open it manually — no auto-popup on a
  // marketing page).
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    careersAPI.getPositions()
      .then((roles) => { if (!cancelled) setOpenRoles(Array.isArray(roles) ? roles : []); })
      .catch(() => { if (!cancelled) setOpenRoles(null); });
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="flex flex-col min-h-screen bg-surface selection:bg-zinc-900 selection:text-onink">
      
      {/* Hero Section with Grid Background */}
      <section className="relative pt-16 sm:pt-20 md:pt-24 pb-20 sm:pb-24 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 z-0">
          {/* Theme-aware grid + fade: hardcoded #f4f4f5/white drew a bright
              wash over dark themes. Vars resolve identically in Ivory. */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(var(--zinc-100))_1px,transparent_1px),linear-gradient(to_bottom,rgb(var(--zinc-100))_1px,transparent_1px)] bg-[size:4rem_4rem] md:bg-[size:4rem_4rem] bg-[size:2rem_2rem]"></div>
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-surface to-transparent"></div>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-surface border border-zinc-200 shadow-sm mb-6 sm:mb-8 animate-fade-in">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="text-xs sm:text-sm font-medium text-inksoft">Aligned with the Ethiopian Curriculum</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tighter text-ink mb-6 sm:mb-8 animate-slide-up leading-[0.9]">
            Learn faster.<br />
            <span className="text-zinc-400">Study smarter.</span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-zinc-500 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed font-light animate-slide-up px-2" style={{ animationDelay: '0.1s' }}>
            The all-in-one digital learning platform for Ethiopian high school students.
            Powered by advanced AI, curated content, and community.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 animate-slide-up px-4" style={{ animationDelay: '0.2s' }}>
            <Link to="/register" className="group h-11 sm:h-12 px-6 sm:px-8 bg-zinc-900 text-onink rounded-full font-medium hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-zinc-900/20 hover:shadow-2xl hover:shadow-zinc-900/30 hover:-translate-y-0.5 text-sm sm:text-base">
              Start Learning Free <ArrowRight size={16} className="sm:w-[18px] sm:h-[18px] group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/library" className="h-11 sm:h-12 px-6 sm:px-8 bg-surface text-ink border border-zinc-200 rounded-full font-medium hover:bg-zinc-50 transition-all flex items-center justify-center hover:border-zinc-300 text-sm sm:text-base">
              Browse Library
            </Link>
          </div>

          <div className="mt-4 animate-slide-up" style={{ animationDelay: '0.25s' }}>
            <button
              onClick={() => setTourOpen(true)}
              className="text-sm font-medium text-zinc-500 hover:text-ink underline underline-offset-4 decoration-zinc-300 hover:decoration-ink transition-colors"
            >
              New here? Take a 1-minute tour
            </button>
          </div>

          {/* Hiring pill — the careers page is footer-only, so open roles
              would otherwise be invisible. Shown only when roles exist;
              nothing renders while loading or on fetch failure. */}
          {openRoles && openRoles.length > 0 && (
            <div className="mt-6 animate-slide-up" style={{ animationDelay: '0.3s' }}>
              <Link
                to="/careers"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 text-onink text-xs sm:text-sm font-medium shadow-lg shadow-zinc-900/20 hover:bg-zinc-700 transition-all hover:-translate-y-0.5"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                </span>
                We&apos;re hiring — {openRoles.length} open role{openRoles.length === 1 ? '' : 's'}
                <ArrowRight size={14} />
              </Link>
            </div>
          )}

          {/* Abstract Floating UI Elements for decoration - Hidden on mobile */}
          <div className="absolute top-1/2 left-4 sm:left-10 -translate-y-1/2 hidden lg:block opacity-50 animate-pulse delay-700">
             <div className="bg-surface p-3 sm:p-4 rounded-2xl border border-zinc-200 shadow-lg rotate-[-6deg] w-36 sm:w-48">
                <div className="flex gap-3 items-center mb-2">
                   <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600"><CheckCircle2 size={12} className="sm:w-4 sm:h-4" /></div>
                   <div className="h-2 w-16 sm:w-20 bg-zinc-100 rounded"></div>
                </div>
                <div className="space-y-2">
                   <div className="h-2 w-full bg-zinc-50 rounded"></div>
                   <div className="h-2 w-3/4 bg-zinc-50 rounded"></div>
                </div>
             </div>
          </div>

          <div className="absolute top-1/3 right-4 sm:right-10 hidden lg:block opacity-50 animate-bounce delay-1000 duration-[3000ms]">
             <div className="bg-zinc-900 p-3 sm:p-4 rounded-2xl shadow-xl rotate-[6deg] w-36 sm:w-48 text-onink">
                <div className="flex gap-3 items-center mb-3">
                   <Brain size={18} className="sm:w-5 sm:h-5 text-zinc-400"/>
                   <span className="text-xs font-bold text-zinc-300">AI Tutor</span>
                </div>
                <div className="text-xs text-zinc-400">Solving complex physics problems...</div>
             </div>
          </div>
        </div>
      </section>

      {/* Stats / Line Separator — every number below is real (see DB):
          809 videos / 15 subjects / grades 9-12. No vanity multipliers. */}
      <div className="border-y border-zinc-100 bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {[
              { label: "Video Lessons", value: "800+" },
              { label: "Subjects", value: "15" },
              { label: "Grades Covered", value: "9–12" },
              { label: "Free to Start", value: "100%" },
            ].map((stat, i) => (
              <div key={i} className="text-center md:text-left">
                <div className="text-2xl sm:text-3xl font-bold text-ink tracking-tight mb-1">{stat.value}</div>
                <div className="text-xs sm:text-sm text-zinc-500 font-medium uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modern Bento Grid Features */}
      <section className="py-20 sm:py-24 md:py-32 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 sm:mb-16 md:mb-20 max-w-2xl">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-ink tracking-tight mb-4 sm:mb-6">Everything you need to excel.</h2>
            <p className="text-base sm:text-lg text-zinc-500 font-light">
              We've redesigned the study experience to focus on clarity, speed, and comprehension.
              No clutter, just learning.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 grid-rows-[auto_auto]">
            
            {/* AI Card - Large */}
            <div className="md:col-span-2 lg:col-span-2 lg:row-span-2 bg-zinc-950 rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-12 text-onink relative overflow-hidden group border border-zinc-800">
               <div className="absolute top-0 right-0 w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] bg-indigo-500/20 rounded-full blur-[100px] -mr-10 sm:-mr-20 -mt-10 sm:-mt-20"></div>
               <div className="relative z-10 flex flex-col h-full justify-between">
                  <div>
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-surface/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 sm:mb-8 border border-white/10 group-hover:bg-surface/20 transition-colors">
                       <Brain size={24} className="sm:w-7 sm:h-7" />
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">AI Personal Tutor</h3>
                    <p className="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-md">
                       Stuck on a problem? Get instant, step-by-step explanations for math, physics, and chemistry questions. Powered by Gemini.
                    </p>
                  </div>
                  <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10 flex items-center gap-4">
                     <Link to="/ai-tutor" className="text-onink font-semibold flex items-center gap-2 hover:gap-4 transition-all text-sm sm:text-base">
                        Start Chatting <ArrowRight size={16} className="sm:w-[18px] sm:h-[18px]" />
                     </Link>
                  </div>
               </div>
            </div>

            {/* Library Card */}
            <Link to="/library" className="bg-zinc-50 rounded-2xl md:rounded-3xl p-6 sm:p-8 border border-zinc-200 hover:border-zinc-300 transition-colors group block">
               <BookOpen size={28} className="sm:w-8 sm:h-8 text-ink mb-4 sm:mb-6" />
               <h3 className="text-lg sm:text-xl font-bold text-ink mb-2">Digital Library</h3>
               <p className="text-zinc-500 mb-4 sm:mb-6 text-sm sm:text-base">Textbooks and exam papers for every grade.</p>
               <div className="flex -space-x-2">
                  {[1,2,3].map(i => (
                     <div key={i} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-200 border-2 border-white"></div>
                  ))}
               </div>
            </Link>

            {/* Video Card */}
            <Link to="/videos" className="bg-zinc-50 rounded-2xl md:rounded-3xl p-6 sm:p-8 border border-zinc-200 hover:border-zinc-300 transition-colors group block">
               <PlayCircle size={28} className="sm:w-8 sm:h-8 text-ink mb-4 sm:mb-6" />
               <h3 className="text-lg sm:text-xl font-bold text-ink mb-2">Video Classroom</h3>
               <p className="text-zinc-500 text-sm sm:text-base">Curated video lessons organized by subject and grade.</p>
            </Link>

            {/* Past Exams Card */}
            <Link to="/past-exams" className="bg-zinc-50 rounded-2xl md:rounded-3xl p-6 sm:p-8 border border-zinc-200 hover:border-zinc-300 transition-colors group block">
               <FileText size={28} className="sm:w-8 sm:h-8 text-ink mb-4 sm:mb-6" />
               <h3 className="text-lg sm:text-xl font-bold text-ink mb-2">Past Exams</h3>
               <p className="text-zinc-500 text-sm sm:text-base">Practice with previous national exam papers.</p>
            </Link>

            {/* Community/Wide Card */}
            <div className="md:col-span-3 bg-surface rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-12 border border-zinc-200 hover:border-zinc-300 transition-colors flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8 group">
               <div className="max-w-xl text-center md:text-left">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4 text-emerald-600 font-medium text-xs sm:text-sm bg-emerald-50 w-fit px-3 py-1 rounded-full mx-auto md:mx-0">
                     <Users size={14} className="sm:w-4 sm:h-4" /> Community First
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-ink mb-3 sm:mb-4">Study Groups & Forums</h3>
                  <p className="text-zinc-500 text-base sm:text-lg">
                     Join students across Ethiopia discussing tough topics, sharing notes, and preparing for national exams together.
                  </p>
               </div>
               <div className="flex-shrink-0 w-full md:w-auto">
                  <Link to="/register" className="h-11 sm:h-12 px-6 sm:px-8 bg-zinc-100 text-ink rounded-full font-medium hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 w-full md:w-auto text-sm sm:text-base">
                     Join Community
                  </Link>
               </div>
            </div>

          </div>
        </div>
      </section>

      {/* Why SmartStudy — real product capabilities, not invented quotes */}
      <section className="py-16 sm:py-20 bg-zinc-50 border-y border-zinc-200">
         <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-10 sm:mb-16">
               <h2 className="text-2xl sm:text-3xl font-bold text-ink mb-3 sm:mb-4">Why Students Choose SmartStudy</h2>
               <p className="text-zinc-500 text-sm sm:text-base">Everything below is in the product today.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
               {[
                 {
                   title: "AI Tutor That Explains",
                   text: "Step-by-step help in math, physics, chemistry and more — tuned to your grade level, with voice and image questions.",
                 },
                 {
                   title: "Practice That Adapts",
                   text: "AI-generated quizzes with instant answers and explanations, plus XP and levels that keep you going.",
                 },
                 {
                   title: "Community Answers",
                   text: "Ask questions, get peer answers, and mark solutions — with past national exam papers to drill on.",
                 },
               ].map((t, i) => (
                 <div key={i} className="bg-surface p-6 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all">
                    <div className="flex gap-1 mb-4">
                       {[1,2,3,4,5].map(star => <Star key={star} size={12} className="sm:w-[14px] sm:h-[14px] fill-amber-400 text-amber-400" />)}
                    </div>
                    <p className="font-bold text-sm text-ink mb-2">{t.title}</p>
                    <p className="text-inksoft leading-relaxed text-sm sm:text-base">{t.text}</p>
                 </div>
               ))}
            </div>
         </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-20 px-4 sm:px-6">
         <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10 sm:mb-16">
               <h2 className="text-2xl sm:text-3xl font-bold text-ink mb-3 sm:mb-4">Common Questions</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
               {[
                 { q: "Is SmartStudy free?", a: "Yes! Creating an account is free and gives you access to the library and community. The optional Pro plan unlocks premium library and videos, unlimited quizzes, and the AI study planner." },
                 { q: "What grades do you cover?", a: "We currently focus on High School education (Grades 9-12) following the new Ethiopian curriculum." },
                 { q: "Can I use it offline?", a: "You can install SmartStudy on your phone from the browser, and your saved snapshots stay available offline. The web version needs an internet connection for AI features." },
                 { q: "Is the content verified?", a: "Our library is organized around the Ethiopian high-school curriculum (Grades 9-12). Always cross-check critical exam facts with your textbooks." }
               ].map((item, i) => (
                 <div key={i} className="p-5 sm:p-6 rounded-2xl border border-zinc-200 hover:border-zinc-300 transition-colors">
                    <h3 className="font-bold text-ink mb-2 flex items-start gap-2 text-sm sm:text-base">
                       <HelpCircle size={16} className="sm:w-[18px] sm:h-[18px] text-zinc-400 mt-0.5 flex-shrink-0" />
                       {item.q}
                    </h3>
                    <p className="text-sm text-zinc-500 pl-6 sm:pl-7 leading-relaxed">{item.a}</p>
                 </div>
               ))}
            </div>
         </div>
      </section>

      {/* Open roles — mirrors the careers page so hiring is discoverable
          from the main page, not just the footer link. Renders only when
          roles are actually open. */}
      {openRoles && openRoles.length > 0 && (
        <section className="py-16 sm:py-20 px-4 sm:px-6 bg-zinc-50 border-y border-zinc-200">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 sm:mb-10">
              <div className="inline-flex items-center gap-2 mb-3 sm:mb-4 text-emerald-700 font-medium text-xs sm:text-sm bg-emerald-50 border border-emerald-200 w-fit px-3 py-1 rounded-full mx-auto">
                <Briefcase size={14} className="sm:w-4 sm:h-4" /> Join our mission
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-ink mb-3 sm:mb-4">Help build the future of learning in Ethiopia</h2>
              <p className="text-zinc-500 text-sm sm:text-base">We&apos;re looking for passionate people — here&apos;s what&apos;s open right now.</p>
            </div>
            <div className="space-y-3">
              {openRoles.slice(0, 3).map((role: any) => (
                <Link
                  key={role.id}
                  to="/careers"
                  className="group flex items-center gap-3 sm:gap-4 bg-surface p-4 sm:p-5 rounded-2xl border border-zinc-200 hover:border-zinc-400 hover:shadow-md transition-all"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-900 text-onink rounded-xl flex items-center justify-center flex-shrink-0">
                    <Briefcase size={18} className="sm:w-5 sm:h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-ink text-sm sm:text-base truncate">{role.title}</h3>
                    <p className="text-xs sm:text-sm text-zinc-500 truncate">
                      {[role.department, role.employment_type, role.location].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ArrowRight size={16} className="text-zinc-400 group-hover:text-ink group-hover:translate-x-1 transition-all flex-shrink-0" />
                </Link>
              ))}
            </div>
            <div className="text-center mt-6 sm:mt-8">
              <Link to="/careers" className="inline-flex items-center justify-center h-11 sm:h-12 px-6 sm:px-8 bg-zinc-900 text-onink rounded-full text-sm sm:text-base font-medium hover:bg-zinc-800 transition-all gap-2">
                View all {openRoles.length} open role{openRoles.length === 1 ? '' : 's'} <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Minimalist CTA */}
      <section className="py-20 sm:py-24 md:py-32 bg-zinc-900 text-onink relative overflow-hidden">
         <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:2rem_2rem]"></div>
         <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center relative z-10">
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tighter mb-6 sm:mb-8">Start smart today.</h2>
            <p className="text-base sm:text-lg md:text-xl text-zinc-400 mb-8 sm:mb-12 max-w-2xl mx-auto px-4">
               Join students across Ethiopia learning smarter.
               Free to start, affordable to upgrade.
            </p>
            <Link to="/register" className="inline-flex items-center justify-center h-12 sm:h-14 px-8 sm:px-10 bg-surface text-ink rounded-full text-base sm:text-lg font-bold hover:bg-zinc-200 transition-all hover:scale-105">
               Create Free Account
            </Link>
         </div>
      </section>

      {/* Reusable Footer */}
      <Footer />

      <OnboardingTour
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        mode="guest"
        userId={null}
      />
      
    </div>
  );
};

export default Landing;