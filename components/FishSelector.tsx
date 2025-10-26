'use client';

import clsx from 'clsx';
import type { ChangeEvent, KeyboardEvent } from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FishSpecies,
  filterFishSpecies,
  fishSpecies,
  normalizeFishName,
  sortSpeciesByName,
} from '@/lib/fishSpecies';

const ITEM_HEIGHT = 40;
const LIST_HEIGHT = 240;
const OVERSCAN = 4;

type FishSelectorOption =
  | { type: 'species'; species: FishSpecies }
  | { type: 'manual'; value: string };

export interface FishSelectorProps {
  value: string;
  onSelect: (name: string) => void;
  speciesList?: FishSpecies[];
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

const getManualOption = (query: string, options: FishSelectorOption[]): FishSelectorOption | null => {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const normalizedQuery = normalizeFishName(trimmed);
  const hasExactMatch = options.some((option) => {
    if (option.type === 'manual') {
      return normalizeFishName(option.value) === normalizedQuery;
    }
    const aliases = [option.species.name, ...option.species.aliases];
    return aliases.some((alias) => normalizeFishName(alias) === normalizedQuery);
  });

  return hasExactMatch ? null : { type: 'manual', value: trimmed };
};

const buildOptions = (
  query: string,
  list: FishSpecies[],
  base: FishSpecies[],
): FishSelectorOption[] => {
  const filtered = query ? filterFishSpecies(query, list) : sortSpeciesByName(list);
  const speciesOptions = filtered.map((species) => ({ type: 'species', species })) as FishSelectorOption[];
  const fallbackManual = getManualOption(query, speciesOptions);

  if (fallbackManual) {
    speciesOptions.push(fallbackManual);
  }

  if (!query && !speciesOptions.length) {
    return base.map((species) => ({ type: 'species', species }));
  }

  return speciesOptions;
};

export default function FishSelector({
  value,
  onSelect,
  speciesList = fishSpecies,
  placeholder = 'Search species…',
  disabled,
  autoFocus,
}: FishSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? '');
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  useEffect(() => {
    setQuery(value ?? '');
  }, [value]);

  const options = useMemo(() => {
    const sortedSpecies = sortSpeciesByName(speciesList);
    return buildOptions(query, sortedSpecies, sortedSpecies);
  }, [query, speciesList]);

  const totalHeight = options.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(options.length, startIndex + Math.ceil(LIST_HEIGHT / ITEM_HEIGHT) + OVERSCAN * 2);
  const visibleOptions = options.slice(startIndex, endIndex);
  const offsetY = startIndex * ITEM_HEIGHT;

  useEffect(() => {
    if (!open) return;
    setActiveIndex(options.length ? 0 : -1);
    setScrollTop(0);
    listRef.current?.scrollTo({ top: 0 });
  }, [open, options.length, query]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list || activeIndex < 0) return;

    const viewTop = list.scrollTop;
    const viewBottom = viewTop + LIST_HEIGHT;
    const optionTop = activeIndex * ITEM_HEIGHT;
    const optionBottom = optionTop + ITEM_HEIGHT;

    if (optionTop < viewTop) {
      list.scrollTop = optionTop;
    } else if (optionBottom > viewBottom) {
      list.scrollTop = optionBottom - LIST_HEIGHT;
    }
  }, [activeIndex, open]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    setScrollTop(listRef.current.scrollTop);
  }, []);

  const handleFocus = useCallback(() => {
    if (disabled) return;
    setOpen(true);
  }, [disabled]);

  const commitSelection = useCallback(
    (option: FishSelectorOption) => {
      if (option.type === 'species') {
        onSelect(option.species.name);
        setQuery(option.species.name);
      } else {
        onSelect(option.value);
        setQuery(option.value);
      }
      setOpen(false);
      setTimeout(() => inputRef.current?.blur(), 0);
    },
    [onSelect],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (!open) return;
      if (!options.length) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, options.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const option = options[activeIndex];
        if (option) {
          commitSelection(option);
        } else if (query.trim()) {
          commitSelection({ type: 'manual', value: query.trim() });
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        setQuery(value);
      }
    },
    [activeIndex, commitSelection, open, options, query, value],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
      if (!open) {
        setOpen(true);
      }
    },
    [open],
  );

  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      const containsFocus = containerRef.current?.contains(document.activeElement);
      if (!containsFocus) {
        setOpen(false);
        const trimmed = query.trim();
        if (trimmed !== value) {
          onSelect(trimmed);
        }
      }
    });
  }, [onSelect, query, value]);

  const renderOption = useCallback(
    (option: FishSelectorOption, index: number) => {
      const globalIndex = startIndex + index;
      const isActive = open && globalIndex === activeIndex;

      if (option.type === 'manual') {
        return (
          <li
            key={`manual-${option.value}`}
            role="option"
            aria-selected={isActive}
            className={clsx(
              'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-white/90',
              isActive ? 'bg-brand-500/30 text-white' : 'hover:bg-white/10',
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commitSelection(option)}
          >
            Use “{option.value}”
            <span className="text-xs text-white/50">(manual entry)</span>
          </li>
        );
      }

      return (
        <li
          key={option.species.id}
          role="option"
          aria-selected={isActive}
          data-active={isActive || undefined}
          className={clsx(
            'flex cursor-pointer items-center justify-between px-3 py-2 text-sm',
            isActive ? 'bg-brand-500/30 text-white' : 'text-white/90 hover:bg-white/10',
          )}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => commitSelection(option)}
        >
          <span>{option.species.name}</span>
          {option.species.aliases.length > 0 && (
            <span className="text-xs text-white/50">{option.species.aliases[0]}</span>
          )}
        </li>
      );
    },
    [activeIndex, commitSelection, open, startIndex],
  );

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        className="input pr-8"
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/40">⌄</span>
      {open && (
        <div
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-slate-950/95 shadow-xl backdrop-blur"
        >
          {options.length ? (
            <div
              ref={listRef}
              role="listbox"
              id={listboxId}
              aria-label="Fish species"
              className="max-h-60 overflow-y-auto"
              onScroll={handleScroll}
            >
              <div style={{ height: totalHeight, position: 'relative' }}>
                <ul className="divide-y divide-white/5" style={{ transform: `translateY(${offsetY}px)` }}>
                  {visibleOptions.map((option, index) => renderOption(option, index))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-white/60">
              No species found. Press Enter to use “{query.trim()}”.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
