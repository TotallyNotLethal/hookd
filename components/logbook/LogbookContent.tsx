'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Loader2, PencilLine, Trash2 } from 'lucide-react';

import ForecastPanel from '@/components/forecasts/ForecastPanel';
import { fishingSpots } from '@/lib/fishingSpots';
import type { ForecastBundle } from '@/lib/forecastTypes';
import type { CatchVisibility } from '@/lib/catches';
import { app } from '@/lib/firebaseClient';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { queueCatch, syncQueuedCatches } from '@/lib/offlineStorage';

const auth = getAuth(app);

type CatchEntry = {
  id: string;
  species: string;
  caughtAt: string;
  notes: string | null;
  location: { waterbody: string; latitude?: number | null; longitude?: number | null; description?: string | null };
  gear: {
    bait?: string;
    presentation?: string;
    notes?: string;
  } | null;
  measurements: {
    lengthInches?: number;
    weightPounds?: number;
    girthInches?: number;
  } | null;
  sharing: {
    visibility: CatchVisibility;
    shareWithCommunity: boolean;
    shareLocationCoordinates: boolean;
  };
  environmentSnapshot: unknown;
  forecastSnapshot: ForecastBundle | null;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  species: string;
  waterbody: string;
  date: string;
  time: string;
  length: string;
  weight: string;
  girth: string;
  bait: string;
  technique: string;
  notes: string;
  conditions: string;
  privacy: CatchVisibility;
  shareWithCommunity: boolean;
  shareCoordinates: boolean;
};

type FormErrors = Partial<Record<keyof FormState, string>> & { general?: string };

const defaultForm: FormState = {
  species: '',
  waterbody: '',
  date: '',
  time: '',
  length: '',
  weight: '',
  girth: '',
  bait: '',
  technique: '',
  notes: '',
  conditions: '',
  privacy: 'public',
  shareWithCommunity: true,
  shareCoordinates: false,
};

