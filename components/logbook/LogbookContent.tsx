'use client';

import { FormEvent, useMemo, useState } from 'react';

import ForecastPanel from '@/components/forecasts/ForecastPanel';
import { fishingSpots } from '@/lib/fishingSpots';

interface CatchEntry {
  id: string;
  species: string;
  date: string;
  time: string;
  length: string;
  weight: string;
  waterbody: string;
  bait: string;
  technique: string;
  weather: string;
  notes: string;
  privacy: 'public' | 'water' | 'private';
}

const defaultForm: Omit<CatchEntry, 'id'> = {
  species: '',
  date: '',
  time: '',
  length: '',
  weight: '',
  waterbody: '',
  bait: '',
  technique: '',
  weather: '',
  notes: '',
  privacy: 'public',
};

type LogbookContentProps = {
  showIntroduction?: boolean;
};

export default function LogbookContent({ showIntroduction = true }: LogbookContentProps) {
  const [form, setForm] = useState(defaultForm);
  const [entries, setEntries] = useState<CatchEntry[]>([]);
  const [plannerSpotId, setPlannerSpotId] = useState<string>(fishingSpots[0]?.id ?? '');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = crypto.randomUUID();
    setEntries((prev) => [{ id, ...form }, ...prev]);
    setForm(defaultForm);
  };

  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const speciesCount = new Map<string, number>();
    entries.forEach((entry) => {
      speciesCount.set(entry.species, (speciesCount.get(entry.species) ?? 0) + 1);
    });
    const topSpecies = [...speciesCount.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      total: entries.length,
      topSpecies,
    } as const;
  }, [entries]);

  const plannerSpot = useMemo(
    () => fishingSpots.find((spot) => spot.id === plannerSpotId) ?? fishingSpots[0] ?? null,
    [plannerSpotId]
  );

  return (
    <div className="space-y-10">
      {showIntroduction ? (
        <header className="max-w-3xl space-y-4">
          <p className="text-sm uppercase tracking-[0.3em] text-white/60">Personal logbook</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-white">Document every catch with location privacy</h1>
          <p className="text-white/70">
            Keep a detailed record of species, techniques, weather, and results. Choose who can see the location of each catch —
            the entire community, anglers on that water, or only you.
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
            <label htmlFor="weather" className="block text-sm font-medium text-white">
              Weather snapshot
            </label>
            <input
              id="weather"
              placeholder="e.g. 68°F, overcast, light wind"
              className="input"
              value={form.weather}
              onChange={(event) => setForm((prev) => ({ ...prev, weather: event.target.value }))}
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
          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
            <input
              type="radio"
              name="privacy"
              value="public"
              checked={form.privacy === 'public'}
              onChange={(event) => setForm((prev) => ({ ...prev, privacy: event.target.value as CatchEntry['privacy'] }))}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-semibold text-white">Public</p>
              <p className="text-xs text-white/60">Share catch card with map pin visible to all anglers.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
            <input
              type="radio"
              name="privacy"
              value="water"
              checked={form.privacy === 'water'}
              onChange={(event) => setForm((prev) => ({ ...prev, privacy: event.target.value as CatchEntry['privacy'] }))}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-semibold text-white">Water-only</p>
              <p className="text-xs text-white/60">Waterbody name is visible but the precise pin stays hidden.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
            <input
              type="radio"
              name="privacy"
              value="private"
              checked={form.privacy === 'private'}
              onChange={(event) => setForm((prev) => ({ ...prev, privacy: event.target.value as CatchEntry['privacy'] }))}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-semibold text-white">Private</p>
              <p className="text-xs text-white/60">Only you can see this entry and exact coordinates.</p>
            </div>
          </label>
        </fieldset>

        <button type="submit" className="btn-primary px-6 py-3 text-base">
          Save catch to logbook
        </button>
      </form>

      <section className="space-y-4">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Recent entries</h2>
            <p className="text-sm text-white/60">Only you can see private catches in this view.</p>
          </div>
          {stats && stats.topSpecies ? (
            <p className="rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-xs text-brand-100">
              {stats.total} logged • Top species: {stats.topSpecies[0]} ({stats.topSpecies[1]})
            </p>
          ) : null}
        </header>

        {entries.length === 0 ? (
          <div className="rounded-3xl border border-white/10 p-8 text-center text-white/60">
            Log your first catch to build personal trends over time.
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-3xl border border-white/10 bg-slate-900/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">{entry.species}</h3>
                  <span className="text-xs uppercase tracking-wide text-white/50">{entry.privacy}</span>
                </div>
                <p className="text-sm text-white/70">
                  {entry.date} {entry.time && `• ${entry.time}`} — {entry.waterbody}
                </p>
                {entry.length ? <p className="text-xs text-white/60">Length: {entry.length} in</p> : null}
                {entry.weight ? <p className="text-xs text-white/60">Weight: {entry.weight} lb</p> : null}
                {entry.bait || entry.technique ? (
                  <p className="text-xs text-white/60">
                    {entry.bait ? `Bait: ${entry.bait}` : ''}
                    {entry.bait && entry.technique ? ' • ' : ''}
                    {entry.technique ? `Technique: ${entry.technique}` : ''}
                  </p>
                ) : null}
                {entry.weather ? <p className="text-xs text-white/50">Weather: {entry.weather}</p> : null}
                {entry.notes ? <p className="text-sm text-white/70">{entry.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
