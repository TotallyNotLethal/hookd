export type ReminderComputationInput = {
  enabled: boolean;
  expirationMonth: number | null;
  expirationDay?: number | null;
  leadDays: number;
  now?: Date;
};

function clampLeadDays(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.min(90, Math.max(1, Math.round(value)));
}

export function normalizeLeadDays(value: unknown, fallback: number = 14): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampLeadDays(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return clampLeadDays(parsed);
    }
  }
  return clampLeadDays(fallback);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function calculateNextReminderDate(input: ReminderComputationInput): Date | null {
  if (!input.enabled) {
    return null;
  }
  if (!input.expirationMonth || input.expirationMonth < 1 || input.expirationMonth > 12) {
    return null;
  }

  const now = input.now ? new Date(input.now) : new Date();
  const leadDays = clampLeadDays(input.leadDays);
  const expirationDayRaw = input.expirationDay ?? 1;
  const expirationDay = Math.min(Math.max(1, Math.round(expirationDayRaw)), 31);

  let year = now.getUTCFullYear();
  let reminder: Date | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const days = daysInMonth(year, input.expirationMonth);
    const safeDay = Math.min(expirationDay, days);
    const expirationDate = new Date(Date.UTC(year, input.expirationMonth - 1, safeDay, 12, 0, 0));
    const candidateReminder = new Date(expirationDate.getTime() - leadDays * 24 * 60 * 60 * 1000);

    if (candidateReminder.getTime() > now.getTime()) {
      reminder = candidateReminder;
      break;
    }

    if (expirationDate.getTime() > now.getTime()) {
      // Reminder already passed this year but expiration still future; schedule immediately.
      reminder = new Date(now.getTime() + 60 * 60 * 1000);
      break;
    }

    year += 1;
  }

  if (!reminder) {
    const days = daysInMonth(year, input.expirationMonth);
    const safeDay = Math.min(expirationDay, days);
    const expirationDate = new Date(Date.UTC(year, input.expirationMonth - 1, safeDay, 12, 0, 0));
    reminder = new Date(expirationDate.getTime() - leadDays * 24 * 60 * 60 * 1000);
  }

  return reminder;
}
