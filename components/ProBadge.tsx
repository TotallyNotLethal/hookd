'use client';

import { Sparkles } from 'lucide-react';
import clsx from 'clsx';

export default function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-300',
        className,
      )}
    >
      <Sparkles aria-hidden className="h-3.5 w-3.5" />
      <span aria-hidden>Pro</span>
      <span className="sr-only">Pro</span>
    </span>
  );
}
