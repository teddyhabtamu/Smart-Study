import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Global toast dispatcher - allows components outside ToastProvider to trigger toasts
let globalToastDispatcher: ((message: string, type?: ToastType) => void) | null = null;

export const dispatchToast = (message: string, type: ToastType = 'info') => {
  if (globalToastDispatcher) {
    globalToastDispatcher(message, type);
  } else {
    // Fallback: use custom event if dispatcher not ready
    const event = new CustomEvent('show-toast', {
      detail: { message, type }
    });
    window.dispatchEvent(event);
  }
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto remove after 5 seconds for warnings/errors, 3 seconds for others
    const duration = (type === 'warning' || type === 'error') ? 5000 : 3000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  // Set up global dispatcher when component mounts
  React.useEffect(() => {
    globalToastDispatcher = addToast;
    // Also set on window for easier access
    (window as any).__toastDispatcher = addToast;
    return () => {
      globalToastDispatcher = null;
      delete (window as any).__toastDispatcher;
    };
  }, [addToast]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Listen for custom events from AuthContext (which is outside ToastProvider)
  React.useEffect(() => {
    const handleShowToast = (event: CustomEvent) => {
      const { message, type } = event.detail;
      addToast(message, type || 'info');
    };

    window.addEventListener('show-toast', handleShowToast as EventListener);
    return () => {
      window.removeEventListener('show-toast', handleShowToast as EventListener);
    };
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Mobile: stretch full-width with page margins (the old right-4 +
          min-w-[300px] overflowed 320px viewports). role=status + aria-live so
          screen readers announce mutations (likes, bookmarks, quiz XP) that
          otherwise happen silently. Errors use role=alert for assertive
          announcement. */}
      <div
        className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg bg-white border border-zinc-200 animate-slide-up sm:min-w-[300px] sm:max-w-sm"
          >
            {toast.type === 'success' && <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />}
            {toast.type === 'error' && <AlertCircle size={18} className="text-red-500 flex-shrink-0" />}
            {toast.type === 'warning' && <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />}
            {toast.type === 'info' && <Info size={18} className="text-indigo-500 flex-shrink-0" />}
            
            <p className="text-sm font-medium text-zinc-900 flex-1">{toast.message}</p>
            
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="relative text-zinc-400 hover:text-zinc-600 transition-colors p-1 after:absolute after:-inset-2 after:content-['']"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};