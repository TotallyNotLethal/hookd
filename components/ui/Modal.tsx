'use client';

import clsx from 'clsx';
import { ReactNode, useEffect, useRef } from 'react';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  describedBy?: string;
  overlayClassName?: string;
  contentClassName?: string;
  children: ReactNode;
};

export default function Modal({
  open,
  onClose,
  labelledBy,
  describedBy,
  overlayClassName,
  contentClassName,
  children,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = requestAnimationFrame(() => {
      const node = contentRef.current;
      if (!node) {
        return;
      }
      const focusableElements = Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, details, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('aria-hidden'));

      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        node.focus();
      }
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(frame);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const node = contentRef.current;
    if (!node) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, details, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('aria-hidden'));

      if (focusableElements.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!current || current === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (!current || current === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    node.addEventListener('keydown', handleKeyDown);

    return () => {
      node.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={clsx(
        'fixed inset-x-0 top-[var(--nav-height)] bottom-[var(--mobile-nav-height)] z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6',
        overlayClassName,
      )}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        ref={contentRef}
        tabIndex={-1}
        className={clsx(
          'max-h-[90vh] max-h-[calc(100vh-var(--nav-height)-var(--mobile-nav-height)-2rem)] sm:max-h-[calc(100vh-var(--nav-height)-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/40 focus:outline-none',
          contentClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
