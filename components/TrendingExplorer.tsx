"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type {
  SpeciesTrendingInsight,
  Tournament,
  TournamentLeaderboardEntry,
} from "@/lib/firestore";

interface TrendingExplorerProps {
  className?: string;
  activeTournaments: Tournament[];
  weightLeaders: TournamentLeaderboardEntry[];
  lengthLeaders: TournamentLeaderboardEntry[];
  speciesInsights: SpeciesTrendingInsight[];
  isProModerator?: boolean;
}

type DisplayBait = {
  label: string;
  details?: string | null;
};

type DisplaySpecies = {
  name: string;
  tagline: string;
  description: string;
  freshnessLabel?: string | null;
  baits: DisplayBait[];
  isFallback: boolean;
};

const EDITORIAL_SPECIES_FALLBACKS: DisplaySpecies[] = [
  {
    name: "Largemouth Bass",
    tagline: "Hook'd editorial pick",
    description: "Target weed edges with slow-rolled swimbaits.",
    freshnessLabel: "Curated by the Hook'd team",
    baits: [
      { label: "Swimbait" },
      { label: "Texas-rig" },
      { label: "Squarebill" },
    ],
    isFallback: true,
  },
  {
    name: "Crappie",
    tagline: "Hook'd editorial pick",
    description: "Vertical jig brush piles and docks mid-morning.",
    freshnessLabel: "Curated by the Hook'd team",
    baits: [
      { label: "Mini jig" },
      { label: "Minnow" },
      { label: "Slip float" },
    ],
    isFallback: true,
  },
  {
    name: "Channel Catfish",
    tagline: "Hook'd editorial pick",
    description: "Fresh cut bait along drop-offs after sunset.",
    freshnessLabel: "Curated by the Hook'd team",
    baits: [
      { label: "Cut shad" },
      { label: "Stink bait" },
      { label: "Live bluegill" },
    ],
    isFallback: true,
  },
];

const getMillis = (value: unknown): number => {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis?: () => number }).toMillis === "function"
  ) {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return Number.POSITIVE_INFINITY;
};

const formatWeightEntry = (entry: TournamentLeaderboardEntry): string => {
  if (entry.weightDisplay && entry.weightDisplay.length > 0) {
    return entry.weightDisplay;
  }
  const isKg = entry.measurementUnit?.weight === "kg";
  const base = isKg
    ? entry.weightValue ?? ((entry.weightScore ?? 0) * 0.45359237)
    : entry.weightScore ?? 0;
  return `${base.toFixed(2)} ${isKg ? "kg" : "lb"}`;
};

const formatLengthEntry = (entry: TournamentLeaderboardEntry): string => {
  if (entry.lengthDisplay && entry.lengthDisplay.length > 0) {
    return entry.lengthDisplay;
  }
  const isCm = entry.measurementUnit?.length === "cm";
  const base = isCm
    ? entry.lengthValue ?? ((entry.lengthScore ?? 0) * 2.54)
    : entry.lengthScore ?? 0;
  return `${base.toFixed(2)} ${isCm ? "cm" : "in"}`;
};

