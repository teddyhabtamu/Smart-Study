
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
      <div className="flex-1 animate-fade-in max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-zinc-900 mb-6">Join our mission</h1>
          <p className="text-xl text-zinc-500 max-w-2xl mx-auto">
            Help us build the future of education in Ethiopia. We're looking for passionate individuals who want to make a real impact on high school students' lives.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-20">
           <div className="bg-zinc-50 p-8 rounded-2xl border border-zinc-100">
              <h3 className="font-bold text-zinc-900 mb-3 text-lg">Impact at Scale</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">Your work will directly help thousands of students across Ethiopia succeed in their national exams.</p>
           </div>
           <div className="bg-zinc-50 p-8 rounded-2xl border border-zinc-100">
              <h3 className="font-bold text-zinc-900 mb-3 text-lg">Remote-First Culture</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">We value output over hours. Work from anywhere in Ethiopia (or the world) with flexible schedules.</p>
           </div>
           <div className="bg-zinc-50 p-8 rounded-2xl border border-zinc-100">
              <h3 className="font-bold text-zinc-900 mb-3 text-lg">Growth & Learning</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">We invest in our team. Get access to courses, books, and mentorship to grow your career.</p>
           </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-8 flex items-center gap-2">
            <Briefcase className="text-zinc-600" /> Open Positions
          </h2>
          
          <div className="space-y-4">
            {jobs.map((job, i) => (
              <div key={i} className="bg-white border border-zinc-200 rounded-xl p-6 hover:border-zinc-300 hover:shadow-md transition-all group cursor-pointer">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex gap-4">
                     <div className="w-12 h-12 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-500 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                        <job.icon size={20} />
                     </div>
                     <div>
                       <h3 className="font-bold text-lg text-zinc-900 group-hover:text-black transition-colors">{job.title}</h3>
                       <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-500 mt-2">
                          <span className="flex items-center gap-1.5"><Briefcase size={14} /> {job.department}</span>
                          <span className="flex items-center gap-1.5"><Clock size={14} /> {job.type}</span>
                          <span className="flex items-center gap-1.5"><MapPin size={14} /> {job.location}</span>
                       </div>
                     </div>
                  </div>
                  <button className="px-6 py-2 bg-zinc-900 text-white rounded-lg font-medium opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2">
                    Apply Now <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-12 text-center bg-zinc-50 rounded-xl p-8 border border-zinc-200">
             <p className="text-zinc-600 mb-4">Don't see a role that fits? We're always looking for talent.</p>
             <a href="mailto:careers@smartstudy.com" className="text-zinc-900 font-bold hover:underline inline-flex items-center gap-2">
               Email us your CV <ArrowRight size={14} />
             </a>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Careers;
