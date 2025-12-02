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
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);
  const id = React.useId();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && listRef.current) {
      // Scroll highlighted item into view
      const selectedIdx = options.findIndex(opt => opt.value === value);
      if (selectedIdx >= 0) {
        setHighlightedIndex(selectedIdx);
      }
    }
  }, [isOpen, value, options]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen) {
        if (options[highlightedIndex]) {
          onChange(options[highlightedIndex].value);
          setIsOpen(false);
        }
      } else {
        setIsOpen(true);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex(prev => (prev + 1) % options.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex(prev => (prev - 1 + options.length) % options.length);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={`${id}-label`}
        aria-activedescendant={isOpen ? `${id}-option-${highlightedIndex}` : undefined}
        className={`w-full flex items-center justify-between px-3 py-2.5 bg-white border rounded-lg text-sm transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-500 ${
          isOpen ? 'border-zinc-400 ring-2 ring-zinc-100' : 'border-zinc-200 hover:border-zinc-300'
        }`}
      >
        <span id={`${id}-label`} className={`block truncate ${selectedOption ? 'text-zinc-900' : 'text-zinc-400'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown 
          size={16} 
          className={`text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <div 
          ref={listRef}
          role="listbox"
          className="absolute z-[999] w-full mt-1.5 bg-white border border-zinc-200 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-fade-in-fast focus:outline-none py-1.5 left-0"
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                index === highlightedIndex ? 'bg-zinc-100' : ''
              } ${
                value === option.value 
                  ? 'text-zinc-900 font-medium' 
                  : 'text-zinc-600'
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