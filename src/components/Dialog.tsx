import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog (rendered as aria-label). Required: every
      dialog must announce what it is. */
  label: string;
  describedBy?: string;
  size?: 'sm' | 'md' | 'lg' | '3xl' | 'xl' | 'wide';
  /** 'top' renders command-palette style (high on screen); 'bottom' renders a
      mobile bottom sheet; default centers. */
  align?: 'center' | 'top' | 'bottom';
  zIndex?: number;
  /** Backdrop click + Escape close the dialog. False for required actions
      (e.g. mid-payment confirmations) — the caller must provide a way out. */
  dismissible?: boolean;
  /** Element to focus on open. Defaults to the first focusable control. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  panelClassName?: string;
  children: React.ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  '3xl': 'max-w-3xl',
  wide: 'max-w-xl',
  xl: 'max-w-4xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Module-level depth counter: stacked dialogs (detail → apply) lock the body
// once and release only when the last one closes.
let openDialogCount = 0;
let originalBodyOverflow: string | null = null;

// ---------------------------------------------------------------------------
// Dialog: the single accessible modal primitive. Replaces ~20 hand-rolled
// `fixed inset-0` divs that had no role, no Esc, no focus trap, no initial
// focus and no focus return — keyboard and screen-reader users were stranded
// in every pay/post/plan flow. Content stays fully caller-controlled; this
// owns only the overlay mechanics (portal, semantics, trap, Esc, scroll).
// ---------------------------------------------------------------------------
const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  label,
  describedBy,
  size = 'md',
  align = 'center',
  zIndex = 200,
  dismissible = true,
  initialFocusRef,
  panelClassName = '',
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const settledRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open) return;

    // Capture the trigger for focus return. Runs on the open transition
    // (and on mount-when-already-open: the activating click focused it).
    triggerRef.current = document.activeElement;
    settledRef.current = false;

    if (openDialogCount === 0) {
      originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogCount += 1;

    // Focus after paint so the panel and its controls exist.
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        (initialFocusRef?.current as HTMLElement | null) ??
        (panel.querySelector(FOCUSABLE) as HTMLElement | null) ??
        panel;
      target.focus({ preventScroll: true });
      settledRef.current = true;
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Non-dismissible dialogs (required actions) keep Esc trapped too —
        // the caller must provide an explicit way out.
        if (!dismissibleRef.current) return;
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)) as HTMLElement[];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0 && originalBodyOverflow !== null) {
        document.body.style.overflow = originalBodyOverflow;
        originalBodyOverflow = null;
      }
      // Return focus where the user was — but never to a node that is gone
      // (e.g. trigger unmounted while open) or back into the closing panel.
      const trigger = triggerRef.current as HTMLElement | null;
      if (trigger && document.contains(trigger) && !panelRef.current?.contains(trigger)) {
        trigger.focus({ preventScroll: true });
      }
      triggerRef.current = null;
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  const wrapperAlign =
    align === 'top'
      ? 'items-start justify-center pt-[15vh] px-4'
      : align === 'bottom'
        ? 'items-end justify-center'
        : 'items-center justify-center p-4';
  const panelShape =
    align === 'bottom'
      ? 'rounded-t-2xl w-full max-h-[80vh]'
      : `rounded-xl ${SIZE_CLASSES[size]} max-h-[90vh]`;

  return createPortal(
    <div
      className={`fixed inset-0 flex ${wrapperAlign} bg-zinc-900/50 backdrop-blur-sm animate-fade-in`}
      style={{ zIndex }}
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`bg-surface shadow-2xl w-full relative animate-slide-up flex flex-col overflow-hidden outline-none ${panelShape} ${panelClassName}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

export default Dialog;
