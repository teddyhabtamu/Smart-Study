
import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

const NotFound: React.FC = () => {
  return (
    <div className="min-h-[80vh] flex items-center justify-center relative overflow-hidden animate-fade-in">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 opacity-40">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-zinc-100 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 text-center px-6">
        <h1 className="text-9xl font-black text-zinc-900 mb-2 opacity-10">404</h1>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full">
           <h2 className="text-4xl font-bold text-zinc-900 mb-4">Page Not Found</h2>
        </div>
        
        <p className="text-zinc-500 max-w-md mx-auto mb-8 text-lg mt-8 relative z-20">
          Oops! The page you are looking for doesn't exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-20">
          <Link 
            to="/" 
            className="px-8 py-3 bg-zinc-900 text-white font-medium rounded-xl hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-900/10 flex items-center justify-center gap-2"
          >
            <Home size={18} /> Go Home
          </Link>
          <button 
            onClick={() => window.history.back()}
            className="px-8 py-3 bg-white text-zinc-700 border border-zinc-200 font-medium rounded-xl hover:bg-zinc-50 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft size={18} /> Go Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
