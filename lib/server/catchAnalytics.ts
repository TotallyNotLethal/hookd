'use server';

import type { CatchLike, CatchSummary } from '../catchStats';
import { summarizeCatchMetrics } from '../catchStats';
import type { CatchRecord, CatchVisibility } from '../catches';
import { getCatchRepository } from './catchesRepository';

export type CatchAnalyticsSnapshot = {
  summary: CatchSummary;
  sampleSize: number;
  generatedAt: string;
};

function recordToCatchLike(record: CatchRecord): CatchLike {
  const weight = record.measurements?.weightPounds ?? null;
  const weightText = weight != null ? `${Math.round(weight * 100) / 100} lb` : null;
  return {
    id: record.id,
    species: record.species,
    trophy: weight != null && weight >= 8,
    weight: weightText,
    weightValueLbs: weight,
    environmentSnapshot: record.environmentSnapshot ?? undefined,
  };
}

export async function computeUserCatchAnalytics(userId: string): Promise<CatchAnalyticsSnapshot> {
  const repo = getCatchRepository();
  const { entries } = await repo.listCatches(userId);
  const summary = summarizeCatchMetrics(entries.map(recordToCatchLike));
  return { summary, sampleSize: entries.length, generatedAt: new Date().toISOString() };
}

export async function computeCommunityCatchAnalytics(
  visibility?: CatchVisibility,
): Promise<CatchAnalyticsSnapshot> {
  const repo = getCatchRepository();
  const entries = await repo.listForCommunity(visibility);
  const summary = summarizeCatchMetrics(entries.map(recordToCatchLike));
  return { summary, sampleSize: entries.length, generatedAt: new Date().toISOString() };
}
