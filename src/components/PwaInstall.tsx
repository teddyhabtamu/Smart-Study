import React, { useState, useEffect, useCallback } from 'react';
import { Download, Share, X } from 'lucide-react';

// True on iPhones/iPads (any browser — all iOS browsers are WebKit and none
// support programmatic PWA install; users must use Share → Add to Home Screen).
const isIosDevice = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1));

const isStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as any)?.standalone === true);

// Captures the PWA install prompt event so the UI can offer installation
// on its own terms (instead of the browser's auto mini-infobar).
// Returns { installable, installed, promptInstall }.
export const usePwaInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());
  const [isIos] = useState<boolean>(() => isIosDevice());

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

  return { installable: !!deferredPrompt && !installed, installed, promptInstall, isIos };
};

// Sidebar row offering app installation. Renders nothing unless useful:
// - Chromium (Android/desktop): native install button when beforeinstallprompt fires.
// - iOS Safari/Chrome: manual steps card (Apple gives no install API), dismissible.
const IOS_HINT_KEY = 'smartstudy_ios_install_dismissed';

export const InstallAppRow: React.FC<{ collapsed?: boolean; onNavigate?: () => void }> = ({
  collapsed = false,
  onNavigate,
}) => {
  const { installable, installed, promptInstall, isIos } = usePwaInstall();
  const [installing, setInstalling] = useState(false);
  const [iosDismissed, setIosDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(IOS_HINT_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (installed) return null;

  if (installable) {
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
  }

  // iOS: no install API exists — show the two-tap manual path instead.
  // (Skipped in collapsed icon-only mode where the card can't fit.)
  if (isIos && !iosDismissed && !collapsed) {
    const dismiss = () => {
      setIosDismissed(true);
      try {
        localStorage.setItem(IOS_HINT_KEY, '1');
      } catch {
        // ignore
      }
    };
    return (
      <div className="px-3 pb-2">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-zinc-900">Install SmartStudy</p>
            <button
              onClick={dismiss}
              className="text-zinc-400 hover:text-zinc-700 p-0.5 -m-0.5"
              aria-label="Dismiss install hint"
            >
              <X size={14} />
            </button>
          </div>
          {!collapsed && (
            <ol className="mt-1.5 space-y-1 text-[11px] text-zinc-600 list-none">
              <li className="flex items-center gap-1.5">
                1. Tap
                <Share size={12} className="text-zinc-500 flex-shrink-0" />
                Share below
              </li>
              <li>2. Choose “Add to Home Screen”</li>
            </ol>
          )}
        </div>
      </div>
    );
  }

  return null;
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
