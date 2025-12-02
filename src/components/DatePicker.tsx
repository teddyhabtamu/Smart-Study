import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, placeholder = "Select date", className = "", required = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Helper to parse "YYYY-MM-DD" safely without timezone issues
  const getDateFromValue = (val: string) => {
    if (!val) return null;
    const [y, m, d] = val.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  // State for the calendar view (navigation)
  const [currentDate, setCurrentDate] = useState(getDateFromValue(value) || new Date());

  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  const selectedDate = getDateFromValue(value);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update calendar view if value changes externally
  useEffect(() => {
    if (value) {
      setCurrentDate(getDateFromValue(value)!);
    }
  }, [value]);

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleDayClick = (day: number) => {
    // Format: YYYY-MM-DD
    const monthStr = (currentMonth + 1).toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    const dateStr = `${currentYear}-${monthStr}-${dayStr}`;
    
    onChange(dateStr);
    setIsOpen(false);
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const daysArray = [];
  // Empty slots for days before start of month
  for (let i = 0; i < firstDay; i++) {
    daysArray.push(null);
  }
  // Days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    daysArray.push(i);
  }

  const displayDate = selectedDate 
    ? selectedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2.5 bg-white border rounded-lg text-sm transition-all shadow-sm cursor-pointer ${
          isOpen ? 'border-zinc-400 ring-2 ring-zinc-100' : 'border-zinc-200 hover:border-zinc-300'
        }`}
      >
        <span className={`block truncate ${displayDate ? 'text-zinc-900' : 'text-zinc-400'}`}>
           {displayDate || placeholder}
        </span>
        <CalendarIcon size={16} className="text-zinc-400" />
      </div>
      
      {/* Hidden input for HTML5 form validation compatibility */}
      <input 
        type="text" 
        value={value} 
        required={required} 
        onChange={() => {}} 
        className="opacity-0 absolute inset-0 pointer-events-none -z-10 h-full w-full" 
        tabIndex={-1}
      />

      {isOpen && (
        <div className="absolute z-[999] mt-1.5 p-4 bg-white border border-zinc-200 rounded-xl shadow-xl animate-fade-in-fast left-0 w-72">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
             <button type="button" onClick={handlePrevMonth} className="p-1 hover:bg-zinc-100 rounded-full text-zinc-500 transition-colors">
               <ChevronLeft size={16} />
             </button>
             <span className="font-semibold text-zinc-900 text-sm">
               {MONTHS[currentMonth]} {currentYear}
             </span>
             <button type="button" onClick={handleNextMonth} className="p-1 hover:bg-zinc-100 rounded-full text-zinc-500 transition-colors">
               <ChevronRight size={16} />
             </button>
          </div>

          {/* Days Header */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS.map(day => (
              <div key={day} className="text-center text-xs font-medium text-zinc-400">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
             {daysArray.map((day, index) => {
               if (day === null) return <div key={`empty-${index}`} />;
               
               const isSelected = selectedDate && 
                 selectedDate.getDate() === day && 
                 selectedDate.getMonth() === currentMonth && 
                 selectedDate.getFullYear() === currentYear;
               
               const isToday = 
                 new Date().getDate() === day && 
                 new Date().getMonth() === currentMonth && 
                 new Date().getFullYear() === currentYear;

               return (
                 <button
                   key={day}
                   type="button"
                   onClick={() => handleDayClick(day)}
                   className={`h-8 w-8 rounded-full flex items-center justify-center text-sm transition-colors ${
                     isSelected 
                       ? 'bg-zinc-900 text-white font-medium' 
                       : isToday 
                         ? 'bg-zinc-100 text-zinc-900 font-medium'
                         : 'text-zinc-700 hover:bg-zinc-50'
                   }`}
                 >
                   {day}
                 </button>
               );
             })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;