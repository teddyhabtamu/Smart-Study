import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface Option {
  label: string;
  value: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ options, value, onChange, placeholder = 'Select...', className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2.5 bg-white border rounded-lg text-sm transition-all shadow-sm ${
          isOpen ? 'border-zinc-400 ring-2 ring-zinc-100' : 'border-zinc-200 hover:border-zinc-300'
        }`}
      >
        <span className={`block truncate ${selectedOption ? 'text-zinc-900' : 'text-zinc-400'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown 
          size={16} 
          className={`text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <div className="absolute z-[999] w-full mt-1.5 bg-white border border-zinc-200 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-fade-in-fast focus:outline-none py-1.5 left-0">
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                value === option.value 
                  ? 'bg-zinc-50 text-zinc-900 font-medium' 
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              <span className="truncate">{option.label}</span>
              {value === option.value && <Check size={14} className="text-zinc-900 flex-shrink-0 ml-2" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;