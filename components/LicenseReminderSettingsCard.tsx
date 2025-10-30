'use client';

import { type ChangeEvent, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_LICENSE_REMINDER_SETTINGS,
  getLicenseReminderSettings,
  type LicenseReminderSettings,
  type LicenseReminderSettingsUpdate,
  updateLicenseReminderSettings,
} from '@/lib/firestore';
import { describeLicense, listRegions, listSpecies } from '@/lib/regulationsStore';

const MONTH_OPTIONS = [
  { value: 0, label: 'Not sure yet' },
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const LEAD_OPTIONS = [7, 14, 21, 30, 45];

type LicenseReminderSettingsCardProps = {
  uid: string | null | undefined;
  loader?: (uid: string) => Promise<LicenseReminderSettings>;
  saver?: (uid: string, update: LicenseReminderSettingsUpdate) => Promise<LicenseReminderSettings>;
};

type SettingsState = {
  values: LicenseReminderSettings;
  original: LicenseReminderSettings;
};

const INITIAL_STATE: SettingsState = {
  values: { ...DEFAULT_LICENSE_REMINDER_SETTINGS },
  original: { ...DEFAULT_LICENSE_REMINDER_SETTINGS },
};

function formatNextReminder(date: Date | null): string {
  if (!date) {
    return 'Not scheduled';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch (error) {
    return date.toISOString();
  }
}

export default function LicenseReminderSettingsCard({
  uid,
  loader = getLicenseReminderSettings,
  saver = updateLicenseReminderSettings,
}: LicenseReminderSettingsCardProps) {
  const [state, setState] = useState<SettingsState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regionOptions = useMemo(() => listRegions(), []);
  const selectedRegionKey = state.values.regionKey;
  const selectedRegion = useMemo(
    () => regionOptions.find((region) => region.key === selectedRegionKey) ?? null,
    [regionOptions, selectedRegionKey],
  );

  const speciesOptions = useMemo(() => {
    const list = selectedRegionKey ? listSpecies(selectedRegionKey) : listSpecies();
    return list.sort((a, b) => a.commonName.localeCompare(b.commonName));
  }, [selectedRegionKey]);

  const licenseHint = useMemo(() => {
    if (!selectedRegionKey) return null;
    return describeLicense(selectedRegionKey);
  }, [selectedRegionKey]);

  const isDirty = useMemo(
    () => JSON.stringify(state.values) !== JSON.stringify(state.original),
    [state.original, state.values],
  );

  useEffect(() => {
    if (!uid) {
      setState(INITIAL_STATE);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    loader(uid)
      .then((settings) => {
        if (!active) return;
        setState({ values: { ...settings }, original: { ...settings } });
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load license reminders', err);
        setError('Unable to load license reminders right now.');
        setState(INITIAL_STATE);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loader, uid]);

  const handleToggleEnabled = () => {
    setState((prev) => ({
      values: { ...prev.values, enabled: !prev.values.enabled },
      original: prev.original,
    }));
  };

  const handleRegionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextKey = event.target.value || null;
    const region = nextKey ? regionOptions.find((item) => item.key === nextKey) ?? null : null;
    setState((prev) => ({
      original: prev.original,
      values: {
        ...prev.values,
        regionKey: region ? region.key : null,
        regionLabel: region ? region.label : null,
        speciesKey: null,
        speciesLabel: null,
      },
    }));
  };

  const handleSpeciesChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextKey = event.target.value || null;
    const species = nextKey
      ? speciesOptions.find((item) => item.key === nextKey) ?? null
      : null;
    setState((prev) => ({
      original: prev.original,
      values: {
        ...prev.values,
        speciesKey: species ? species.key : null,
        speciesLabel: species ? species.commonName : null,
      },
    }));
  };

  const handleMonthChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = Number(event.target.value);
    const month = Number.isFinite(nextValue) && nextValue >= 1 && nextValue <= 12 ? nextValue : null;
    setState((prev) => ({
      original: prev.original,
      values: {
        ...prev.values,
        expirationMonth: month,
        expirationDay: month ? prev.values.expirationDay : null,
      },
    }));
  };

  const handleDayChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.target.value);
    const day = Number.isFinite(raw) && raw >= 1 && raw <= 31 ? Math.round(raw) : null;
    setState((prev) => ({
      original: prev.original,
      values: {
        ...prev.values,
        expirationDay: day,
      },
    }));
  };

  const handleLeadChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const raw = Number(event.target.value);
    setState((prev) => {
      const leadDays = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : prev.values.leadDays;
      return {
        original: prev.original,
        values: {
          ...prev.values,
          leadDays,
        },
      };
    });
  };

  const handleReset = () => {
    if (saving) return;
    setState((prev) => ({ values: { ...prev.original }, original: prev.original }));
    setError(null);
  };

  const handleSave = async () => {
    if (!uid || saving || !isDirty) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await saver(uid, {
        enabled: state.values.enabled,
        regionKey: state.values.regionKey,
        speciesKey: state.values.speciesKey,
        expirationMonth: state.values.expirationMonth,
        expirationDay: state.values.expirationDay,
        leadDays: state.values.leadDays,
      });
      setState({ values: { ...updated }, original: { ...updated } });
    } catch (err) {
      console.error('Failed to update license reminders', err);
      setError('We could not save your reminders. Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const renderContent = () => {
    if (!uid) {
      return <p className="text-sm text-white/60">Sign in to schedule license reminders.</p>;
    }

    if (loading) {
      return <p className="text-sm text-white/60">Loading license reminders…</p>;
    }

    const disabled = !state.values.enabled;
    const nextReminderLabel = formatNextReminder(state.values.nextReminderAt ?? null);

    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-white/80">
            <span>Home region</span>
            <select
              className="input"
              value={state.values.regionKey ?? ''}
              onChange={handleRegionChange}
              disabled={disabled}
            >
              <option value="">Select a region</option>
              {regionOptions.map((region) => (
                <option key={region.key} value={region.key}>
                  {region.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-white/80">
            <span>Target species</span>
            <select
              className="input"
              value={state.values.speciesKey ?? ''}
              onChange={handleSpeciesChange}
              disabled={disabled || !selectedRegionKey}
            >
              <option value="">Any regulated species</option>
              {speciesOptions.map((species) => (
                <option key={species.key} value={species.key}>
                  {species.commonName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-2 text-sm text-white/80">
            <span>Renewal month</span>
            <select
              className="input"
              value={state.values.expirationMonth ?? 0}
              onChange={handleMonthChange}
              disabled={disabled}
            >
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-white/80">
            <span>Renewal day</span>
            <input
              type="number"
              min={1}
              max={31}
              className="input"
              value={state.values.expirationDay ?? ''}
              onChange={handleDayChange}
              disabled={disabled || !state.values.expirationMonth}
              placeholder="1"
            />
          </label>
          <label className="space-y-2 text-sm text-white/80">
            <span>Remind me</span>
            <select
              className="input"
              value={state.values.leadDays}
              onChange={handleLeadChange}
              disabled={disabled}
            >
              {LEAD_OPTIONS.map((lead) => (
                <option key={lead} value={lead}>
                  {lead} days before
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-[0.2em] text-brand-200/70">Next reminder</span>
            <span className="text-base text-white">{nextReminderLabel}</span>
            <span className="text-xs text-white/50">Automatically recalculated when you save.</span>
          </div>
        </div>

        {licenseHint ? (
          <p className="text-xs text-white/60">
            License guidance: {licenseHint.summary}
            {licenseHint.url ? (
              <>
                {' '}
                <a
                  href={licenseHint.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-200 underline hover:text-brand-100"
                >
                  Check regulations
                </a>
              </>
            ) : null}
          </p>
        ) : null}

        {error ? <p className="text-xs text-red-400">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || disabled || saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save reminders'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty || saving}
            className="text-sm text-white/60 underline-offset-4 hover:text-white hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset changes
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/60 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">License reminders</h2>
          <p className="text-sm text-white/60">Schedule renewal nudges so you never miss a legal fishing day.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={state.values.enabled}
            onChange={handleToggleEnabled}
            disabled={loading}
          />
          <span>{state.values.enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>
      {renderContent()}
    </section>
  );
}
