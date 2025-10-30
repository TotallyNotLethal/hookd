import { strict as assert } from 'node:assert';
import test from 'node:test';

import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { JSDOM } from 'jsdom';

import LicenseReminderSettingsCard from '@/components/LicenseReminderSettingsCard';
import type { LicenseReminderSettings, LicenseReminderSettingsUpdate } from '@/lib/firestore';

test('LicenseReminderSettingsCard surfaces license guidance and saves updates', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalNavigator = globalThis.navigator;
  (globalThis as typeof globalThis & { window: Window }).window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
  globalThis.navigator = dom.window.navigator;

  const settings: LicenseReminderSettings = {
    enabled: true,
    regionKey: 'us-fl',
    regionLabel: 'Florida',
    speciesKey: 'largemouth-bass',
    speciesLabel: 'Largemouth Bass',
    expirationMonth: 6,
    expirationDay: 1,
    leadDays: 14,
    nextReminderAt: new Date(Date.UTC(2024, 4, 20)),
    updatedAt: new Date(Date.UTC(2024, 3, 15)),
  };

  let saveCalls = 0;

  const loader = async () => settings;
  const saver = async (_uid: string, update: LicenseReminderSettingsUpdate) => {
    saveCalls += 1;
    assert.equal(update.leadDays, 21);
    return {
      ...settings,
      leadDays: update.leadDays ?? settings.leadDays,
      nextReminderAt: new Date(Date.UTC(2024, 4, 25)),
    } satisfies LicenseReminderSettings;
  };

  try {
    render(<LicenseReminderSettingsCard uid="user-123" loader={loader} saver={saver} />);

    await screen.findByText('License reminders');
    await screen.findByText(/License guidance/i);

    const leadSelect = screen.getByLabelText('Remind me') as HTMLSelectElement;
    fireEvent.change(leadSelect, { target: { value: '21' } });

    const saveButton = screen.getByRole('button', { name: 'Save reminders' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      assert.ok(saveCalls >= 1);
    });

    await screen.findByText(/Next reminder/);
    assert.equal(leadSelect.value, '21');
    assert.equal(saveCalls, 1);
  } finally {
    cleanup();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.navigator = originalNavigator;
  }
});
