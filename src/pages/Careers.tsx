
import React, { useState } from 'react';
import { Briefcase, MapPin, Clock, ArrowRight, Code, PenTool, MessageCircle } from 'lucide-react';
import Footer from '../components/Footer';

const Careers: React.FC = () => {
  const jobs = [
    {
      title: "Senior Content Developer (Physics)",
      type: "Full-time",
      location: "Addis Ababa / Remote",
      department: "Content",
      icon: PenTool
    },
    {
      title: "React Frontend Engineer",
      type: "Full-time",
      location: "Remote",
      department: "Engineering",
      icon: Code
    },
    {
      title: "Community Moderator",
      type: "Part-time",
      location: "Remote",
      department: "Operations",
      icon: MessageCircle
    }
  ];

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

          <div className="space-y-3 sm:space-y-4">
            {jobs.map((job, i) => (
              <div key={i} className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-6 hover:border-zinc-300 hover:shadow-md transition-all group cursor-pointer">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                  <div className="flex gap-3 sm:gap-4">
                     <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-500 group-hover:bg-zinc-900 group-hover:text-white transition-colors flex-shrink-0">
                        <job.icon size={16} className="sm:w-5 sm:h-5" />
                     </div>
                     <div className="min-w-0 flex-1">
                       <h3 className="font-bold text-base sm:text-lg text-zinc-900 group-hover:text-black transition-colors">{job.title}</h3>
                       <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-1 sm:gap-y-2 text-xs sm:text-sm text-zinc-500 mt-1 sm:mt-2">
                          <span className="flex items-center gap-1"><Briefcase size={12} className="sm:w-3.5 sm:h-3.5" /> {job.department}</span>
                          <span className="flex items-center gap-1"><Clock size={12} className="sm:w-3.5 sm:h-3.5" /> {job.type}</span>
                          <span className="flex items-center gap-1"><MapPin size={12} className="sm:w-3.5 sm:h-3.5" /> {job.location}</span>
                       </div>
                     </div>
                  </div>
                  <button className="px-4 sm:px-6 py-2 bg-zinc-900 text-white rounded-lg font-medium opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 sm:gap-2 text-sm sm:text-base w-fit">
                    Apply Now <ArrowRight size={14} className="sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 sm:mt-12 text-center bg-zinc-50 rounded-xl p-6 sm:p-8 border border-zinc-200">
             <p className="text-zinc-600 mb-4 text-sm sm:text-base">Don't see a role that fits? We're always looking for talent.</p>
             <a href="mailto:careers@smartstudy.com" className="text-zinc-900 font-bold hover:underline inline-flex items-center gap-2 text-sm sm:text-base">
               Email us your CV <ArrowRight size={12} className="sm:w-3.5 sm:h-3.5" />
             </a>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Careers;
