import React, { useState, useEffect, useCallback } from 'react';
import { Download } from 'lucide-react';

// Captures the PWA install prompt event so the UI can offer installation
// on its own terms (instead of the browser's auto mini-infobar).
// Returns { installable, installed, promptInstall }.
export const usePwaInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any)?.standalone === true)
  );

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [deferredPrompt]);

  return { installable: !!deferredPrompt && !installed, installed, promptInstall };
};

// Sidebar row offering app installation. Renders nothing unless the browser
// fires beforeinstallprompt (and the app isn't installed already).
export const InstallAppRow: React.FC<{ collapsed?: boolean; onNavigate?: () => void }> = ({
  collapsed = false,
  onNavigate,
}) => {
  const { installable, promptInstall } = usePwaInstall();
  const [installing, setInstalling] = useState(false);

  if (!installable) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
      onNavigate?.();
    }
  };

  return (
    <div className="px-3 pb-2">
      <button
        onClick={handleInstall}
        disabled={installing}
        title={collapsed ? 'Install app' : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-70 ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <Download size={18} className="flex-shrink-0" />
        {!collapsed && <span>{installing ? 'Installing…' : 'Install app'}</span>}
      </button>
      {!collapsed && (
        <p className="px-3 pt-1.5 text-[11px] text-zinc-400">Faster loads, works offline, home-screen icon.</p>
      )}
    </div>
  );
};

// Slim banner shown when the browser reports no connectivity.
export const OfflineBanner: React.FC = () => {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="bg-amber-500 text-zinc-900 text-center text-xs sm:text-sm font-semibold px-4 py-2 sticky top-0 z-[60]">
      You're offline — showing your saved library. New content needs a connection.
    </div>
  );
};
