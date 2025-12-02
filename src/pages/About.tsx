
import React from 'react';
import { GraduationCap, Users, Lightbulb, Target, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

const About: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 animate-fade-in pb-12">
        {/* Hero */}
        <div className="bg-zinc-900 text-white py-20 px-6 rounded-b-3xl mb-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-zinc-500/20 rounded-full blur-3xl -mr-20 -mt-20"></div>
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <GraduationCap size={16} /> Our Mission
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
              Democratizing quality education for <span className="text-zinc-400">Ethiopian High Schools</span>.
            </h1>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              SmartStudy bridges the gap between traditional learning and modern technology, ensuring every Grade 9-12 student has access to the best resources.
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 space-y-20">
          {/* Story */}
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-zinc-900 mb-6">Our Story</h2>
              <div className="space-y-4 text-zinc-600 leading-relaxed">
                <p>
                  Started in 2023 by a group of educators and engineers in Addis Ababa, SmartStudy began with a simple question: "How can we make high-quality tutoring accessible to everyone?"
                </p>
                <p>
                  We realized that while smartphones were becoming common, educational content for the Ethiopian curriculum was still fragmented. Students struggled to find reliable notes, exam practices, and guidance.
                </p>
                <p>
                  Today, SmartStudy serves thousands of students across the country, providing a unified platform that combines localized curriculum materials with cutting-edge AI support tailored for the Ethiopian context.
                </p>
              </div>
            </div>
            <div className="bg-zinc-100 rounded-2xl p-8 flex items-center justify-center min-h-[300px]">
               <div className="text-center">
                  <div className="text-5xl font-bold text-zinc-900 mb-2">10k+</div>
                  <div className="text-zinc-500">Students Empowered</div>
                  <div className="grid grid-cols-2 gap-4 mt-8">
                     <div className="bg-white p-4 rounded-xl shadow-sm">
                        <div className="font-bold text-zinc-900 text-xl">1.2k</div>
                        <div className="text-xs text-zinc-400">Video Lessons</div>
                     </div>
                     <div className="bg-white p-4 rounded-xl shadow-sm">
                        <div className="font-bold text-zinc-900 text-xl">5k+</div>
                        <div className="text-xs text-zinc-400">Resources</div>
                     </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Values */}
          <div>
            <h2 className="text-3xl font-bold text-zinc-900 mb-12 text-center">Core Values</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white p-8 rounded-2xl border border-zinc-200 hover:shadow-lg transition-shadow">
                 <div className="w-12 h-12 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-600 mb-6">
                   <Target size={24} />
                 </div>
                 <h3 className="text-xl font-bold text-zinc-900 mb-3">Accessibility</h3>
                 <p className="text-zinc-500">We believe quality education is a right. Our platform is optimized for low-bandwidth environments common in Ethiopia.</p>
              </div>
              <div className="bg-white p-8 rounded-2xl border border-zinc-200 hover:shadow-lg transition-shadow">
                 <div className="w-12 h-12 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-600 mb-6">
                   <Lightbulb size={24} />
                 </div>
                 <h3 className="text-xl font-bold text-zinc-900 mb-3">Innovation</h3>
                 <p className="text-zinc-500">We leverage AI to personalize learning, offering instant tutoring on subjects from Physics to Civics.</p>
              </div>
              <div className="bg-white p-8 rounded-2xl border border-zinc-200 hover:shadow-lg transition-shadow">
                 <div className="w-12 h-12 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-600 mb-6">
                   <Users size={24} />
                 </div>
                 <h3 className="text-xl font-bold text-zinc-900 mb-3">Community</h3>
                 <p className="text-zinc-500">Learning happens best together. We foster a safe, collaborative environment for students to help each other.</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="bg-zinc-900 text-white rounded-3xl p-12 text-center">
             <h2 className="text-3xl font-bold mb-4">Ready to start learning?</h2>
             <p className="text-zinc-400 mb-8 max-w-xl mx-auto">Join the SmartStudy community today and take your education to the next level.</p>
             <Link to="/register" className="inline-flex items-center gap-2 px-8 py-3 bg-white text-zinc-900 rounded-full font-bold hover:bg-zinc-100 transition-colors">
                Get Started Free <ArrowRight size={18} />
             </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default About;
