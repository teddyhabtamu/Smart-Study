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

// Dismissal is timestamp-based: a dismissed prompt returns after 7 days
// instead of never (users change their mind) or every visit (nagging).
const PROMPT_DISMISSED_KEY = 'smartstudy_install_prompt_dismissed';
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const readDismissedAt = (): number => {
  try {
    return Number(localStorage.getItem(PROMPT_DISMISSED_KEY) || 0);
  } catch {
    return 0;
  }
};

const writeDismissedNow = (): void => {
  try {
    localStorage.setItem(PROMPT_DISMISSED_KEY, String(Date.now()));
  } catch {
    // ignore
  }
};

const VISITS_KEY = 'smartstudy_visit_count';
const readVisits = (): number => {
  try {
    return Number(localStorage.getItem(VISITS_KEY) || 0);
  } catch {
    return 0;
  }
};

// High-visibility install prompt: bottom sheet on phones, floating card on
// desktop. Timing rules (anti-annoyance by design):
// - never on first paint (30s first visit, 10s returning)
// - dismissed → silent for 7 days
// - installed → never again
// QA override: append ?pwa=preview to force-show immediately (native action
// when the browser fired beforeinstallprompt, manual steps otherwise).
const isPreviewForced = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).get('pwa') === 'preview';
  } catch {
    return false;
  }
};

export const InstallPrompt: React.FC = () => {
  const { installable, installed, promptInstall, isIos } = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [canShow, setCanShow] = useState(false);
  const [preview] = useState<boolean>(() => isPreviewForced());

  useEffect(() => {
    if (preview) {
      setCanShow(true);
      return;
    }
    // Count this visit, then schedule the prompt
    let visits = readVisits();
    try {
      localStorage.setItem(VISITS_KEY, String(visits + 1));
    } catch {
      // ignore
    }
    const delay = visits >= 1 ? 10000 : 30000;
    const timer = setTimeout(() => setCanShow(true), delay);
    return () => clearTimeout(timer);
  }, [preview]);

  useEffect(() => {
    if (installed || !canShow) return;
    if (!preview) {
      if (Date.now() - readDismissedAt() < PROMPT_COOLDOWN_MS) return;
      // Only ever show when installation is actually possible
      if (!installable && !isIos) return;
    }
    setVisible(true);
  }, [installed, canShow, installable, isIos, preview]);

  if (!visible || installed) return null;
  // iOS branch needs no prompt object; Chromium branch needs it
  // (preview mode bypasses the capability gate for QA)
  if (!installable && !isIos && !preview) return null;

  const dismiss = () => {
    writeDismissedNow();
    setVisible(false);
  };

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const accepted = await promptInstall();
      if (accepted) {
        setVisible(false);
        return;
      }
      // Declined native dialog — treat like a dismissal (cooldown applies)
      dismiss();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div
      className="fixed z-[80] inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96 animate-slide-up"
      role="dialog"
      aria-label="Install SmartStudy app"
    >
      <div className="bg-zinc-900 text-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-zinc-800 p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-3">
          <img
            src="/icon-192.png"
            alt=""
            className="w-11 h-11 rounded-xl flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm sm:text-base">Install SmartStudy</p>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Faster loads, works offline, one tap from your home screen.
            </p>
          </div>
          <button
            onClick={dismiss}
            className="text-zinc-500 hover:text-white p-1 -m-1 flex-shrink-0"
            aria-label="Dismiss install prompt"
          >
            <X size={16} />
          </button>
        </div>

        {installable ? (
          <button
            onClick={handleInstall}
            disabled={installing}
            className="mt-3 w-full py-2.5 bg-amber-400 text-zinc-900 font-bold rounded-xl hover:bg-amber-300 transition-colors disabled:opacity-70 text-sm flex items-center justify-center gap-2"
          >
            <Download size={16} />
            {installing ? 'Installing…' : 'Install app'}
          </button>
        ) : (
          <ol className="mt-3 space-y-1.5 text-xs sm:text-sm text-zinc-300 list-none bg-white/5 rounded-xl p-3">
            <li className="flex items-center gap-1.5">
              1. Tap
              <Share size={13} className="text-zinc-400 flex-shrink-0" />
              Share below
            </li>
            <li>2. Choose “Add to Home Screen”</li>
          </ol>
        )}
      </div>
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