const VISIBILITY_FILTERS: Array<{ label: string; value: 'all' | CatchVisibility }> = [
  { label: 'All visibility', value: 'all' },
  { label: 'Public only', value: 'public' },
  { label: 'Water-only', value: 'water' },
  { label: 'Private only', value: 'private' },
];

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const datePart = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timePart = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} • ${timePart}`;
}

function measurementSummary(entry: CatchEntry) {
  const segments: string[] = [];
  const length = entry.measurements?.lengthInches;
  if (typeof length === 'number' && Number.isFinite(length)) {
    segments.push(`${length.toFixed(1)} in`);
  }
  const weight = entry.measurements?.weightPounds;
  if (typeof weight === 'number' && Number.isFinite(weight)) {
    segments.push(`${weight.toFixed(2)} lb`);
  }
  const girth = entry.measurements?.girthInches;
  if (typeof girth === 'number' && Number.isFinite(girth)) {
    segments.push(`${girth.toFixed(1)} in girth`);
  }
  return segments.join(' • ');
}

function bestBiteWindow(snapshot: ForecastBundle | null) {
  if (!snapshot?.biteWindows?.windows?.length) return null;
  return snapshot.biteWindows.windows.reduce<ForecastBundle['biteWindows']['windows'][number] | null>((best, candidate) => {
    if (!candidate) return best;
    if (!best) return candidate;
    if (candidate.score > best.score) return candidate;
    const candidateStart = new Date(candidate.start).getTime();
    const bestStart = new Date(best.start).getTime();
    return candidateStart < bestStart ? candidate : best;
  }, null);
}

export default function LogbookContent({ showIntroduction = true }: { showIntroduction?: boolean }) {
  const [user, authLoading] = useAuthState(auth);
  const [entries, setEntries] = useState<CatchEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [plannerSpotId, setPlannerSpotId] = useState<string>(fishingSpots[0]?.id ?? '');
  const [plannerForecast, setPlannerForecast] = useState<ForecastBundle | null>(null);
  const [selectedVisibility, setSelectedVisibility] = useState<'all' | CatchVisibility>('all');
  const offline = useOfflineStatus();

  const plannerSpot = useMemo(
    () => fishingSpots.find((spot) => spot.id === plannerSpotId) ?? fishingSpots[0] ?? null,
    [plannerSpotId],
  );

  const stats = useMemo(() => {
    if (!entries.length) return null;
    const speciesCount = new Map<string, number>();
    entries.forEach((entry) => {
      const key = entry.species.trim().toLowerCase();
      if (!key) return;
      speciesCount.set(key, (speciesCount.get(key) ?? 0) + 1);
    });
    const top = [...speciesCount.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      total: entries.length,
      topSpecies: top ? { name: top[0], count: top[1] } : null,
    } as const;
  }, [entries]);

  const resetForm = useCallback(() => {
    setForm(defaultForm);
    setFormErrors({});
    setSubmitting(false);
    setEditingId(null);
    setPlannerForecast(null);
  }, []);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (selectedVisibility !== 'all') {
        params.set('visibility', selectedVisibility);
      }
      const response = await fetch(`/api/catches${params.toString() ? `?${params.toString()}` : ''}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to load catches (${response.status})`);
      }
      const payload = (await response.json()) as { entries?: CatchEntry[] };
      setEntries(payload.entries ?? []);
    } catch (error) {
      setEntriesError(error instanceof Error ? error.message : 'Unable to load logbook entries.');
    } finally {
      setEntriesLoading(false);
    }
  }, [selectedVisibility, user]);

  useEffect(() => {
    if (user) {
      void fetchEntries();
    } else if (!authLoading) {
      setEntries([]);
    }
  }, [authLoading, fetchEntries, user]);

  useEffect(() => {
    if (!user || !offline.online) return;
    let cancelled = false;
    const run = async () => {
      const result = await syncQueuedCatches({
        userId: user.uid,
        getAuthToken: () => user.getIdToken(),
      });
      if (!cancelled && result.synced > 0) {
        await fetchEntries();
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [fetchEntries, offline.online, user]);

  const populateFormForEditing = useCallback((entry: CatchEntry) => {
    const caughtAt = new Date(entry.caughtAt);
    const isoDate = Number.isNaN(caughtAt.getTime()) ? '' : caughtAt.toISOString();
    const nextForm: FormState = {
      species: entry.species ?? '',
      waterbody: entry.location?.waterbody ?? '',
      date: isoDate ? isoDate.slice(0, 10) : '',
      time: isoDate ? isoDate.slice(11, 16) : '',
      length: entry.measurements?.lengthInches != null ? String(entry.measurements.lengthInches) : '',
      weight: entry.measurements?.weightPounds != null ? String(entry.measurements.weightPounds) : '',
      girth: entry.measurements?.girthInches != null ? String(entry.measurements.girthInches) : '',
      bait: entry.gear?.bait ?? '',
      technique: entry.gear?.presentation ?? '',
      notes: entry.notes ?? '',
      conditions: entry.gear?.notes ?? '',
      privacy: entry.sharing.visibility,
      shareWithCommunity: entry.sharing.shareWithCommunity,
      shareCoordinates: entry.sharing.shareLocationCoordinates,
    };
    setForm(nextForm);
    setFormErrors({});
    setPlannerForecast(entry.forecastSnapshot ?? null);
    setEditingId(entry.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!user) return;
      if (!offline.online) {
        setEntriesError('Deleting catches while offline is not supported.');
        return;
      }
      if (typeof window !== 'undefined') {
        const confirm = window.confirm('Delete this catch?');
        if (!confirm) return;
      }
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/catches/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok && response.status !== 204) {
          throw new Error(`Delete failed (${response.status})`);
        }
        if (editingId === id) {
          resetForm();
        }
        await fetchEntries();
      } catch (error) {
        setEntriesError(error instanceof Error ? error.message : 'Unable to delete catch.');
      }
    },
    [editingId, fetchEntries, offline.online, resetForm, user],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!user) {
        setFormErrors({ general: 'Please sign in to save catches.' });
        return;
      }
      setSubmitting(true);
      setFormErrors({});

      const errors: FormErrors = {};
      const species = form.species.trim();
      if (!species) {
        errors.species = 'Species is required.';
      }
      const waterbody = form.waterbody.trim();
      if (!waterbody) {
        errors.waterbody = 'Water or location is required.';
      }
      if (!form.date) {
        errors.date = 'Date is required.';
      }
      const timeInput = form.time.trim() || '00:00';
      let caughtAtIso: string | null = null;
      if (!errors.date) {
        const candidate = new Date(`${form.date}T${timeInput}`);
        if (Number.isNaN(candidate.getTime())) {
          errors.time = 'Provide a valid time.';
        } else {
          caughtAtIso = candidate.toISOString();
        }
      }
      if (form.shareCoordinates && form.privacy === 'private') {
        errors.shareCoordinates = 'Coordinates cannot be shared for private catches.';
      }

      const measurements: Record<string, number> = {};
      const lengthValue = form.length.trim();
      if (lengthValue) {
        const numeric = Number.parseFloat(lengthValue);
        if (Number.isNaN(numeric)) {
          errors.length = 'Length must be a number.';
        } else {
          measurements.lengthInches = Math.round(numeric * 100) / 100;
        }
      }
      const weightValue = form.weight.trim();
      if (weightValue) {
        const numeric = Number.parseFloat(weightValue);
        if (Number.isNaN(numeric)) {
          errors.weight = 'Weight must be a number.';
        } else {
          measurements.weightPounds = Math.round(numeric * 100) / 100;
        }
      }
      const girthValue = form.girth.trim();
      if (girthValue) {
        const numeric = Number.parseFloat(girthValue);
        if (Number.isNaN(numeric)) {
          errors.girth = 'Girth must be a number.';
        } else {
          measurements.girthInches = Math.round(numeric * 100) / 100;
        }
      }

      if (Object.keys(errors).length) {
        setFormErrors(errors);
        setSubmitting(false);
        return;
      }

      const gear: CatchEntry['gear'] = {};
      if (form.bait.trim()) gear.bait = form.bait.trim();
      if (form.technique.trim()) gear.presentation = form.technique.trim();
      if (form.conditions.trim()) gear.notes = form.conditions.trim();
      const payload: Record<string, unknown> = {
        species,
        caughtAt: caughtAtIso!,
        location: { waterbody },
        sharing: {
          visibility: form.privacy,
          shareWithCommunity: form.shareWithCommunity,
          shareLocationCoordinates: form.shareCoordinates && form.privacy !== 'private',
        },
      };
      if (form.notes.trim()) {
        payload.notes = form.notes.trim();
      }
      if (Object.keys(gear).length) {
        payload.gear = gear;
      }
      if (Object.keys(measurements).length) {
        payload.measurements = measurements;
      }
      if (plannerForecast) {
        payload.forecastSnapshot = plannerForecast;
      }

      try {
        const token = await user.getIdToken();
        const attemptNetwork = offline.online
          ? await fetch(editingId ? `/api/catches/${editingId}` : '/api/catches', {
              method: editingId ? 'PATCH' : 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(payload),
            })
          : null;

        if (attemptNetwork && !attemptNetwork.ok) {
          const body = await attemptNetwork.json().catch(() => ({}));
          const message = typeof body?.error === 'string' ? body.error : `Save failed (${attemptNetwork.status})`;
          throw new Error(message);
        }

        if (!attemptNetwork) {
          const previousSnapshot = editingId ? entries.find((entry) => entry.id === editingId) ?? null : null;
          await queueCatch({
            userId: user.uid,
            method: editingId ? 'PATCH' : 'POST',
            catchId: editingId ?? undefined,
            payload,
            baseUpdatedAt: previousSnapshot?.updatedAt ?? null,
            previousSnapshot,
          });
          setFormErrors({ general: 'Catch saved offline. It will sync automatically when you reconnect.' });
          resetForm();
        } else {
          await fetchEntries();
          resetForm();
        }
      } catch (error) {
        if (!offline.online) {
          const previousSnapshot = editingId ? entries.find((entry) => entry.id === editingId) ?? null : null;
          await queueCatch({
            userId: user.uid,
            method: editingId ? 'PATCH' : 'POST',
            catchId: editingId ?? undefined,
            payload,
            baseUpdatedAt: previousSnapshot?.updatedAt ?? null,
            previousSnapshot,
          });
          setFormErrors({ general: 'Catch saved offline. It will sync automatically when you reconnect.' });
          resetForm();
        } else {
          setFormErrors({ general: error instanceof Error ? error.message : 'Unable to save catch.' });
        }
      } finally {
        setSubmitting(false);
      }
    },
    [editingId, entries, fetchEntries, form, offline.online, plannerForecast, resetForm, user],
  );

  return (
    <div className="space-y-10">
      {showIntroduction ? (
        <header className="max-w-3xl space-y-4">
          <p className="text-sm uppercase tracking-[0.3em] text-white/60">Personal logbook</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-white">Document every catch with location privacy</h1>
          <p className="text-white/70">
            Track techniques, conditions, and results for every outing. Choose who can see the location of each catch and keep
            sensitive coordinates private.
          </p>
        </header>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-white">Plan the next bite</p>
            <p className="text-xs text-white/60">Preview hourly weather and optimal windows before logging a future trip.</p>
          </div>
          <label className="text-xs text-white/70">
            <span className="mr-2 uppercase tracking-[0.2em] text-white/40">Spot</span>
            <select
              className="input bg-slate-950/80 text-sm"
              value={plannerSpotId}
              onChange={(event) => setPlannerSpotId(event.target.value)}
            >
              {fishingSpots.slice(0, 12).map((spot) => (
                <option key={spot.id} value={spot.id}>
                  {spot.name}, {spot.state}
                </option>
              ))}
            </select>
          </label>
        </div>
        {plannerSpot ? (
          <ForecastPanel
            latitude={plannerSpot.latitude}
            longitude={plannerSpot.longitude}
            locationLabel={`${plannerSpot.name}, ${plannerSpot.state}`}
            onSnapshot={setPlannerForecast}
          />
        ) : null}
      </section>

      <form onSubmit={handleSubmit} className="glass rounded-3xl border border-white/10 p-6 space-y-6" aria-label="Catch log form">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="species" className="block text-sm font-medium text-white">
              Species
            </label>
            <input
              id="species"
              required
              className="input"
              value={form.species}
              onChange={(event) => setForm((prev) => ({ ...prev, species: event.target.value }))}
            />
            {formErrors.species ? <p className="mt-1 text-xs text-red-400">{formErrors.species}</p> : null}
          </div>
          <div>
            <label htmlFor="waterbody" className="block text-sm font-medium text-white">
              Water or location
            </label>
            <input
              id="waterbody"
              className="input"
              required
              value={form.waterbody}
              onChange={(event) => setForm((prev) => ({ ...prev, waterbody: event.target.value }))}
            />
            {formErrors.waterbody ? <p className="mt-1 text-xs text-red-400">{formErrors.waterbody}</p> : null}
          </div>
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-white">
              Date
            </label>
            <input
              id="date"
              type="date"
              className="input"
              required
              value={form.date}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
            />
            {formErrors.date ? <p className="mt-1 text-xs text-red-400">{formErrors.date}</p> : null}
          </div>
          <div>
            <label htmlFor="time" className="block text-sm font-medium text-white">
              Time
            </label>
            <input
              id="time"
              type="time"
              className="input"
              value={form.time}
              onChange={(event) => setForm((prev) => ({ ...prev, time: event.target.value }))}
            />
            {formErrors.time ? <p className="mt-1 text-xs text-red-400">{formErrors.time}</p> : null}
          </div>
          <div>
            <label htmlFor="length" className="block text-sm font-medium text-white">
              Length (in)
            </label>
            <input
              id="length"
              className="input"
              value={form.length}
              onChange={(event) => setForm((prev) => ({ ...prev, length: event.target.value }))}
            />
            {formErrors.length ? <p className="mt-1 text-xs text-red-400">{formErrors.length}</p> : null}
          </div>
          <div>
            <label htmlFor="weight" className="block text-sm font-medium text-white">
              Weight (lb)
            </label>
            <input
              id="weight"
              className="input"
              value={form.weight}
              onChange={(event) => setForm((prev) => ({ ...prev, weight: event.target.value }))}
            />
            {formErrors.weight ? <p className="mt-1 text-xs text-red-400">{formErrors.weight}</p> : null}
          </div>
          <div>
            <label htmlFor="girth" className="block text-sm font-medium text-white">
              Girth (in)
            </label>
            <input
              id="girth"
              className="input"
              value={form.girth}
              onChange={(event) => setForm((prev) => ({ ...prev, girth: event.target.value }))}
            />
            {formErrors.girth ? <p className="mt-1 text-xs text-red-400">{formErrors.girth}</p> : null}
          </div>
          <div>
            <label htmlFor="bait" className="block text-sm font-medium text-white">
              Bait or lure
            </label>
            <input
              id="bait"
              className="input"
              value={form.bait}
              onChange={(event) => setForm((prev) => ({ ...prev, bait: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="technique" className="block text-sm font-medium text-white">
              Technique or presentation
            </label>
            <input
              id="technique"
              className="input"
              value={form.technique}
              onChange={(event) => setForm((prev) => ({ ...prev, technique: event.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="conditions" className="block text-sm font-medium text-white">
              Conditions snapshot
            </label>
            <input
              id="conditions"
              className="input"
              placeholder="e.g. 68°F, overcast, light wind"
              value={form.conditions}
              onChange={(event) => setForm((prev) => ({ ...prev, conditions: event.target.value }))}
            />
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-white">
            Notes
          </label>
          <textarea
            id="notes"
            className="input min-h-[120px]"
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-white">Location visibility</legend>
          <p className="text-xs text-white/60">Choose how your spot is shared when you post this catch.</p>
          {(['public', 'water', 'private'] as CatchVisibility[]).map((value) => (
            <label key={value} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <input
                type="radio"
                name="privacy"
                value={value}
                checked={form.privacy === value}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, privacy: event.target.value as CatchVisibility }))
                }
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold text-white">{value === 'water' ? 'Water-only' : value.charAt(0).toUpperCase() + value.slice(1)}</p>
                <p className="text-xs text-white/60">
                  {value === 'public'
                    ? 'Share catch card with map pin visible to all anglers.'
                    : value === 'water'
                    ? 'Waterbody name is visible but the precise pin stays hidden.'
                    : 'Only you can see this entry and exact coordinates.'}
                </p>
              </div>
            </label>
          ))}
          <label className="flex items-center gap-3 text-sm text-white/80">
            <input
              type="checkbox"
              checked={form.shareWithCommunity}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, shareWithCommunity: event.target.checked }))
              }
            />
            Include this catch in community analytics
          </label>
          <label className="flex items-center gap-3 text-sm text-white/80">
            <input
              type="checkbox"
              checked={form.shareCoordinates}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, shareCoordinates: event.target.checked }))
              }
            />
            Share exact coordinates when visibility allows
          </label>
          {formErrors.shareCoordinates ? (
            <p className="text-xs text-red-400">{formErrors.shareCoordinates}</p>
          ) : null}
        </fieldset>

        {formErrors.general ? <p className="text-sm text-red-400">{formErrors.general}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary px-6 py-3 text-base" disabled={submitting}>
            {submitting ? 'Saving…' : editingId ? 'Update catch' : 'Save catch to logbook'}
          </button>
          {editingId ? (
            <button
              type="button"
              className="btn-secondary px-4 py-2 text-sm"
              onClick={resetForm}
              disabled={submitting}
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <section className="space-y-4">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-white">Recent entries</h2>
            <p className="text-sm text-white/60">Only you can see private catches in this view.</p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <select
              className="input w-full bg-slate-950/80 text-sm md:w-auto"
              value={selectedVisibility}
              onChange={(event) => setSelectedVisibility(event.target.value as 'all' | CatchVisibility)}
            >
              {VISIBILITY_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {stats && stats.topSpecies ? (
              <p className="rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-xs text-brand-100">
                {stats.total} logged • Top species: {stats.topSpecies.name.toUpperCase()} ({stats.topSpecies.count})
              </p>
            ) : null}
          </div>
        </header>

        {authLoading ? (
          <div className="rounded-3xl border border-white/10 p-8 text-center text-white/60">Checking your account…</div>
        ) : !user ? (
          <div className="rounded-3xl border border-white/10 p-8 text-center text-white/60">
            Sign in to view and manage your personal logbook.
          </div>
        ) : entriesLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-3xl border border-white/10 p-8 text-white/70">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Loading catches…
          </div>
        ) : entriesError ? (
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-200">
            {entriesError}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-3xl border border-white/10 p-8 text-center text-white/60">
            Log your first catch to build personal trends over time.
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {entries.map((entry) => {
              const window = bestBiteWindow(entry.forecastSnapshot);
              return (
                <li key={entry.id} className="rounded-3xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{entry.species}</h3>
                      <p className="text-xs uppercase tracking-wide text-white/50">{entry.sharing.visibility}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => populateFormForEditing(entry)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white transition hover:bg-white/10"
                        aria-label={`Edit ${entry.species}`}
                      >
                        <PencilLine className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-red-200 transition hover:bg-red-500/20"
                        aria-label={`Delete ${entry.species}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-white/70">{formatDateTime(entry.caughtAt)} — {entry.location.waterbody}</p>
                  {measurementSummary(entry) ? (
                    <p className="text-xs text-white/60">Measurements: {measurementSummary(entry)}</p>
                  ) : null}
                  {entry.gear?.bait || entry.gear?.presentation ? (
                    <p className="text-xs text-white/60">
                      {entry.gear?.bait ? `Bait: ${entry.gear.bait}` : ''}
                      {entry.gear?.bait && entry.gear?.presentation ? ' • ' : ''}
                      {entry.gear?.presentation ? `Technique: ${entry.gear.presentation}` : ''}
                    </p>
                  ) : null}
                  {entry.gear?.notes ? (
                    <p className="text-xs text-white/50">Conditions: {entry.gear.notes}</p>
                  ) : null}
                  {window ? (
                    <p className="text-xs text-brand-200">
                      Forecast window: {window.label} ({new Date(window.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })})
                    </p>
                  ) : null}
                  {entry.notes ? <p className="text-sm text-white/70">{entry.notes}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
