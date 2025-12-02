import React from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Twitter, Linkedin, Github } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-zinc-50 border-t border-zinc-200 py-16 mt-auto">
       <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-12">
             <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-4">
                   <div className="bg-zinc-900 w-8 h-8 rounded-lg flex items-center justify-center">
                      <GraduationCap className="text-white" size={16} />
                   </div>
                   <span className="font-bold text-lg text-zinc-900">SmartStudy</span>
                </div>
                <p className="text-sm text-zinc-500 leading-relaxed">
                   Empowering Ethiopian high school students with AI-driven tools, quality resources, and a vibrant community.
                </p>
             </div>
             
             <div>
                <h4 className="font-bold text-zinc-900 mb-4">Platform</h4>
                <ul className="space-y-3 text-sm text-zinc-500">
                   <li><Link to="/library" className="hover:text-zinc-900">Library</Link></li>
                   <li><Link to="/videos" className="hover:text-zinc-900">Video Lessons</Link></li>
                   <li><Link to="/ai-tutor" className="hover:text-zinc-900">AI Tutor</Link></li>
                   <li><Link to="/community" className="hover:text-zinc-900">Community</Link></li>
                </ul>
             </div>

             <div>
                <h4 className="font-bold text-zinc-900 mb-4">Company</h4>
                <ul className="space-y-3 text-sm text-zinc-500">
                   <li><Link to="/about" className="hover:text-zinc-900">About Us</Link></li>
                   <li><Link to="/careers" className="hover:text-zinc-900">Careers</Link></li>
                   <li><Link to="/" className="hover:text-zinc-900">Privacy Policy</Link></li>
                   <li><Link to="/" className="hover:text-zinc-900">Terms of Service</Link></li>
                </ul>
             </div>

             <div>
                <h4 className="font-bold text-zinc-900 mb-4">Connect</h4>
                <div className="flex gap-4">
                   <a href="#" className="text-zinc-400 hover:text-zinc-900"><Twitter size={20} /></a>
                   <a href="#" className="text-zinc-400 hover:text-zinc-900"><Linkedin size={20} /></a>
                   <a href="#" className="text-zinc-400 hover:text-zinc-900"><Github size={20} /></a>
                </div>
             </div>
          </div>
          
          <div className="border-t border-zinc-200 pt-8 flex flex-col md:flex-row justify-center items-center gap-4 text-sm text-zinc-400">
             <p>© 2024 SmartStudy. All rights reserved.</p>
          </div>
       </div>
    </footer>
  );
};

export default Footer;