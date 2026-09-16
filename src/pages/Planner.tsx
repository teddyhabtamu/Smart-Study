
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Dialog from '../components/Dialog';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, Plus, Sparkles, CheckCircle, Circle, Trash2, X, Clock, BookOpen, Lock, Trophy, Loader2, Lightbulb, Target, TrendingUp, Archive, ArchiveRestore, ChevronLeft, ChevronRight } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { StudyEvent } from '../types';
import { aiTutorAPI, plannerAPI } from '../services/api';
import CustomSelect from '../components/CustomSelect';
import DatePicker from '../components/DatePicker';
import { SUBJECTS } from '../constants';
import { PlannerEventSkeleton, TaskItemSkeleton } from '../components/Skeletons';
import { MarkdownInline } from '../components/MarkdownRenderer';

// Days until (negative = overdue) for a date string. Tolerant: accepts both
// YYYY-MM-DD and full ISO timestamps (slices to the calendar date).
const daysUntil = (dateStr: string): number => {
  const normalized = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return NaN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(normalized + 'T00:00:00');
  return Math.round((d.getTime() - today.getTime()) / 86400000);
};

// Urgency signal for deadlines: TODAY / TOMORROW / in Nd / Nd overdue.
// Returns null when the date is unparseable (never render "in NaNd").
const getUrgency = (dateStr: string): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' } | null => {
  const diff = daysUntil(dateStr);
  if (Number.isNaN(diff)) return null;
  if (diff < 0) return { label: `${-diff}d overdue`, tone: 'overdue' };
  if (diff === 0) return { label: 'Today', tone: 'today' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'soon' };
  return { label: `in ${diff}d`, tone: diff <= 3 ? 'soon' : 'later' };
};

const urgencyPill = (tone: string): string => {
  switch (tone) {
    case 'overdue': return 'bg-red-600 text-white';
    case 'today': return 'bg-zinc-900 text-onink';
    case 'soon': return 'bg-amber-100 text-amber-800';
    default: return 'bg-zinc-100 text-zinc-500';
  }
};

const typeDot = (type: string): string => {
  if (type === 'Exam') return 'bg-red-500';
  if (type === 'Assignment') return 'bg-amber-500';
  return 'bg-zinc-400';
};

// Stable subject accent colors (list dots, modal header). Hash-picked from a
// curated palette so every subject reads distinct without clashing with the
// zinc/red/amber/emerald status colors used elsewhere on this page.
const SUBJECT_COLORS = [
  'bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-lime-500', 'bg-fuchsia-500',
  'bg-indigo-500', 'bg-teal-500', 'bg-yellow-500', 'bg-purple-500',
];
const subjectColor = (subject: string): string => {
  let h = 0;
  for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) >>> 0;
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length] ?? 'bg-zinc-400';
};

const taskCount = (n: number): string => `${n} Task${n === 1 ? '' : 's'}`;

interface EventCardProps {
  event: StudyEvent;
  selected: boolean;
  /** True when the Archived filter is active (shows Unarchive instead). */
  inArchivedView: boolean;
  completingId: string | null;
  archivingId: string | null;
  deletingId: string | null;
  onOpen: (id: string) => void;
  onToggleComplete: (id: string, isCompleted: boolean) => void;
  onToggleArchive: (id: string, isArchived: boolean) => void;
  onDelete: (id: string) => void;
}

// One task row, shared by the list view and the calendar day section.
// Extracted so both stay identical — the calendar used to force a round
// trip back to List just to see a day's plans.
const EventCard: React.FC<EventCardProps> = ({
  event,
  selected,
  inArchivedView,
  completingId,
  archivingId,
  deletingId,
  onOpen,
  onToggleComplete,
  onToggleArchive,
  onDelete,
}) => (
  <div
    onClick={(e) => {
      e.stopPropagation();
      onOpen(event.id);
    }}
    className={`group flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border transition-all cursor-pointer ${
      event.isCompleted
        ? 'bg-zinc-50 border-zinc-100 opacity-60'
        : selected
        ? 'bg-surface border-zinc-900 shadow-lg'
        : 'bg-surface border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-md'
    }`}
  >
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggleComplete(event.id, event.isCompleted);
      }}
      disabled={completingId === event.id}
      className={`relative flex-shrink-0 transition-colors p-1 after:absolute after:-inset-2 after:content-[''] ${
        event.isCompleted
          ? 'text-emerald-500'
          : 'text-zinc-300 hover:text-emerald-500'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title={event.isCompleted ? "Mark as pending" : "Complete task"}
    >
      {completingId === event.id ? (
        <Loader2 size={20} className="sm:w-6 sm:h-6 animate-spin" />
      ) : event.isCompleted ? (
        <CheckCircle size={20} className="sm:w-6 sm:h-6 fill-current" />
      ) : (
        <Circle size={20} className="sm:w-6 sm:h-6" />
      )}
    </button>

    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <h4 className={`font-bold text-ink truncate text-sm sm:text-base ${event.isCompleted ? 'line-through text-zinc-500' : ''}`}>
          {event.title}
        </h4>
        {event.type === 'Exam' && (
          <span className="text-[10px] sm:text-[11px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold flex-shrink-0">EXAM</span>
        )}
        {event.type === 'Assignment' && (
          <span className="text-[10px] sm:text-[11px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold flex-shrink-0">ASSIGNMENT</span>
        )}
        {!event.isCompleted && (() => {
          const u = getUrgency(event.date);
          if (!u) return null;
          return (
            <span className={`text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${urgencyPill(u.tone)}`}>
              {u.tone === 'today' && <span className="inline-block w-1 h-1 rounded-full bg-surface animate-pulse mr-1 align-middle" />}
              {u.label}
            </span>
          );
        })()}
      </div>
      <p className="text-xs text-zinc-500 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${subjectColor(event.subject)}`} aria-hidden />
        <span className="font-medium text-inksoft">{event.subject}</span>
        {(() => {
          // Only show simple text notes, not JSON
          if (!event.notes) return null;
          try {
            // Check if notes is JSON
            const trimmed = event.notes.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              // It's JSON, don't display it - the detail modal shows it on open
              return null;
            }
            // It's plain text, show it
            return <span className="hidden sm:inline">• {event.notes}</span>;
          } catch {
            // Not JSON, show it
            return <span className="hidden sm:inline">• {event.notes}</span>;
          }
        })()}
      </p>
    </div>

    {/* Hover-reveal on desktop; always visible on touch (no hover) + keyboard focus */}
    <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity">
      {inArchivedView ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleArchive(event.id, event.isArchived);
          }}
          disabled={archivingId === event.id}
          className="p-1.5 sm:p-2 text-zinc-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          title="Unarchive"
        >
          {archivingId === event.id ? (
            <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
          ) : (
            <ArchiveRestore size={16} className="sm:w-[18px] sm:h-[18px]" />
          )}
        </button>
      ) : event.isCompleted ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleArchive(event.id, event.isArchived);
          }}
          disabled={archivingId === event.id}
          className="p-1.5 sm:p-2 text-zinc-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          title="Archive"
        >
          {archivingId === event.id ? (
            <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
          ) : (
            <Archive size={16} className="sm:w-[18px] sm:h-[18px]" />
          )}
        </button>
      ) : null}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(event.id);
        }}
        disabled={deletingId === event.id}
        className="p-1.5 sm:p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        title="Delete task"
      >
        {deletingId === event.id ? (
          <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
        ) : (
          <Trash2 size={16} className="sm:w-[18px] sm:h-[18px]" />
        )}
      </button>
    </div>
  </div>
);


