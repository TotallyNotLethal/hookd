'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, Trash2 } from 'lucide-react';

import { db } from '@/lib/firebaseClient';

export type CatchPreview = {
  id: string;
  species?: string | null;
  caughtAt?: string | null;
  photoURL?: string | null;
  anglerId?: string | null;
};

export type GroupCatchFeedProps = {
  catchIds: string[];
  canManage?: boolean;
  onRemove?: (catchId: string) => Promise<void> | void;
};

async function loadCatch(id: string): Promise<CatchPreview> {
  try {
    const snapshot = await getDoc(doc(db, 'catches', id));
    if (!snapshot.exists()) {
      return { id };
    }
    const data = snapshot.data() as Record<string, any>;
    const caughtAtValue = data.caughtAt;
    let caughtAt: string | null = null;
    if (typeof caughtAtValue === 'string') {
      caughtAt = caughtAtValue;
    } else if (caughtAtValue && typeof caughtAtValue.toDate === 'function') {
      caughtAt = caughtAtValue.toDate().toISOString();
    }
    const imageList = Array.isArray(data.imageUrls)
      ? data.imageUrls.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const photoURL = typeof data.imageUrl === 'string' ? data.imageUrl : imageList[0] ?? null;
    return {
      id,
      species: typeof data.species === 'string' ? data.species : 'Catch',
      caughtAt,
      photoURL,
      anglerId: typeof data.userId === 'string' ? data.userId : null,
    };
  } catch (error) {
    console.error('Failed to load catch for group feed', error);
    return { id };
  }
}

export default function GroupCatchFeed({ catchIds, canManage = false, onRemove }: GroupCatchFeedProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<CatchPreview[]>([]);
  const [pendingRemovals, setPendingRemovals] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    if (!catchIds.length) {
      setPreviews([]);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const results = await Promise.all(catchIds.map((id) => loadCatch(id)));
        if (!cancelled) {
          setPreviews(results);
        }
      } catch (err) {
        if (!cancelled) {
          setError('We could not load the featured catches right now.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catchIds]);

  const handleRemove = async (catchId: string) => {
    if (!onRemove) return;
    setPendingRemovals((prev) => ({ ...prev, [catchId]: true }));
    try {
      await onRemove(catchId);
    } catch (error) {
      console.error('Failed to remove catch from feed', error);
    } finally {
      setPendingRemovals((prev) => {
        const next = { ...prev };
        delete next[catchId];
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading featured catches…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-6 text-red-200">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (previews.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white/60">
        <p className="text-sm">No catches have been featured in this group feed yet.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {previews.map((preview) => {
        const dateLabel = preview.caughtAt ? new Date(preview.caughtAt).toLocaleString() : null;
        return (
          <li key={preview.id} className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center">
            {preview.photoURL ? (
              <div className="relative h-40 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 md:h-32 md:w-44">
                <Image src={preview.photoURL} alt={preview.species ?? 'Catch'} fill className="object-cover" />
              </div>
            ) : null}
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{preview.species ?? 'Catch'}</p>
              <p className="text-xs text-white/50">Catch #{preview.id}</p>
              {dateLabel ? <p className="mt-1 text-xs text-white/60">Captured {dateLabel}</p> : null}
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={() => handleRemove(preview.id)}
                disabled={pendingRemovals[preview.id]}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs text-white/70 transition hover:border-red-400 hover:text-red-200 disabled:opacity-50"
              >
                {pendingRemovals[preview.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span>Remove</span>
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
