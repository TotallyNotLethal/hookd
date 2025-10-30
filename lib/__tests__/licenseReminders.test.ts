import { strict as assert } from 'node:assert';
import test from 'node:test';

import { calculateNextReminderDate } from '@/lib/licenseReminders';

test('schedules reminder before upcoming expiration', () => {
  const now = new Date(Date.UTC(2024, 0, 10));
  const reminder = calculateNextReminderDate({
    enabled: true,
    expirationMonth: 3,
    expirationDay: 15,
    leadDays: 14,
    now,
  });
  assert.ok(reminder);
  const expected = new Date(Date.UTC(2024, 2, 1, 12, 0, 0));
  assert.equal(reminder?.toISOString(), expected.toISOString());
});

test('rolls forward when current cycle already passed', () => {
  const now = new Date(Date.UTC(2024, 8, 20));
  const reminder = calculateNextReminderDate({
    enabled: true,
    expirationMonth: 8,
    expirationDay: 5,
    leadDays: 10,
    now,
  });
  assert.ok(reminder);
  assert.ok(reminder!.getUTCFullYear() >= 2025);
});

test('returns null when reminders disabled', () => {
  const reminder = calculateNextReminderDate({
    enabled: false,
    expirationMonth: 5,
    expirationDay: 10,
    leadDays: 14,
  });
  assert.equal(reminder, null);
});
