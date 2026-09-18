import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  const popupRef = useRef<HTMLDivElement>(null);
  // Fixed popup geometry, recomputed on open/scroll/resize (see below).
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0, width: 288, dropUp: false });

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

  // Close on click outside (popup is portaled, so both refs count as in).
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (popupRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Popup geometry: the trigger often lives inside an overflow-hidden modal
  // panel (Add Task on mobile), where an in-flow absolute calendar gets
  // cropped. The calendar portals to the body and pins under the trigger
  // instead — flipping above it when space below runs out, clamping width
  // to the viewport, and re-pinning on scroll/resize so it never detaches.
  const pinPopup = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(288, vw - 16);
    const height = 384; // calendar card estimate for the flip decision
    const left = Math.max(8, Math.min(rect.left, vw - width - 8));
    const dropUp = rect.bottom + 8 + height > vh && rect.top - 8 - height > 8;
    setPopupPos({
      top: dropUp ? Math.max(8, rect.top - 8 - height) : rect.bottom + 6,
      left,
      width,
      dropUp,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    pinPopup();
    window.addEventListener('scroll', pinPopup, true);
    window.addEventListener('resize', pinPopup);
    return () => {
      window.removeEventListener('scroll', pinPopup, true);
      window.removeEventListener('resize', pinPopup);
    };
  }, [isOpen, pinPopup]);

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
        className={`w-full flex items-center justify-between px-3 py-2.5 bg-surface border rounded-lg text-sm transition-all shadow-sm cursor-pointer ${
          isOpen ? 'border-zinc-400 ring-2 ring-zinc-100' : 'border-zinc-200 hover:border-zinc-300'
        }`}
      >
        <span className={`block truncate ${displayDate ? 'text-ink' : 'text-zinc-400'}`}>
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

      {isOpen && createPortal(
        <div
          ref={popupRef}
          role="dialog"
          aria-label="Choose date"
          className="fixed z-[999] p-4 bg-surface border border-zinc-200 rounded-xl shadow-xl animate-popover"
          style={{ top: popupPos.top, left: popupPos.left, width: popupPos.width }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
             <button type="button" onClick={handlePrevMonth} className="p-1 hover:bg-zinc-100 rounded-full text-zinc-500 transition-colors">
               <ChevronLeft size={16} />
             </button>
             <span className="font-semibold text-ink text-sm">
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
                       ? 'bg-zinc-900 text-onink font-medium' 
                       : isToday 
                         ? 'bg-zinc-100 text-ink font-medium'
                         : 'text-inksoft hover:bg-zinc-50'
                   }`}
                 >
                   {day}
                 </button>
               );
              })}
           </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DatePicker;