
import React from 'react';
import { GraduationCap, Users, Lightbulb, Target, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

const About: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 animate-fade-in pb-12">
        {/* Hero */}
        <div className="bg-zinc-900 text-white py-12 sm:py-16 md:py-20 px-4 sm:px-6 rounded-b-2xl sm:rounded-b-3xl mb-8 sm:mb-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 sm:w-96 sm:h-96 bg-zinc-500/20 rounded-full blur-3xl -mr-16 -mt-16 sm:-mr-20 sm:-mt-20"></div>
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/10 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium mb-4 sm:mb-6">
              <GraduationCap size={14} className="sm:w-4 sm:h-4" /> Our Mission
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-4 sm:mb-6 tracking-tight leading-tight">
              Democratizing quality education for <span className="text-zinc-400">Ethiopian High Schools</span>.
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed px-2">
              SmartStudy bridges the gap between traditional learning and modern technology, ensuring every Grade 9-12 student has access to the best resources.
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-12 sm:space-y-16 md:space-y-20">
          {/* Story */}
          <div className="grid md:grid-cols-2 gap-8 sm:gap-12 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-4 sm:mb-6">Our Story</h2>
              <div className="space-y-3 sm:space-y-4 text-zinc-600 leading-relaxed text-sm sm:text-base">
                <p>
                  SmartStudy started with a simple observation at home.
                </p>
                <p>
                  While helping my sister with her studies, I noticed how difficult it was for students to stay focused while learning online. Educational videos on platforms like YouTube often led to endless distractions, and switching between different AI tools to find answers only made learning more fragmented and confusing.
                </p>
                <p>
                  That experience raised an important question: Why isn't there a single, focused platform designed specifically to help students learn efficiently without distractions?
                </p>
                <p>
                  That question became the foundation of SmartStudy. The platform was built to bring structured learning, guided AI support, and a focused study environment into one place—helping students understand concepts better and make the most of their study time.
                </p>
                <p>
                  What began as a solution to a personal problem has grown into a platform with a clear mission: to help students learn smarter, stay focused, and build confidence in their learning journey.
                </p>
              </div>
            </div>
            <div className="bg-zinc-100 rounded-2xl p-6 sm:p-8 flex items-center justify-center min-h-[250px] sm:min-h-[300px]">
               <div className="text-center">
                  <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-zinc-900 mb-2">10k+</div>
                  <div className="text-zinc-500 text-sm sm:text-base">Students Empowered</div>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-6 sm:mt-8">
                     <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm">
                        <div className="font-bold text-zinc-900 text-lg sm:text-xl">1.2k</div>
                        <div className="text-xs text-zinc-400">Video Lessons</div>
                     </div>
                     <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm">
                        <div className="font-bold text-zinc-900 text-lg sm:text-xl">5k+</div>
                        <div className="text-xs text-zinc-400">Resources</div>
                     </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Values */}
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-8 sm:mb-12 text-center">Core Values</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-zinc-200 hover:shadow-lg transition-shadow">
                 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-600 mb-4 sm:mb-6">
                   <Target size={20} className="sm:w-6 sm:h-6" />
                 </div>
                 <h3 className="text-lg sm:text-xl font-bold text-zinc-900 mb-3">Accessibility</h3>
                 <p className="text-zinc-500 text-sm sm:text-base">We believe quality education is a right. Our platform is optimized for low-bandwidth environments common in Ethiopia.</p>
              </div>
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-zinc-200 hover:shadow-lg transition-shadow">
                 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-600 mb-4 sm:mb-6">
                   <Lightbulb size={20} className="sm:w-6 sm:h-6" />
                 </div>
                 <h3 className="text-lg sm:text-xl font-bold text-zinc-900 mb-3">Innovation</h3>
                 <p className="text-zinc-500 text-sm sm:text-base">We leverage AI to personalize learning, offering instant tutoring on subjects from Physics to Civics.</p>
              </div>
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-zinc-200 hover:shadow-lg transition-shadow sm:col-span-2 lg:col-span-1">
                 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-600 mb-4 sm:mb-6">
                   <Users size={20} className="sm:w-6 sm:h-6" />
                 </div>
                 <h3 className="text-lg sm:text-xl font-bold text-zinc-900 mb-3">Community</h3>
                 <p className="text-zinc-500 text-sm sm:text-base">Learning happens best together. We foster a safe, collaborative environment for students to help each other.</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="bg-zinc-900 text-white rounded-2xl sm:rounded-3xl p-8 sm:p-12 text-center">
             <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to start learning?</h2>
             <p className="text-zinc-400 mb-6 sm:mb-8 max-w-xl mx-auto text-sm sm:text-base">Join the SmartStudy community today and take your education to the next level.</p>
             <Link to="/register" className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 bg-white text-zinc-900 rounded-full font-bold hover:bg-zinc-100 transition-colors text-sm sm:text-base">
                Get Started Free <ArrowRight size={16} className="sm:w-[18px] sm:h-[18px]" />
             </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default About;