const Planner: React.FC = () => {
  const { studyEvents, fetchStudyEvents, createStudyEvent, createStudyEventsBatch, updateStudyEvent, deleteStudyEvent, loading, fetchDashboard } = useData();
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  // Elapsed seconds while the AI schedule generates — drives staged progress text
  const [generateElapsed, setGenerateElapsed] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState<string | null>(null);
  const [isArchivingEvent, setIsArchivingEvent] = useState<string | null>(null);
  const [isCompletingEvent, setIsCompletingEvent] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'archived'>('all');
  // Timeline visualization: list (day groups) or calendar (month grid)
  const [plannerView, setPlannerView] = useState<'list' | 'calendar'>('list');
  // Calendar cursor (first of visible month) + tapped day filter (YYYY-MM-DD)
  const [calCursor, setCalCursor] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  
  // Detail view is a centered modal (not an anchored tooltip): one toggle,
  // no measuring, no viewport math, no reposition listeners.
  const handleEventClick = (eventId: string) => {
    setSelectedEventId((prev) => (prev === eventId ? null : eventId));
  };

  // Close detail modal (backdrop click and callers share this).
  const closeTooltip = useCallback(() => {
    setSelectedEventId(null);
  }, []);

  // Track if we've fetched events to prevent duplicate calls
  const hasFetchedEventsRef = useRef(false);
  
  useEffect(() => {
    setMounted(true);
    // Fetch study events only once on mount
    if (!hasFetchedEventsRef.current) {
      hasFetchedEventsRef.current = true;
      fetchStudyEvents();
    }
  }, [fetchStudyEvents]);

  // Fetch events when archive filter changes
  useEffect(() => {
    if (!hasFetchedEventsRef.current) return; // Don't run on initial mount
    
    if (statusFilter === 'archived') {
      fetchStudyEvents({ archived: true });
    } else {
      fetchStudyEvents({ archived: false });
    }
  }, [statusFilter, fetchStudyEvents]);

  // Esc dismisses the detail modal (backdrop click covers pointer users).
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEventId(null);
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Manual Form State
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [date, setDate] = useState('');
  const [type, setType] = useState<'Revision' | 'Exam' | 'Assignment'>('Revision');

  // AI Form State
  const [aiPrompt, setAiPrompt] = useState('');

  // Derived State
  const sortedEvents = [...studyEvents]
    .filter(event => {
      if (statusFilter === 'pending') return !event.isCompleted && !event.isArchived;
      if (statusFilter === 'completed') return event.isCompleted && !event.isArchived;
      if (statusFilter === 'archived') return event.isArchived;
      return !event.isArchived; // 'all' shows non-archived events
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
  const upcomingEvents = studyEvents.filter(e => !e.isCompleted && !e.isArchived && daysUntil(e.date) >= 0).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const completedCount = studyEvents.filter(e => e.isCompleted && !e.isArchived).length;
  
  // Group events by date
  const groupedEvents: { [key: string]: StudyEvent[] } = {};
  sortedEvents.forEach(event => {
    if (!groupedEvents[event.date]) groupedEvents[event.date] = [];
    groupedEvents[event.date].push(event);
  });

  // Calendar grid for the visible month (Monday-start, 6x7). Each cell knows
  // its date key, whether it's in-month, and that day's (filtered) events.
  const calendarCells: Array<{ key: string; day: number; inMonth: boolean; events: StudyEvent[] }> = (() => {
    const y = calCursor.getFullYear();
    const m = calCursor.getMonth();
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-start offset
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev = new Date(y, m, 0).getDate();
    const cells: Array<{ key: string; day: number; inMonth: boolean; events: StudyEvent[] }> = [];
    const keyOf = (yy: number, mm: number, dd: number) =>
      `${yy}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    for (let i = lead - 1; i >= 0; i--) {
      const dd = daysInPrev - i;
      const k = keyOf(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, dd);
      cells.push({ key: k, day: dd, inMonth: false, events: groupedEvents[k] || [] });
    }
    for (let dd = 1; dd <= daysInMonth; dd++) {
      const k = keyOf(y, m, dd);
      cells.push({ key: k, day: dd, inMonth: true, events: groupedEvents[k] || [] });
    }
    let dd = 1;
    while (cells.length % 7 !== 0 || cells.length < 35) {
      const k = keyOf(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, dd);
      cells.push({ key: k, day: dd, inMonth: false, events: groupedEvents[k] || [] });
      dd++;
    }
    return cells;
  })();

  const todayKey = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  // When a calendar day is tapped, the timeline below narrows to that day
  const visibleDateKeys = selectedDate
    ? Object.keys(groupedEvents).filter(k => k === selectedDate).sort()
    : Object.keys(groupedEvents).sort();

  const handleTaskToggle = async (id: string, isCompleted: boolean) => {
    setIsCompletingEvent(id);
    try {
      // The backend awards typed XP on false→true (Exam 50 / Assignment 30 /
      // Revision 20) and returns it — no second gainXP call here. The old
      // code called gainXP(50) on top, double-paying every completion.
      const updated = await updateStudyEvent(id, { isCompleted: !isCompleted });
      if (!isCompleted) { // If marking as complete
        await refreshUser(); // sync header XP/level with the award
        const xp = updated.xpGained ?? 0;
        addToast(xp > 0 ? `+${xp} XP Task Completed!` : "Task completed!", "success");
        if (updated.leveledUp && updated.newLevel) {
          setTimeout(() => addToast(`Level Up! You are now Level ${updated.newLevel}`, "info"), 500);
        }
      }
    } catch (error) {
      console.error('Failed to toggle task:', error);
      addToast("Failed to update task status", "error");
    } finally {
      setIsCompletingEvent(null);
    }
  };

  const handleArchiveToggle = async (id: string, isArchived: boolean) => {
    setIsArchivingEvent(id);
    try {
      await updateStudyEvent(id, { isArchived: !isArchived });
      addToast(isArchived ? "Event unarchived" : "Event archived", "success");
      // Refresh events to update the view based on current filter
      if (statusFilter === 'archived') {
        await fetchStudyEvents({ archived: true });
      } else {
        await fetchStudyEvents({ archived: false });
      }
    } catch (error) {
      console.error('Failed to archive/unarchive event:', error);
      addToast("Failed to update archive status", "error");
    } finally {
      setIsArchivingEvent(null);
    }
  };

  // Single delete path for list cards, the calendar day section, and the
  // detail modal (which closes itself when its event disappears).
  const handleDeleteEvent = async (id: string) => {
    setIsDeletingEvent(id);
    try {
      await deleteStudyEvent(id);
      addToast("Study event deleted", "success");
      if (selectedEventId === id) setSelectedEventId(null);
    } catch (error) {
      console.error('Failed to delete event:', error);
      addToast("Failed to delete event", "error");
    } finally {
      setIsDeletingEvent(null);
    }
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;

    setIsAdding(true);
    try {
      await createStudyEvent({
        title,
        subject,
        date,
        type,
        isCompleted: false,
        isArchived: false,
        notes: ''
      });

      // Refresh the study events to ensure they're displayed
      await fetchStudyEvents();

      setIsManualModalOpen(false);
      resetManualForm();
      addToast("Study event added successfully!", "success");
    } catch (error) {
      console.error('Failed to add study event:', error);
      addToast("Failed to add study event", "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleSmartScheduleClick = () => {
    if (!user) {
      navigate('/login?next=/planner');
      return;
    }
    if (!user.isPremium) {
      // Silent redirects strand users on a pricing page with no context —
      // explain why they landed there, with their place preserved.
      addToast('Smart Schedule is a Pro feature — upgrade to continue.', 'info');
      navigate('/subscription', { state: { from: location.pathname } });
      return;
    }
    setIsAIModalOpen(true);
  };

  const handleGenerateAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setIsGenerating(true);
    setGenerateElapsed(0);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setGenerateElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    try {
      const response = await aiTutorAPI.generateStudyPlan(aiPrompt);

      // The response already contains parsed JSON
      const plan = response.plan;

      // Fallback skeleton (AI failed): never saved — persisting 7 generic
      // tasks would create cleanup work, not value. Keep the modal open with
      // the prompt intact so one more click retries the real generation.
      if (response.fallback) {
        addToast("Couldn't generate your plan just now — nothing was saved. Try again in a moment.", "warning");
        return;
      }

      // Preferred path: the server persisted the plan in the same warm
      // invocation and returned the created rows — no second round trip.
      // A second cold function + pool acquisition is where saves used to
      // die while generation succeeded, stranding every plan.
      if (response.persisted && Array.isArray(response.events) && response.events.length > 0) {
        await fetchStudyEvents();
        // Same dashboard courtesy as the batch path below: today's plan
        // feeds the progress ring on the Dashboard.
        const today = new Date().toISOString().split('T')[0];
        if (response.events.some((e: any) => String(e.event_date || '').slice(0, 10) === today)) {
          await fetchDashboard();
        }
        addToast(`Study plan generated successfully! (${response.events.length} sessions scheduled)`, "success");
        // Only dismiss + clear on success — a failure keeps the modal open
        // with the prompt intact so the user can retry or rephrase.
        setIsAIModalOpen(false);
        setAiPrompt('');
        return;
      }

      // Fallback path: server returned a plan it couldn't persist (or an
      // older server without folded persist). Save via the standalone batch
      // endpoint instead of losing the plan.
      // Batch-create all events in ONE request (not N sequential POSTs)
      const validItems = (plan || []).filter(
        (item: any) => item.title && item.subject && item.date && item.type
      ).map((item: any) => ({
        title: item.title,
        subject: item.subject,
        date: item.date,
        type: item.type,
        isCompleted: false,
        isArchived: false,
        notes: item.notes || ''
      }));

      if (validItems.length > 0) {
        await createStudyEventsBatch(validItems);
        // Refresh the study events to ensure they're displayed
        await fetchStudyEvents();
        addToast(`Study plan generated successfully! (${validItems.length} sessions scheduled)`, "success");
        // Only dismiss + clear on success — a failure keeps the modal open
        // with the prompt intact so the user can retry or rephrase.
        setIsAIModalOpen(false);
        setAiPrompt('');
      } else {
        addToast("The AI returned no usable sessions. Try rephrasing your goal with clearer deadlines.", "warning");
      }
    } catch (error) {
      console.error('AI generation error:', error);
      if ((error as any)?.code === 'PREMIUM_REQUIRED') {
        // Backend is the real gate (direct API calls bypass the page guard):
        // send them to upgrade with their place preserved.
        addToast('Smart Schedule is a Pro feature — upgrade to continue.', 'info');
        setIsAIModalOpen(false);
        navigate('/subscription', { state: { from: location.pathname } });
        return;
      }
      // Surface the server's message when it's a real sentence (e.g. the
      // 503 "AI study generation is unavailable…"), not a transport artifact
      // ("HTTP 500", "fetch failed"). The old always-generic toast hid a
      // missing-API-key outage behind "please try again" for days.
      const serverMsg = (error as any)?.message || '';
      const isTransportNoise = !serverMsg || /^HTTP \d/i.test(serverMsg) ||
        /fetch failed|failed to fetch|network|timeout|abort/i.test(serverMsg);
      addToast(
        isTransportNoise
          ? 'Failed to generate study plan. Your prompt is preserved — please try again.'
          : serverMsg,
        'error'
      );
    } finally {
      clearInterval(timer);
      setIsGenerating(false);
    }
  };

  const resetManualForm = () => {
    setTitle('');
    setSubject('Mathematics');
    setDate('');
    setType('Revision');
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Exam': return 'bg-red-100 text-red-700 border-red-200';
      case 'Assignment': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-zinc-100 text-ink border-zinc-200';
    }
  };

  const subjectOptions = SUBJECTS.map(s => ({ label: s, value: s }));
  const typeOptions = [
    { label: 'Revision', value: 'Revision' },
    { label: 'Assignment', value: 'Assignment' },
    { label: 'Exam', value: 'Exam' }
  ];

  // Get study guide content - try to parse AI-generated content from notes, fallback to generated guide
  const getStudyGuide = (event: StudyEvent) => {
    // Try to parse AI-generated guide from notes (stored as JSON)
    try {
      if (event.notes && typeof event.notes === 'string') {
        // Check if notes is a JSON string
        const trimmedNotes = event.notes.trim();
        if (trimmedNotes.startsWith('{') && trimmedNotes.endsWith('}')) {
          const parsed = JSON.parse(trimmedNotes);
          // Validate that it has the required structure
          if (parsed && 
              Array.isArray(parsed.howToComplete) && parsed.howToComplete.length > 0 &&
              Array.isArray(parsed.guides) && parsed.guides.length > 0 &&
              typeof parsed.suggestions === 'string' &&
              Array.isArray(parsed.motivation) && parsed.motivation.length > 0) {
            return parsed; // Return AI-generated guide
          }
        }
      }
    } catch {
      // Notes is not valid JSON (or not a guide) — no boilerplate below.
    }

    // No boilerplate fallback: the old generated steps ("Get your X notes
    // ready…") read as filler and cheapened real AI content. Events whose
    // notes carry a structured AI guide render it; everything else shows its
    // plain-text brief (or nothing) plus the actions below.
    return null;
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">Study Planner</h1>
            <p className="text-zinc-500 text-sm sm:text-base">Organize your schedule and ace your exams.</p>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
             <button
               onClick={handleSmartScheduleClick}
               className="px-3 sm:px-4 py-2 bg-zinc-900 text-onink text-sm font-medium rounded-lg hover:opacity-90 transition-all flex items-center gap-1.5 sm:gap-2 shadow-md group"
             >
               <Sparkles size={14} className="sm:w-4 sm:h-4" /> Smart Schedule
               {!user?.isPremium && <Lock size={12} className="sm:w-3.5 sm:h-3.5 ml-0.5 opacity-80 group-hover:scale-110 transition-transform" />}
             </button>
             <button
               onClick={() => setIsManualModalOpen(true)}
               className="px-3 sm:px-4 py-2 bg-surface text-inksoft border border-zinc-200 text-sm font-medium rounded-lg hover:bg-zinc-50 transition-all flex items-center gap-1.5 sm:gap-2"
             >
               <Plus size={14} className="sm:w-4 sm:h-4" /> Add Task
             </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: Overview Cards */}
        <div className="lg:col-span-1 space-y-6">
           <div className="bg-surface p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
              <h3 className="font-bold text-ink mb-3 sm:mb-4 flex items-center gap-2">
                <Clock size={16} className="sm:w-[18px] sm:h-[18px] text-inksoft" /> Up Next
              </h3>
              {loading.studyEvents ? (
                <div className="space-y-4">
                  <TaskItemSkeleton />
                  <TaskItemSkeleton />
                  <TaskItemSkeleton />
                </div>
              ) : upcomingEvents.length > 0 ? (
                <div className="space-y-4">
                  {upcomingEvents.slice(0, 3).map(event => {
                    return (
                    <div 
                      key={event.id} 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEventClick(event.id);
                      }}
                      className={`p-3 bg-zinc-50 rounded-lg border transition-all cursor-pointer ${
                        selectedEventId === event.id 
                          ? 'border-zinc-900 shadow-md bg-zinc-100' 
                          : 'border-zinc-100 hover:border-zinc-200 hover:shadow-sm'
                      }`}
                    >
                       <div className="flex justify-between items-start mb-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${getTypeColor(event.type)}`}>
                             {event.type}
                          </span>
                          {(() => {
                            const u = getUrgency(event.date);
                            if (!u) return null;
                            return (
                              <span className="flex items-center gap-1.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${urgencyPill(u.tone)}`}>
                                  {u.label}
                                </span>
                                <span className="text-xs font-medium text-zinc-500">
                                   {new Date(String(event.date).slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                              </span>
                            );
                          })()}
                       </div>
                       <h4 className="font-semibold text-ink text-sm line-clamp-1">{event.title}</h4>
                       <p className="text-xs text-zinc-500">{event.subject}</p>
                       {(() => {
                         // Only show simple text notes, not JSON
                         if (!event.notes) return null;
                         try {
                           const trimmed = event.notes.trim();
                           if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                             return null; // It's JSON, don't display
                           }
                           return <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">{event.notes}</p>;
                         } catch {
                           return <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">{event.notes}</p>;
                         }
                       })()}
                    </div>
                  )})}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-400">
                  <p className="text-sm">No upcoming tasks.</p>
                </div>
              )}
           </div>

           <div className="bg-zinc-900 text-onink p-4 sm:p-6 rounded-xl shadow-sm relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-bold mb-1 text-sm sm:text-base">Progress Tracker</h3>
                <div className="flex items-end gap-2 mb-2">
                   <span className="text-3xl sm:text-4xl font-bold">{completedCount}</span>
                   <span className="text-zinc-400 text-xs sm:text-sm mb-1.5">tasks completed</span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                   <div
                     className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                     style={{ width: `${studyEvents.length > 0 ? (completedCount / studyEvents.length) * 100 : 0}%` }}
                   ></div>
                </div>
              </div>
              <div className="absolute top-0 right-0 p-4 sm:p-6 opacity-10">
                 <CheckCircle size={60} className="sm:w-20 sm:h-20" />
              </div>
           </div>
           
           <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 sm:p-6 rounded-xl border border-amber-100 flex items-center gap-3 sm:gap-4">
               <div className="w-9 h-9 sm:w-10 sm:h-10 bg-surface rounded-full flex items-center justify-center text-amber-500 shadow-sm border border-amber-100 flex-shrink-0">
                 <Trophy size={18} className="sm:w-5 sm:h-5" />
               </div>
               <div className="min-w-0">
                 <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">XP Reward</p>
                 <p className="text-sm text-inksoft">Complete tasks to earn up to <span className="font-bold">50 XP</span> each!</p>
               </div>
           </div>
        </div>

        {/* Right Col: Timeline */}
        <div className="lg:col-span-2 space-y-6">
           {/* View toggle: list vs calendar */}
           <div className="flex items-center gap-2">
             <div className="flex bg-zinc-100 rounded-full p-1">
               <button
                 onClick={() => setPlannerView('list')}
                 className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                   plannerView === 'list' ? 'bg-surface text-ink shadow-sm' : 'text-zinc-500 hover:text-inksoft'
                 }`}
               >
                 List
               </button>
               <button
                 onClick={() => setPlannerView('calendar')}
                 className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                   plannerView === 'calendar' ? 'bg-surface text-ink shadow-sm' : 'text-zinc-500 hover:text-inksoft'
                 }`}
               >
                 Calendar
               </button>
             </div>
             {selectedDate && (
               <button
                 onClick={() => setSelectedDate(null)}
                 className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-900 text-onink hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
               >
                 {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                 <X size={12} />
               </button>
             )}
           </div>
           {/* Filters */}
           <div className="flex items-center gap-2 pb-2 overflow-x-auto hide-scrollbar">
             <button
               onClick={() => setStatusFilter('all')}
               className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap ${
                 statusFilter === 'all'
                   ? 'bg-zinc-900 text-onink border-zinc-900'
                   : 'bg-surface text-inksoft border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               All Tasks
             </button>
             <button
               onClick={() => setStatusFilter('pending')}
               className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap ${
                 statusFilter === 'pending'
                   ? 'bg-zinc-900 text-onink border-zinc-900'
                   : 'bg-surface text-inksoft border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               Pending
             </button>
             <button
               onClick={() => setStatusFilter('completed')}
               className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap ${
                 statusFilter === 'completed'
                   ? 'bg-zinc-900 text-onink border-zinc-900'
                   : 'bg-surface text-inksoft border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               Completed
             </button>
             <button
               onClick={() => setStatusFilter('archived')}
               className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap ${
                 statusFilter === 'archived'
                   ? 'bg-zinc-900 text-onink border-zinc-900'
                   : 'bg-surface text-inksoft border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               Archived
             </button>
           </div>

           {loading.studyEvents ? (
             <div className="space-y-6">
               {[1, 2, 3].map((i) => (
                 <div key={i} className="animate-pulse">
                   <div className="h-6 bg-zinc-200 rounded w-48 mb-3"></div>
                   <div className="space-y-3">
                     <PlannerEventSkeleton />
                     <PlannerEventSkeleton />
                     <PlannerEventSkeleton />
                   </div>
                 </div>
               ))}
             </div>
            ) : plannerView === 'calendar' ? (
              <>
              <div className="bg-surface border border-zinc-200 rounded-xl shadow-sm p-3 sm:p-4 animate-fade-in">
               {/* Month navigation */}
               <div className="flex items-center justify-between mb-3">
                 <button
                   onClick={() => setCalCursor(new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1))}
                   className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-ink transition-colors"
                   aria-label="Previous month"
                 >
                   <ChevronLeft size={18} />
                 </button>
                 <h3 className="text-sm sm:text-base font-bold text-ink">
                   {calCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                 </h3>
                 <div className="flex items-center gap-1">
                   <button
                     onClick={() => { const t = new Date(); setCalCursor(new Date(t.getFullYear(), t.getMonth(), 1)); setSelectedDate(todayKey); }}
                     className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-inksoft hover:bg-zinc-100 transition-colors"
                   >
                     Today
                   </button>
                   <button
                     onClick={() => setCalCursor(new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1))}
                     className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-ink transition-colors"
                     aria-label="Next month"
                   >
                     <ChevronRight size={18} />
                   </button>
                 </div>
               </div>
               {/* Weekday header (Monday start) */}
               <div className="grid grid-cols-7 gap-1 mb-1">
                 {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                   <div key={i} className="text-center text-[10px] sm:text-xs font-bold text-zinc-400 py-1">{d}</div>
                 ))}
               </div>
               {/* Day cells */}
               <div className="grid grid-cols-7 gap-1">
                 {calendarCells.map((cell) => {
                   const isToday = cell.key === todayKey;
                   const isSelected = cell.key === selectedDate;
                   const shown = cell.events.slice(0, 3);
                   const extra = cell.events.length - shown.length;
                   return (
                     <button
                       key={cell.key}
                       onClick={() => setSelectedDate(isSelected ? null : cell.key)}
                       className={`min-h-[52px] sm:min-h-[64px] rounded-lg p-1 sm:p-1.5 text-left transition-colors flex flex-col ${
                         isSelected
                           ? 'bg-zinc-900 text-onink shadow-md'
                           : isToday
                           ? 'bg-zinc-100 ring-2 ring-zinc-900 ring-inset'
                           : cell.inMonth
                           ? 'hover:bg-zinc-50'
                           : 'opacity-40 hover:bg-zinc-50'
                       }`}
                     >
                       <span className={`text-[11px] sm:text-xs font-bold leading-none mb-1 ${
                         isSelected ? 'text-onink' : isToday ? 'text-ink' : cell.inMonth ? 'text-inksoft' : 'text-zinc-400'
                       }`}>
                         {cell.day}
                       </span>
                       <span className="flex flex-wrap gap-0.5">
                         {shown.map((e) => (
                           <span key={e.id} title={`${e.title} (${e.type})`} className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-surface' : typeDot(e.type)}`} />
                         ))}
                         {extra > 0 && (
                           <span className={`text-[10px] font-bold leading-none ${isSelected ? 'text-onink' : 'text-zinc-500'}`}>+{extra}</span>
                         )}
                       </span>
                     </button>
                   );
                 })}
               </div>
               {/* Legend */}
               <div className="flex items-center gap-3 mt-3 px-1 text-[10px] sm:text-xs text-zinc-500">
                 <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Exam</span>
                 <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Assignment</span>
                 <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-zinc-400" /> Revision</span>
                 <span className="ml-auto hidden sm:inline">Tap a day to see its plans below</span>
               </div>
             </div>
             {/* Selected day's plans, inline: no more round-tripping to List. */}
             {selectedDate && (
               <div className="mt-4 animate-fade-in">
                 <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                   Plans for {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                   <span className="text-[10px] bg-zinc-100 px-2 py-0.5 rounded-full text-zinc-400 font-medium">
                     {taskCount((groupedEvents[selectedDate] ?? []).length)}
                   </span>
                 </h3>
                 {(groupedEvents[selectedDate] ?? []).length > 0 ? (
                   <div className="space-y-3">
                     {(groupedEvents[selectedDate] ?? []).map(event => (
                       <EventCard
                         key={event.id}
                         event={event}
                         selected={selectedEventId === event.id}
                         inArchivedView={statusFilter === 'archived'}
                         completingId={isCompletingEvent}
                         archivingId={isArchivingEvent}
                         deletingId={isDeletingEvent}
                         onOpen={handleEventClick}
                         onToggleComplete={handleTaskToggle}
                         onToggleArchive={handleArchiveToggle}
                         onDelete={handleDeleteEvent}
                       />
                     ))}
                   </div>
                 ) : (
                   <p className="text-sm text-zinc-400 bg-surface border border-dashed border-zinc-200 rounded-xl px-4 py-6 text-center">
                     No tasks on this day.
                   </p>
                 )}
               </div>
             )}
              </>
            ) : Object.keys(groupedEvents).length > 0 ? (
             visibleDateKeys.map(dateKey => (
               <div key={dateKey} className="animate-slide-up">
                   <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3 sticky top-0 bg-zinc-50/95 py-2 backdrop-blur-sm z-10 flex items-center justify-between">
                     {new Date(dateKey + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                     <span className="text-[10px] bg-zinc-100 px-2 py-0.5 rounded-full text-zinc-400 font-medium">
                       {taskCount(groupedEvents[dateKey].length)}
                     </span>
                  </h3>
                  <div className="space-y-3">
                    {groupedEvents[dateKey].map(event => (
                      <EventCard
                        key={event.id}
                        event={event}
                        selected={selectedEventId === event.id}
                        inArchivedView={statusFilter === 'archived'}
                        completingId={isCompletingEvent}
                        archivingId={isArchivingEvent}
                        deletingId={isDeletingEvent}
                        onOpen={handleEventClick}
                        onToggleComplete={handleTaskToggle}
                        onToggleArchive={handleArchiveToggle}
                        onDelete={handleDeleteEvent}
                      />
                    ))}
                  </div>
               </div>
             ))
           ) : (
             <div className="flex flex-col items-center justify-center py-12 sm:py-20 bg-surface border border-dashed border-zinc-200 rounded-xl text-center px-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-3 sm:mb-4">
                   <CalendarDays size={24} className="sm:w-8 sm:h-8 text-zinc-300" />
                </div>
                <h3 className="font-bold text-ink text-sm sm:text-base">Your schedule is empty</h3>
                <p className="text-zinc-500 text-xs sm:text-sm max-w-xs mx-auto mt-2 px-2">
                  {statusFilter === 'all'
                    ? 'Add tasks manually or use our AI to generate a personalized study plan.'
                    : `No ${statusFilter} tasks found.`}
                </p>
                {statusFilter === 'all' && (
                  <button
                    onClick={handleSmartScheduleClick}
                    className="mt-4 sm:mt-6 text-xs sm:text-sm font-medium text-ink hover:text-ink hover:underline flex items-center justify-center gap-1 mx-auto"
                  >
                    {!user?.isPremium && <Lock size={10} className="sm:w-3 sm:h-3" />} Generate Plan with AI
                  </button>
                )}
             </div>
           )}
        </div>
      </div>

      {/* Manual Add Modal */}
      <Dialog
        open={isManualModalOpen && mounted}
        onClose={() => setIsManualModalOpen(false)}
        label="Add Study Task"
      >
            <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 rounded-t-xl">
               <h3 className="font-bold text-ink text-sm sm:text-base">Add Study Task</h3>
               <button onClick={() => setIsManualModalOpen(false)} className="p-1 text-zinc-400 hover:text-ink rounded hover:bg-zinc-200">
                 <X size={18} className="sm:w-5 sm:h-5" />
               </button>
            </div>
            <form onSubmit={handleAddManual} className="p-4 sm:p-6 space-y-4">
               <div>
                  <label className="block text-xs font-semibold text-inksoft mb-1.5">Task Title</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Algebra Chapter 1 Review"
                    className="w-full px-3 py-2 bg-surface border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-inksoft mb-1.5">Subject</label>
                    <CustomSelect 
                      options={subjectOptions}
                      value={subject}
                      onChange={setSubject}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-inksoft mb-1.5">Type</label>
                    <CustomSelect
                      options={typeOptions}
                      value={type}
                      onChange={(value) => setType(value as 'Revision' | 'Exam' | 'Assignment')}
                    />
                  </div>
               </div>
               <div>
                  <label className="block text-xs font-semibold text-inksoft mb-1.5">Date</label>
                  <DatePicker 
                    value={date}
                    onChange={setDate}
                    required
                    placeholder="Select Date"
                  />
               </div>
               <button
                 type="submit"
                 disabled={isAdding}
                 className="w-full py-3 sm:py-2.5 bg-zinc-900 text-onink font-medium rounded-lg hover:bg-zinc-800 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
               >
                 {isAdding ? (
                   <>
                     <Loader2 size={16} className="animate-spin" />
                     Adding...
                   </>
                 ) : (
                   'Add to Schedule'
                 )}
               </button>
            </form>
      </Dialog>

      {/* AI Generate Modal */}
      <Dialog
        open={isAIModalOpen && mounted}
        onClose={() => setIsAIModalOpen(false)}
        label="Generate smart schedule"
      >
            <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 rounded-t-xl">
               <h3 className="font-bold text-ink flex items-center gap-2 text-sm sm:text-base">
                 <Sparkles size={16} className="sm:w-[18px] sm:h-[18px] text-inksoft" /> Smart Schedule
               </h3>
               <button onClick={() => setIsAIModalOpen(false)} className="p-1 text-zinc-400 hover:text-ink rounded hover:bg-zinc-200">
                 <X size={18} className="sm:w-5 sm:h-5" />
               </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
               <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-lg flex gap-3">
                  <BookOpen className="text-inksoft flex-shrink-0 mt-0.5" size={18} />
                  <p className="text-xs text-ink leading-relaxed">
                    Tell us what exams or assignments you have coming up. Our AI will generate a balanced study plan for you, distributing revision sessions logically before your deadlines.
                  </p>
               </div>
               
               <div>
                  <label className="block text-xs font-semibold text-inksoft mb-1.5">Your Goal / Deadlines</label>
                  <textarea 
                    rows={4}
                    placeholder="e.g. I have a Math exam on Quadratic Equations next Friday, and a Physics test on Newton's Laws next Monday. I want to study 2 hours a day."
                    className="w-full px-3 py-2 bg-surface border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-500 resize-none"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                  />
               </div>

               <button
                 onClick={handleGenerateAI}
                 disabled={isGenerating || !aiPrompt.trim()}
                 className="w-full py-3.5 sm:py-3 bg-zinc-900 text-onink font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
               >
                 {isGenerating ? (
                   <>
                     <Loader2 size={16} className="animate-spin" />
                     {generateElapsed < 8 ? 'Understanding your deadlines...' :
                      generateElapsed < 20 ? 'Writing daily study guides...' :
                      generateElapsed < 40 ? 'Scheduling sessions...' :
                      'Almost there...'} {generateElapsed >= 3 && <span className="tabular-nums opacity-70">({generateElapsed}s)</span>}
                   </>
                 ) : (
                   <>
                     <Sparkles size={16} /> Generate Schedule
                   </>
                 )}
               </button>
            </div>
      </Dialog>

      {/* Study Guide Tooltip - Shows on click */}
      {selectedEventId && (() => {
        const event = studyEvents.find(e => e.id === selectedEventId);
        if (!event) return null;

        // Structured AI guide (JSON notes) or nothing — the boilerplate
        // fallback is gone, so a missing guide renders no filler.
        const guide = getStudyGuide(event);
        const hasGuide = !!guide && Array.isArray(guide.howToComplete) && guide.howToComplete.length > 0;
        // Plain-text session brief = the real AI note. JSON guides hide
        // their raw payload (it renders structured above instead).
        const plainNotes = (() => {
          if (!event.notes || typeof event.notes !== 'string') return null;
          const t = event.notes.trim();
          if (!t || (t.startsWith('{') && t.endsWith('}'))) return null;
          return event.notes;
        })();
        const urgency = getUrgency(event.date);
        const fullDate = (() => {
          const d = new Date(String(event.date).slice(0, 10) + 'T00:00:00');
          return isNaN(d.getTime())
            ? null
            : d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
        })();
        const busy = isCompletingEvent === event.id || isDeletingEvent === event.id || isArchivingEvent === event.id;
        
        // Centered dialog on every viewport: one backdrop, one panel, no
        // measuring. Escape and backdrop clicks share closeTooltip.
        return createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label={event.title}
          >
            <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={closeTooltip} />
            <div
              className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar bg-surface rounded-2xl shadow-2xl border border-zinc-200 animate-slide-up"
            >
              
              {/* Header: identity + WHEN (the old panel never showed the date) */}
              <div className="p-5 rounded-t-2xl bg-zinc-900 relative">
                <button
                  onClick={closeTooltip}
                  className="absolute top-4 right-4 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-onink transition-colors"
                  aria-label="Close details"
                >
                  <X size={18} />
                </button>
                <div className="flex items-start gap-3 pr-10">
                  <div className="p-2.5 rounded-xl bg-surface text-ink flex-shrink-0">
                    {event.type === 'Exam' ? <Target size={20} /> :
                     event.type === 'Assignment' ? <BookOpen size={20} /> :
                     <TrendingUp size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-onink text-lg leading-tight">{event.title}</h4>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-400">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${subjectColor(event.subject)}`} aria-hidden />
                      <span className="font-medium">{event.subject}</span>
                      <span aria-hidden>•</span>
                      <span>{fullDate ?? 'No date set'}</span>
                      {urgency && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${urgencyPill(urgency.tone)}`}>
                          {urgency.label}
                        </span>
                      )}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-200">
                        {event.type}
                      </span>
                      {event.isCompleted && (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300">
                          Completed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* Session brief: the event's own note (real AI content). */}
                {plainNotes && (
                  <div>
                    <h5 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">Session brief</h5>
                    <p className="text-sm text-inksoft leading-relaxed bg-zinc-50 border border-zinc-200 rounded-xl p-3.5">
                      <MarkdownInline content={plainNotes} />
                    </p>
                  </div>
                )}

                {/* Structured AI guide — only when the notes carry one. */}
                {hasGuide && (
                  <div>
                    <h5 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">How to complete this plan</h5>
                    <div className="space-y-2">
                      {guide.howToComplete.map((step: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-900 text-onink text-[11px] font-bold flex items-center justify-center mt-0.5">
                            {idx + 1}
                          </div>
                          <p className="text-sm text-inksoft leading-relaxed flex-1"><MarkdownInline content={step} /></p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {hasGuide && Array.isArray(guide.guides) && guide.guides.length > 0 && (
                  <div>
                    <h5 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">Quick tips</h5>
                    <div className="space-y-2">
                      {guide.guides.map((item: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2.5 p-2.5 bg-zinc-50 rounded-xl border border-zinc-200">
                          <Lightbulb size={14} className="flex-shrink-0 mt-0.5 text-amber-500" />
                          <p className="text-sm text-inksoft leading-relaxed flex-1"><MarkdownInline content={item} /></p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {hasGuide && typeof guide.suggestions === 'string' && guide.suggestions && (
                  <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Suggestion</p>
                    <p className="text-sm text-inksoft leading-relaxed"><MarkdownInline content={guide.suggestions} /></p>
                  </div>
                )}

                {/* Actions: the list card has these — the detail view finally does too. */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-200">
                  <button
                    onClick={() => handleTaskToggle(event.id, event.isCompleted)}
                    disabled={busy}
                    className={`mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                      event.isCompleted
                        ? 'bg-zinc-100 text-inksoft hover:bg-zinc-200'
                        : 'bg-zinc-900 text-onink hover:opacity-90'
                    }`}
                  >
                    {isCompletingEvent === event.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : event.isCompleted ? (
                      <Circle size={16} />
                    ) : (
                      <CheckCircle size={16} />
                    )}
                    {event.isCompleted ? 'Mark pending' : 'Mark complete'}
                  </button>
                  <button
                    onClick={() => handleArchiveToggle(event.id, event.isArchived)}
                    disabled={busy}
                    className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-zinc-100 text-inksoft hover:bg-zinc-200 transition-colors disabled:opacity-50"
                  >
                    {isArchivingEvent === event.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : event.isArchived ? (
                      <ArchiveRestore size={16} />
                    ) : (
                      <Archive size={16} />
                    )}
                    {event.isArchived ? 'Unarchive' : 'Archive'}
                  </button>
                  <button
                    onClick={() => handleDeleteEvent(event.id)}
                    disabled={busy}
                    className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 ml-auto"
                  >
                    {isDeletingEvent === event.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

    </div>
  );
};

export default Planner;
