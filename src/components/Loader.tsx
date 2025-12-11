import React from 'react';

const Loader: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="relative h-[12px] w-[48px] flex items-center justify-center mb-4">
        {/* Background gradients */}
        <div 
          className="absolute inset-0"
          style={{
            background: 'no-repeat radial-gradient(farthest-side, #000 90%, transparent) left, no-repeat radial-gradient(farthest-side, #000 90%, transparent) right',
            backgroundSize: '25% 100%',
          }}
        />
        
        {/* First circle - rotates clockwise */}
        <div 
          className="absolute h-[12px] w-[12px] rounded-full bg-zinc-900"
          style={{
            transformOrigin: '-100% 50%',
            animation: 'loaderRotate 1s infinite linear',
          }}
        />
        
        {/* Second circle - rotates counter-clockwise with delay */}
        <div 
          className="absolute h-[12px] w-[12px] rounded-full bg-zinc-900"
          style={{
            transformOrigin: '200% 50%',
            animation: 'loaderRotateReverse 1s infinite linear -0.5s',
          }}
        />
      </div>
      
      {/* Smart Study Text */}
      <p className="text-sm sm:text-base text-zinc-400 font-medium tracking-wide">
        Smart Study
      </p>
    </div>
  );
};

export default Loader;

