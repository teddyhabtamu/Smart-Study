import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Brain, Users, PlayCircle, CheckCircle2, Star, HelpCircle, FileText } from 'lucide-react';
import Footer from '../components/Footer';
import { useSEO, pageSEO } from '../utils/seoUtils';

const Landing: React.FC = () => {
  const { updateSEO } = useSEO();

  useEffect(() => {
    updateSEO(pageSEO.home);
  }, [updateSEO]);
  return (
    <div className="flex flex-col min-h-screen bg-white selection:bg-zinc-900 selection:text-white">
      
      {/* Hero Section with Grid Background */}
      <section className="relative pt-16 sm:pt-20 md:pt-24 pb-20 sm:pb-24 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#f4f4f5_1px,transparent_1px),linear-gradient(to_bottom,#f4f4f5_1px,transparent_1px)] bg-[size:4rem_4rem] md:bg-[size:4rem_4rem] bg-[size:2rem_2rem]"></div>
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent"></div>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-white border border-zinc-200 shadow-sm mb-6 sm:mb-8 animate-fade-in">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="text-xs sm:text-sm font-medium text-zinc-600">Updated for 2024 Curriculum</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tighter text-zinc-900 mb-6 sm:mb-8 animate-slide-up leading-[0.9]">
            Learn faster.<br />
            <span className="text-zinc-400">Study smarter.</span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-zinc-500 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed font-light animate-slide-up px-2" style={{ animationDelay: '0.1s' }}>
            The all-in-one digital learning platform for Ethiopian high school students.
            Powered by advanced AI, curated content, and community.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 animate-slide-up px-4" style={{ animationDelay: '0.2s' }}>
            <Link to="/register" className="group h-11 sm:h-12 px-6 sm:px-8 bg-zinc-900 text-white rounded-full font-medium hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-zinc-900/20 hover:shadow-2xl hover:shadow-zinc-900/30 hover:-translate-y-0.5 text-sm sm:text-base">
              Start Learning Free <ArrowRight size={16} className="sm:w-[18px] sm:h-[18px] group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/library" className="h-11 sm:h-12 px-6 sm:px-8 bg-white text-zinc-900 border border-zinc-200 rounded-full font-medium hover:bg-zinc-50 transition-all flex items-center justify-center hover:border-zinc-300 text-sm sm:text-base">
              Browse Library
            </Link>
          </div>

          {/* Abstract Floating UI Elements for decoration - Hidden on mobile */}
          <div className="absolute top-1/2 left-4 sm:left-10 -translate-y-1/2 hidden lg:block opacity-50 animate-pulse delay-700">
             <div className="bg-white p-3 sm:p-4 rounded-2xl border border-zinc-200 shadow-lg rotate-[-6deg] w-36 sm:w-48">
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
             <div className="bg-zinc-900 p-3 sm:p-4 rounded-2xl shadow-xl rotate-[6deg] w-36 sm:w-48 text-white">
                <div className="flex gap-3 items-center mb-3">
                   <Brain size={18} className="sm:w-5 sm:h-5 text-zinc-400"/>
                   <span className="text-xs font-bold text-zinc-300">AI Tutor</span>
                </div>
                <div className="text-xs text-zinc-400">Solving complex physics problems...</div>
             </div>
          </div>
        </div>
      </section>

      {/* Stats / Line Separator */}
      <div className="border-y border-zinc-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {[
              { label: "Active Students", value: "10k+" },
              { label: "Resources", value: "5,000+" },
              { label: "Video Lessons", value: "1,200+" },
              { label: "Questions Solved", value: "50k+" },
            ].map((stat, i) => (
              <div key={i} className="text-center md:text-left">
                <div className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight mb-1">{stat.value}</div>
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
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-zinc-900 tracking-tight mb-4 sm:mb-6">Everything you need to excel.</h2>
            <p className="text-base sm:text-lg text-zinc-500 font-light">
              We've redesigned the study experience to focus on clarity, speed, and comprehension.
              No clutter, just learning.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 grid-rows-[auto_auto]">
            
            {/* AI Card - Large */}
            <div className="md:col-span-2 lg:col-span-2 lg:row-span-2 bg-zinc-950 rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-12 text-white relative overflow-hidden group border border-zinc-800">
               <div className="absolute top-0 right-0 w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] bg-indigo-500/20 rounded-full blur-[100px] -mr-10 sm:-mr-20 -mt-10 sm:-mt-20"></div>
               <div className="relative z-10 flex flex-col h-full justify-between">
                  <div>
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6 sm:mb-8 border border-white/10 group-hover:bg-white/20 transition-colors">
                       <Brain size={24} className="sm:w-7 sm:h-7" />
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">AI Personal Tutor</h3>
                    <p className="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-md">
                       Stuck on a problem? Get instant, step-by-step explanations for math, physics, and chemistry questions. Powered by Gemini.
                    </p>
                  </div>
                  <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/10 flex items-center gap-4">
                     <Link to="/ai-tutor" className="text-white font-semibold flex items-center gap-2 hover:gap-4 transition-all text-sm sm:text-base">
                        Start Chatting <ArrowRight size={16} className="sm:w-[18px] sm:h-[18px]" />
                     </Link>
                  </div>
               </div>
            </div>

            {/* Library Card */}
            <Link to="/library" className="bg-zinc-50 rounded-2xl md:rounded-3xl p-6 sm:p-8 border border-zinc-200 hover:border-zinc-300 transition-colors group block">
               <BookOpen size={28} className="sm:w-8 sm:h-8 text-zinc-900 mb-4 sm:mb-6" />
               <h3 className="text-lg sm:text-xl font-bold text-zinc-900 mb-2">Digital Library</h3>
               <p className="text-zinc-500 mb-4 sm:mb-6 text-sm sm:text-base">Access thousands of textbooks and exam papers.</p>
               <div className="flex -space-x-2">
                  {[1,2,3].map(i => (
                     <div key={i} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-200 border-2 border-white"></div>
                  ))}
               </div>
            </Link>

            {/* Video Card */}
            <Link to="/videos" className="bg-zinc-50 rounded-2xl md:rounded-3xl p-6 sm:p-8 border border-zinc-200 hover:border-zinc-300 transition-colors group block">
               <PlayCircle size={28} className="sm:w-8 sm:h-8 text-zinc-900 mb-4 sm:mb-6" />
               <h3 className="text-lg sm:text-xl font-bold text-zinc-900 mb-2">Video Classroom</h3>
               <p className="text-zinc-500 text-sm sm:text-base">Visual lessons from Ethiopia's top instructors.</p>
            </Link>

            {/* Past Exams Card */}
            <Link to="/past-exams" className="bg-zinc-50 rounded-2xl md:rounded-3xl p-6 sm:p-8 border border-zinc-200 hover:border-zinc-300 transition-colors group block">
               <FileText size={28} className="sm:w-8 sm:h-8 text-zinc-900 mb-4 sm:mb-6" />
               <h3 className="text-lg sm:text-xl font-bold text-zinc-900 mb-2">Past Exams</h3>
               <p className="text-zinc-500 text-sm sm:text-base">Practice with previous national exam papers.</p>
            </Link>

            {/* Community/Wide Card */}
            <div className="md:col-span-3 bg-white rounded-2xl md:rounded-3xl p-6 sm:p-8 md:p-12 border border-zinc-200 hover:border-zinc-300 transition-colors flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8 group">
               <div className="max-w-xl text-center md:text-left">
                  <div className="flex items-center gap-2 mb-3 sm:mb-4 text-emerald-600 font-medium text-xs sm:text-sm bg-emerald-50 w-fit px-3 py-1 rounded-full mx-auto md:mx-0">
                     <Users size={14} className="sm:w-4 sm:h-4" /> Community First
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-3 sm:mb-4">Study Groups & Forums</h3>
                  <p className="text-zinc-500 text-base sm:text-lg">
                     Join thousands of students discussing complex topics, sharing notes, and preparing for national exams together.
                  </p>
               </div>
               <div className="flex-shrink-0 w-full md:w-auto">
                  <Link to="/register" className="h-11 sm:h-12 px-6 sm:px-8 bg-zinc-100 text-zinc-900 rounded-full font-medium hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 w-full md:w-auto text-sm sm:text-base">
                     Join Community
                  </Link>
               </div>
            </div>

          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 sm:py-20 bg-zinc-50 border-y border-zinc-200">
         <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-10 sm:mb-16">
               <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-3 sm:mb-4">Trusted by Top Students</h2>
               <p className="text-zinc-500 text-sm sm:text-base">Don't just take our word for it.</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
               {[
                 {
                   name: "Dagim T.",
                   grade: "Grade 12",
                   text: "SmartStudy helped me ace my entrance exams. The AI tutor explains physics concepts better than my textbook!"
                 },
                 {
                   name: "Lidya M.",
                   grade: "Grade 10",
                   text: "I love the community feature. Being able to ask questions and get verified answers instantly has saved me so much time.",
                 },
                 {
                   name: "Abel K.",
                   grade: "Grade 11",
                   text: "The library is vast and the offline mode is a lifesaver. I can study anywhere without worrying about data.",
                 }
               ].map((t, i) => (
                 <div key={i} className="bg-white p-6 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all">
                    <div className="flex gap-1 mb-4">
                       {[1,2,3,4,5].map(star => <Star key={star} size={12} className="sm:w-[14px] sm:h-[14px] fill-amber-400 text-amber-400" />)}
                    </div>
                    <p className="text-zinc-600 mb-4 sm:mb-6 leading-relaxed text-sm sm:text-base">"{t.text}"</p>
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 sm:w-10 sm:h-10 bg-zinc-100 rounded-full flex items-center justify-center font-bold text-zinc-600 text-sm sm:text-base">
                          {t.name.charAt(0)}
                       </div>
                       <div>
                          <p className="font-bold text-sm text-zinc-900">{t.name}</p>
                          <p className="text-xs text-zinc-500">{t.grade}</p>
                       </div>
                    </div>
                 </div>
               ))}
            </div>
         </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-20 px-4 sm:px-6">
         <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10 sm:mb-16">
               <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-3 sm:mb-4">Common Questions</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
               {[
                 { q: "Is SmartStudy free?", a: "Yes! Creating an account is free and gives you access to the library and community. We also offer a Pro plan for advanced AI features." },
                 { q: "What grades do you cover?", a: "We currently focus on High School education (Grades 9-12) following the new Ethiopian curriculum." },
                 { q: "Can I use it offline?", a: "Yes, our mobile app supports offline access for downloaded materials. The web version requires an internet connection." },
                 { q: "Is the content verified?", a: "Our educational materials are sourced from the Ministry of Education and verified partners to ensure accuracy." }
               ].map((item, i) => (
                 <div key={i} className="p-5 sm:p-6 rounded-2xl border border-zinc-200 hover:border-zinc-300 transition-colors">
                    <h3 className="font-bold text-zinc-900 mb-2 flex items-start gap-2 text-sm sm:text-base">
                       <HelpCircle size={16} className="sm:w-[18px] sm:h-[18px] text-zinc-400 mt-0.5 flex-shrink-0" />
                       {item.q}
                    </h3>
                    <p className="text-sm text-zinc-500 pl-6 sm:pl-7 leading-relaxed">{item.a}</p>
                 </div>
               ))}
            </div>
         </div>
      </section>

      {/* Minimalist CTA */}
      <section className="py-20 sm:py-24 md:py-32 bg-zinc-900 text-white relative overflow-hidden">
         <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:2rem_2rem]"></div>
         <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center relative z-10">
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tighter mb-6 sm:mb-8">Start smart today.</h2>
            <p className="text-base sm:text-lg md:text-xl text-zinc-400 mb-8 sm:mb-12 max-w-2xl mx-auto px-4">
               Join the fastest growing education platform in Ethiopia.
               Free to start, affordable to upgrade.
            </p>
            <Link to="/register" className="inline-flex items-center justify-center h-12 sm:h-14 px-8 sm:px-10 bg-white text-black rounded-full text-base sm:text-lg font-bold hover:bg-zinc-200 transition-all hover:scale-105">
               Create Free Account
            </Link>
         </div>
      </section>

      {/* Reusable Footer */}
      <Footer />
      
    </div>
  );
};

export default Landing;