'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Settings } from 'lucide-react';

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/lib/firestore';
import type { NotificationPreferenceKey, NotificationPreferences } from '@/lib/firestore';
import Modal from '@/components/ui/Modal';

const PREFERENCE_COPY: Record<NotificationPreferenceKey, { title: string; description: string }> = {
  follow: {
    title: 'New followers',
    description: 'Be alerted when anglers start following you.',
  },
  direct_message: {
    title: 'Direct messages',
    description: 'Know right away when someone sends you a private message.',
  },
  like: {
    title: 'Catch likes',
    description: 'See who is reacting to your catches.',
  },
  comment: {
    title: 'Catch comments',
    description: 'Stay in the loop when anglers comment on your catches.',
  },
  team_invite_accepted: {
    title: 'Team invite accepted',
    description: 'Find out immediately when anglers join your team.',
  },
  team_invite_canceled: {
    title: 'Team invite updates',
    description: 'Receive updates if a team invite is changed or canceled.',
  },
  chat_mention: {
    title: 'Chat mentions',
    description: 'Get notified when someone mentions you in chat.',
  },
  followed_catch: {
    title: 'Catches from anglers you follow',
    description: 'Hear about new catches posted by anglers you follow.',
  },
};

type NotificationPreferencesModalProps = {
  open: boolean;
  onClose: () => void;
  uid: string | null | undefined;
};

type PreferencesState = {
  values: NotificationPreferences;
  original: NotificationPreferences;
};

const INITIAL_STATE: PreferencesState = {
  values: { ...DEFAULT_NOTIFICATION_PREFERENCES },
  original: { ...DEFAULT_NOTIFICATION_PREFERENCES },
};

export default function NotificationPreferencesModal({ open, onClose, uid }: NotificationPreferencesModalProps) {
  const [{ values, original }, setState] = useState<PreferencesState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(original), [values, original]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!uid) {
      setState({ values: { ...DEFAULT_NOTIFICATION_PREFERENCES }, original: { ...DEFAULT_NOTIFICATION_PREFERENCES } });
      setIsLoading(false);
      setError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    getNotificationPreferences(uid)
      .then((preferences) => {
        if (!isMounted) return;
        const next = {
          values: { ...preferences },
          original: { ...preferences },
        };
        setState(next);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load notification preferences', err);
        setError('Something went wrong while loading your preferences. Please try again.');
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, uid]);

  const handleToggle = (key: NotificationPreferenceKey) => {
    setState((prev) => ({
      values: { ...prev.values, [key]: !prev.values[key] },
      original: prev.original,
    }));
  };

  const handleResetDefaults = () => {
    setState((prev) => ({
      values: { ...DEFAULT_NOTIFICATION_PREFERENCES },
      original: prev.original,
    }));
  };

  const handleSave = async () => {
    if (!uid || isSaving || !isDirty) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateNotificationPreferences(uid, values);
      setState({ values: { ...values }, original: { ...values } });
      onClose();
    } catch (err) {
      console.error('Failed to save notification preferences', err);
      setError('We could not save your preferences. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  const renderContent = () => {
    if (!uid) {
      return (
        <p className="text-sm text-white/70">Sign in to customize how Hookd keeps you in the loop.</p>
      );
    }

    if (isLoading) {
      return (
        <div className="flex items-center gap-2 text-sm text-white/80">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading preferences…
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        {Object.entries(PREFERENCE_COPY).map(([key, copy]) => {
          const preferenceKey = key as NotificationPreferenceKey;
          const checked = values[preferenceKey];

          return (
            <button
              key={preferenceKey}
              type="button"
              onClick={() => handleToggle(preferenceKey)}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition hover:border-brand-300/70 hover:bg-white/[0.06]"
            >
              <span
                className={`mt-1 inline-flex h-5 w-5 items-center justify-center rounded-md border ${checked ? 'border-brand-300 bg-brand-400 text-slate-950' : 'border-white/40 text-transparent'}`}
                aria-hidden="true"
              >
                {checked ? '✓' : ''}
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{copy.title}</span>
                <span className="mt-1 block text-xs text-white/70">{copy.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      labelledBy="notification-preferences-title"
      contentClassName="max-w-xl"
    >
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-white/15 bg-white/[0.08] p-2 text-white">
            <Settings className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 id="notification-preferences-title" className="text-lg font-semibold text-white">
              Notification preferences
            </h2>
            <p className="mt-1 text-sm text-white/70">
              Choose which alerts you want to receive. Turn items off to stay focused and stop specific updates from showing up here.
            </p>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {renderContent()}

        <div className="flex flex-wrap justify-between gap-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-xs font-medium text-white/70 transition hover:text-white"
            disabled={isSaving || isLoading || !uid}
          >
            Restore defaults
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!uid || isSaving || !isDirty}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
