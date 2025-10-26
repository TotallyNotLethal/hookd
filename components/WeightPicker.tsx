'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';

export type WeightValue = { pounds: number; ounces: number };

interface WeightPickerProps {
  value: WeightValue;
  onChange: (value: WeightValue) => void;
  maxPounds?: number;
  maxOunces?: number;
}

const createRange = (max: number) => Array.from({ length: max + 1 }, (_, index) => index);

function useSyncedScroll(
  options: number[],
  selected: number,
  onSelect: (value: number) => void,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isUserScrolling = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const item = container.querySelector<HTMLDivElement>(`[data-value="${selected}"]`);
    if (!item) return;
    const top = item.offsetTop - container.clientHeight / 2 + item.clientHeight / 2;
    container.scrollTo({ top, behavior: isUserScrolling.current ? 'auto' : 'smooth' });
  }, [selected]);

  useEffect(() => () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    isUserScrolling.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  timeoutRef.current = setTimeout(() => {
    const { scrollTop, clientHeight } = container;
    const center = scrollTop + clientHeight / 2;
    let closestValue = selected;
    let minDelta = Number.POSITIVE_INFINITY;
    options.forEach((option) => {
      const item = container.querySelector<HTMLDivElement>(`[data-value="${option}"]`);
      if (!item) return;
      const itemCenter = item.offsetTop + item.clientHeight / 2;
      const delta = Math.abs(itemCenter - center);
      if (delta < minDelta) {
        minDelta = delta;
        closestValue = option;
      }
    });
    isUserScrolling.current = false;
    if (closestValue !== selected) {
      onSelect(closestValue);
    } else {
      const item = container.querySelector<HTMLDivElement>(`[data-value="${closestValue}"]`);
      if (item) {
        const top = item.offsetTop - clientHeight / 2 + item.clientHeight / 2;
        container.scrollTo({ top, behavior: 'smooth' });
      }
    }
  }, 80);
}, [onSelect, options, selected]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        const currentIndex = options.indexOf(selected);
        const nextIndex = Math.min(Math.max(currentIndex + direction, 0), options.length - 1);
        onSelect(options[nextIndex]);
      } else if (event.key === 'Home') {
        event.preventDefault();
        onSelect(options[0]);
      } else if (event.key === 'End') {
        event.preventDefault();
        onSelect(options[options.length - 1]);
      } else if (event.key === 'PageUp' || event.key === 'PageDown') {
        event.preventDefault();
        const direction = event.key === 'PageUp' ? -5 : 5;
        const currentIndex = options.indexOf(selected);
        const nextIndex = Math.min(Math.max(currentIndex + direction, 0), options.length - 1);
        onSelect(options[nextIndex]);
      }
    },
    [onSelect, options, selected],
  );

  return {
    containerRef,
    handleScroll,
    handleKeyDown,
  } as const;
}

interface ColumnProps {
  label: string;
  options: number[];
  value: number;
  onChange: (value: number) => void;
}

function PickerColumn({ label, options, value, onChange }: ColumnProps) {
  const { containerRef, handleScroll, handleKeyDown } = useSyncedScroll(options, value, onChange);

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-white/60">{label}</span>
      <div className="relative h-40 w-full">
        <div
          ref={containerRef}
          tabIndex={0}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          className="input h-full overflow-y-auto scroll-smooth snap-y snap-mandatory focus:outline-none"
          role="listbox"
          aria-label={label}
        >
          <div className="pointer-events-none h-12" aria-hidden />
          {options.map((option) => (
            <div
              key={option}
              role="option"
              data-value={option}
              aria-selected={option === value}
              className={`snap-center h-10 flex items-center justify-center text-sm transition-colors ${
                option === value ? 'text-white font-medium' : 'text-white/60'
              }`}
            >
              {option}
            </div>
          ))}
          <div className="pointer-events-none h-12" aria-hidden />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-y border-white/20" aria-hidden />
      </div>
    </div>
  );
}

export default function WeightPicker({ value, onChange, maxPounds = 50, maxOunces = 15 }: WeightPickerProps) {
  const poundOptions = useMemo(() => createRange(maxPounds), [maxPounds]);
  const ounceOptions = useMemo(() => createRange(maxOunces), [maxOunces]);

  const handlePoundsChange = useCallback(
    (pounds: number) => {
      onChange({ pounds, ounces: value.ounces });
    },
    [onChange, value.ounces],
  );

  const handleOuncesChange = useCallback(
    (ounces: number) => {
      onChange({ pounds: value.pounds, ounces });
    },
    [onChange, value.pounds],
  );

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3" role="group">
      <div className="grid grid-cols-2 gap-4">
        <PickerColumn label="Pounds" options={poundOptions} value={value.pounds} onChange={handlePoundsChange} />
        <PickerColumn label="Ounces" options={ounceOptions} value={value.ounces} onChange={handleOuncesChange} />
      </div>
    </div>
  );
}