export default function TrendingExplorer({
  className = "",
  activeTournaments,
  weightLeaders,
  lengthLeaders,
  speciesInsights,
  isProModerator = false,
}: TrendingExplorerProps) {
  const [selectedSpeciesIndex, setSelectedSpeciesIndex] = useState(0);
  const recencyCutoffMs = 21 * 24 * 60 * 60 * 1000;

  const dynamicSpecies = useMemo<DisplaySpecies[]>(() => {
    return speciesInsights
      .map((insight) => {
        const generatedAt = insight.generatedAt instanceof Date ? insight.generatedAt : null;
        const latest = insight.latestCatchAt instanceof Date ? insight.latestCatchAt : null;
        if (!generatedAt || !latest) {
          return null;
        }

        const recencyDelta = generatedAt.getTime() - latest.getTime();
        if (recencyDelta > recencyCutoffMs) {
          return null;
        }

        const baits = insight.baits
          .map<DisplayBait | null>((bait) => {
            if (!bait.lureType) {
              return null;
            }

            const details: string[] = [];
            if (bait.sampleSize > 0) {
              details.push(`${bait.sampleSize} ${bait.sampleSize === 1 ? "log" : "logs"}`);
            }
            if (bait.trophyRate > 0) {
              details.push(`${Math.round(bait.trophyRate * 100)}% trophy`);
            }
            const recencyLabel = formatRelativeDistance(bait.lastCapturedAt, generatedAt);
            if (recencyLabel) {
              details.push(recencyLabel);
            }

            return {
              label: bait.lureType,
              details: details.length > 0 ? details.join(" • ") : null,
            };
          })
          .filter((bait): bait is DisplayBait => bait !== null);

        if (baits.length === 0) {
          return null;
        }

        const windowDelta = Math.max(0, generatedAt.getTime() - insight.sampleWindowStart.getTime());
        const weeksActive = Math.max(1, Math.round(windowDelta / (7 * 24 * 60 * 60 * 1000)));
        const trophyPercent = Math.round(insight.trophyRate * 100);
        const taglineParts = [`${insight.totalCatches} ${insight.totalCatches === 1 ? "log" : "logs"}`];
        if (trophyPercent > 0) {
          taglineParts.push(`${trophyPercent}% trophy rate`);
        }
        taglineParts.push(`last ${weeksActive} wk${weeksActive > 1 ? "s" : ""}`);

        const description =
          trophyPercent > 0
            ? "These presentations are producing quality bites right now."
            : "Anglers are finding steady action with these presentations.";

        return {
          name: insight.species,
          tagline: taglineParts.join(" · "),
          description,
          freshnessLabel: formatRelativeDistance(insight.latestCatchAt, generatedAt),
          baits,
          isFallback: false,
        } satisfies DisplaySpecies;
      })
      .filter((value): value is DisplaySpecies => Boolean(value));
  }, [speciesInsights, recencyCutoffMs]);

  const speciesOptions = useMemo<DisplaySpecies[]>(() => {
    const seen = new Set<string>();
    const combined: DisplaySpecies[] = [];

    for (const entry of dynamicSpecies) {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(entry);
    }

    for (const fallback of EDITORIAL_SPECIES_FALLBACKS) {
      const key = fallback.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(fallback);
    }

    return combined.slice(0, 5);
  }, [dynamicSpecies]);

  const safeSelectedIndex = speciesOptions.length > 0
    ? Math.min(selectedSpeciesIndex, speciesOptions.length - 1)
    : 0;
  const selectedSpecies = speciesOptions[safeSelectedIndex] ?? EDITORIAL_SPECIES_FALLBACKS[0];
  const tournamentsSorted = useMemo(() => {
    return [...activeTournaments].sort((a, b) => {
      const aTime = Math.min(getMillis(a.endAt), getMillis(a.startAt));
      const bTime = Math.min(getMillis(b.endAt), getMillis(b.startAt));
      return aTime - bTime;
    });
  }, [activeTournaments]);
  const heaviestEntries = useMemo(
    () => weightLeaders.filter((entry) => (entry.weightScore ?? 0) > 0).slice(0, 5),
    [weightLeaders],
  );
  const longestEntries = useMemo(
    () => lengthLeaders.filter((entry) => (entry.lengthScore ?? 0) > 0).slice(0, 5),
    [lengthLeaders],
  );

  return (
    <section className={`container py-16 ${className}`} aria-labelledby="discover-heading">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/60">Discover</p>
          <h2 id="discover-heading" className="text-2xl font-semibold text-white">
            Track live tournaments and hone your edge
          </h2>
        </div>
        <Link
          href="/feed"
          className="flex items-center gap-1 text-brand-300 hover:text-brand-200 text-sm md:text-base"
        >
          Browse community tips <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="glass rounded-3xl p-6" aria-labelledby="tournament-explorer">
          <div className="flex items-center justify-between">
            <h3 id="tournament-explorer" className="text-lg font-semibold text-white">
              Active tournaments
            </h3>
            {isProModerator ? (
              <Link
                href="/moderation/tournaments"
                className="text-sm text-brand-200 hover:text-brand-100"
              >
                Manage tournaments
              </Link>
            ) : null}
          </div>
          {tournamentsSorted.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {tournamentsSorted.map((tournament) => (
                <li
                  key={tournament.id}
                  className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-white">{tournament.title}</h4>
                      <p className="text-xs text-white/60">
                        {tournament.measurement.mode === "combined"
                          ? "Weight & length"
                          : tournament.measurement.mode === "weight"
                          ? "Weight based"
                          : "Length based"}
                        {tournament.ruleset ? ` · ${tournament.ruleset}` : ""}
                      </p>
                    </div>
                    {tournament.requiredHashtags.length > 0 && (
                      <span className="rounded-full bg-brand-500/20 px-3 py-1 text-xs text-brand-100">
                        {tournament.requiredHashtags.length} hashtag
                        {tournament.requiredHashtags.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {tournament.description && (
                    <p className="mt-2 text-sm text-white/70">{tournament.description}</p>
                  )}
                  {tournament.requiredHashtags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-brand-200">
                      {tournament.requiredHashtags.map((tag) => (
                        <span key={tag} className="rounded-full bg-brand-500/10 px-2 py-1">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-white/60">No active tournaments at the moment.</p>
          )}
          {!isProModerator && (
            <p className="mt-4 text-xs text-white/50">
              Want to host your own events? Request Hook&apos;d Pro moderator access to unlock
              tournament creation tools.
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass rounded-3xl p-6" aria-labelledby="leaderboard-explorer">
            <h3 id="leaderboard-explorer" className="text-lg font-semibold text-white">
              Verified leaderboards
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold text-white">Heaviest catches</h4>
                {heaviestEntries.length > 0 ? (
                  <ol className="mt-3 space-y-2 text-sm text-white/70">
                    {heaviestEntries.map((entry, index) => (
                      <li
                        key={entry.id}
                        className="rounded-xl border border-white/10 bg-slate-900/60 p-3"
                      >
                        <p className="font-medium text-white">
                          #{index + 1} {entry.userDisplayName || "Angler"}
                        </p>
                        <p className="text-xs text-white/60">
                          {formatWeightEntry(entry)}
                          {entry.tournamentTitle ? ` · ${entry.tournamentTitle}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-xs text-white/60">No verified weights yet.</p>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Longest catches</h4>
                {longestEntries.length > 0 ? (
                  <ol className="mt-3 space-y-2 text-sm text-white/70">
                    {longestEntries.map((entry, index) => (
                      <li
                        key={entry.id}
                        className="rounded-xl border border-white/10 bg-slate-900/60 p-3"
                      >
                        <p className="font-medium text-white">
                          #{index + 1} {entry.userDisplayName || "Angler"}
                        </p>
                        <p className="text-xs text-white/60">
                          {formatLengthEntry(entry)}
                          {entry.tournamentTitle ? ` · ${entry.tournamentTitle}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-xs text-white/60">No verified lengths yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="glass rounded-3xl p-6" aria-labelledby="species-explorer">
            <h3 id="species-explorer" className="text-lg font-semibold text-white">
              Target a species
            </h3>
            <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Featured species">
              {speciesOptions.map((species, index) => {
                const isSelected = index === safeSelectedIndex;
                return (
                  <button
                    key={species.name}
                    role="tab"
                    aria-selected={isSelected}
                    type="button"
                    onClick={() => setSelectedSpeciesIndex(index)}
                    className={`rounded-xl px-4 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 ${
                      isSelected
                        ? "bg-brand-500 text-white shadow-soft"
                        : "bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {species.name}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-brand-200">{selectedSpecies.tagline}</p>
              <p className="mt-2 text-sm text-white/80">{selectedSpecies.description}</p>
              {selectedSpecies.freshnessLabel ? (
                <p className="mt-2 text-xs text-white/60">{selectedSpecies.freshnessLabel}</p>
              ) : null}
              <p className="mt-4 text-xs uppercase tracking-wide text-white/50">Trending baits</p>
              {selectedSpecies.baits.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {selectedSpecies.baits.map((bait) => (
                    <li
                      key={bait.label}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80"
                    >
                      <p className="font-medium text-white">{bait.label}</p>
                      {bait.details ? (
                        <p className="mt-1 text-xs text-white/60">{bait.details}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-white/60">
                  No tackle intel logged for this species yet. Check back soon for fresh data.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatRelativeDistance(
  date: Date | null | undefined,
  reference: Date | null | undefined,
): string | null {
  if (!date) return null;
  const referenceTime = reference instanceof Date && !Number.isNaN(reference.getTime())
    ? reference.getTime()
    : Date.now();
  const diffMs = referenceTime - date.getTime();
  if (!Number.isFinite(diffMs)) {
    return null;
  }

  if (diffMs <= 0) {
    return "just now";
  }

  const minutes = Math.round(diffMs / (60 * 1000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  if (days < 14) {
    return `${days}d ago`;
  }

  const weeks = Math.round(days / 7);
  if (weeks < 12) {
    return `${weeks}w ago`;
  }

  const months = Math.round(days / 30);
  return `${months}mo ago`;
}
