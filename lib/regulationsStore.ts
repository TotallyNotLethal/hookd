import { z } from 'zod';

export type RegulationRegionKey = string;
export type RegulationSpeciesKey = string;

export interface LicenseRule {
  summary: string;
  url?: string | null;
  notes?: string | null;
  defaultReminderLeadDays: number;
  typicalRenewalMonth?: number | null;
}

export interface RegulationRegionInfo {
  key: RegulationRegionKey;
  label: string;
  countryCode: string;
  aliases: string[];
  license: LicenseRule;
}

export interface RegulationSpeciesInfo {
  key: RegulationSpeciesKey;
  commonName: string;
  scientificName?: string | null;
  aliases: string[];
}

export interface RegulationRecord {
  id: string;
  region: RegulationRegionInfo;
  species: RegulationSpeciesInfo;
  summary: string;
  season?: string | null;
  bagLimit?: string | null;
  sizeLimit?: string | null;
  gearNotes?: string | null;
  enforcementNotes?: string | null;
  referenceUrl?: string | null;
  updatedAt: string;
}

export interface RegulationQueryOptions {
  region?: string | null;
  species?: string | null;
}

const rawSchema = z.object({
  region: z.object({
    key: z.string(),
    label: z.string(),
    countryCode: z.string().length(2),
    aliases: z.array(z.string()).default([]),
    license: z.object({
      summary: z.string(),
      url: z.string().url().optional().nullable(),
      notes: z.string().optional().nullable(),
      defaultReminderLeadDays: z.number().int().positive().default(14),
      typicalRenewalMonth: z.number().int().min(1).max(12).optional().nullable(),
    }),
  }),
  species: z.object({
    key: z.string(),
    commonName: z.string(),
    scientificName: z.string().optional().nullable(),
    aliases: z.array(z.string()).default([]),
  }),
  summary: z.string(),
  season: z.string().optional().nullable(),
  bagLimit: z.string().optional().nullable(),
  sizeLimit: z.string().optional().nullable(),
  gearNotes: z.string().optional().nullable(),
  enforcementNotes: z.string().optional().nullable(),
  referenceUrl: z.string().url().optional().nullable(),
  updatedAt: z.string(),
});

type RawSeed = z.infer<typeof rawSchema>;

const SEED_DATA: RawSeed[] = [
  {
    region: {
      key: 'us-mn',
      label: 'Minnesota',
      countryCode: 'US',
      aliases: ['mn', 'minnesota', 'us:mn', 'minnesota, us'],
      license: {
        summary: 'Minnesota residents and non-residents need an angling license; border waters honor reciprocity with Canada when both anglers hold valid permits.',
        url: 'https://www.dnr.state.mn.us/licenses/fishing/index.html',
        notes: 'Family licenses cover spouses and kids under 16. Keep paper or digital copy while on the water.',
        defaultReminderLeadDays: 21,
        typicalRenewalMonth: 2,
      },
    },
    species: {
      key: 'walleye',
      commonName: 'Walleye',
      scientificName: 'Sander vitreus',
      aliases: ['walleyes'],
    },
    summary:
      'Lake of the Woods slots require releasing walleye between 19.5" and 28"; one over 28" may be kept when the season is open.',
    season: 'Winter season (Dec–Feb) harvest limit 6 combined walleye/sauger, otherwise 4 in open water.',
    bagLimit: 'Daily: 6 (winter) / 4 (open water); possession 12 combined with sauger.',
    sizeLimit: 'Keep fish < 19.5"; only one > 28" may be harvested.',
    gearNotes: 'Barbless hooks recommended in cold weather to reduce mortality on slot releases.',
    enforcementNotes: 'Ontario border patrol coordinates with Lake of the Woods Control Board; check for checkpoint hours in peak season.',
    referenceUrl: 'https://www.dnr.state.mn.us/fishing/border/index.html',
    updatedAt: '2024-02-20',
  },
  {
    region: {
      key: 'us-fl',
      label: 'Florida',
      countryCode: 'US',
      aliases: ['fl', 'florida', 'fl, usa'],
      license: {
        summary: 'Florida freshwater license required for anglers 16+ unless fishing from a licensed pier or on free fishing days.',
        url: 'https://myfwc.com/license/recreational/',
        notes: 'Additional permits needed for snook or lobster even on freshwater bodies when targeting migratory fish.',
        defaultReminderLeadDays: 14,
        typicalRenewalMonth: 6,
      },
    },
    species: {
      key: 'largemouth-bass',
      commonName: 'Largemouth Bass',
      scientificName: 'Micropterus salmoides',
      aliases: ['bass', 'black bass'],
    },
    summary:
      'Lake Okeechobee follows statewide bass rules: only one largemouth bass over 16" may be part of the daily bag.',
    season: 'Open year-round with TrophyCatch reporting encouraged for bass ≥ 8 lb.',
    bagLimit: 'Daily 5 bass with one over 16"; sunshine bass count toward aggregate unless harvested from marked zones.',
    sizeLimit: 'Under 16" or greater than 16" (one fish).',
    gearNotes: 'Wild shiners legal; cast nets prohibited for gamefish.',
    enforcementNotes: 'FWC conducts ramp inspections during weekend tournaments—keep livewell aeration running.',
    referenceUrl: 'https://myfwc.com/fishing/freshwater/sites-forecasts/lake-okeechobee/',
    updatedAt: '2024-01-12',
  },
  {
    region: {
      key: 'us-oh',
      label: 'Ohio',
      countryCode: 'US',
      aliases: ['oh', 'ohio', 'lake erie western basin', 'western lake erie'],
      license: {
        summary: 'Ohio license or approved reciprocal Michigan license required on western basin border waters.',
        url: 'https://ohiodnr.gov/buyandapply/fishing-license',
        notes: 'Lake Erie charter captains must carry customers’ licenses onboard; one-day licenses available digitally.',
        defaultReminderLeadDays: 10,
        typicalRenewalMonth: 3,
      },
    },
    species: {
      key: 'yellow-perch',
      commonName: 'Yellow Perch',
      aliases: ['perch'],
    },
    summary:
      'Lake Erie western basin perch creel fluctuates by zone; ODNR posts adjustments monthly during peak harvest.',
    season: 'Generally open year-round; check monthly quota bulletins for zone closures.',
    bagLimit: 'Daily 30 perch unless otherwise posted by zone.',
    sizeLimit: 'No statewide minimum; local charters enforce 7" courtesy limit.',
    gearNotes: 'Spreaders or Sabiki rigs with ≤ 3 hooks per line.',
    enforcementNotes: 'ODNR and Michigan DNR conduct joint blitzes in April and September.',
    referenceUrl: 'https://ohiodnr.gov/discover-and-learn/safety-conservation/about-ODNR/news/weekly-lake-erie-report',
    updatedAt: '2024-03-05',
  },
  {
    region: {
      key: 'us-wa',
      label: 'Washington',
      countryCode: 'US',
      aliases: ['wa', 'washington', 'king county lakes'],
      license: {
        summary: 'Washington freshwater license required for anglers 15+; catch record cards needed for salmon, steelhead, sturgeon, halibut, and Puget Sound Dungeness crab.',
        url: 'https://wdfw.wa.gov/licenses/fishing',
        notes: 'Discover Pass required for many launches; keep barbless hooks for selective fisheries.',
        defaultReminderLeadDays: 30,
        typicalRenewalMonth: 3,
      },
    },
    species: {
      key: 'cutthroat-trout',
      commonName: 'Coastal Cutthroat Trout',
      scientificName: 'Oncorhynchus clarkii clarkii',
      aliases: ['cutthroat', 'sea-run cutthroat'],
    },
    summary:
      'Lake Washington trout fishery shifts to selective gear (single barbless, no bait) during summer to protect juvenile salmon.',
    season: 'Year-round with selective gear May 1 – Oct 31 in tributary mouths.',
    bagLimit: 'Daily 2 trout ≥ 12" from lake; release all wild steelhead.',
    sizeLimit: 'Slot: 12–20" retainable; release trout > 20" to protect brood stock.',
    gearNotes: 'No bait or scent during selective periods; knotless nets required.',
    enforcementNotes: 'WDFW monitors Cedar River mouth closures during sockeye run.',
    referenceUrl: 'https://wdfw.wa.gov/fishing/regulations',
    updatedAt: '2024-05-10',
  },
  {
    region: {
      key: 'us-tx',
      label: 'Texas',
      countryCode: 'US',
      aliases: ['tx', 'texas', 'lake fork'],
      license: {
        summary: 'Texas requires freshwater package or all-water license; Lake Fork anglers must carry special bass management card when retained fish exceed slot.',
        url: 'https://tpwd.texas.gov/business/licenses/public/recreational/',
        notes: 'Lake Fork slot exemptions need weigh-station documentation for ShareLunker entries.',
        defaultReminderLeadDays: 15,
        typicalRenewalMonth: 8,
      },
    },
    species: {
      key: 'crappie',
      commonName: 'Crappie',
      aliases: ['white crappie', 'black crappie'],
    },
    summary:
      'Lake Fork crappie fall under statewide regs: 25 fish daily, minimum 10" except during winter timber harvest where no length limit applies.',
    season: 'Open year-round; winter timber zone suspends length limit Dec 1 – Feb 28.',
    bagLimit: 'Daily 25 crappie.',
    sizeLimit: '10" minimum outside designated winter harvest zone.',
    gearNotes: 'Two-pole limit per angler in marinas; fluorescent marker required on jug lines.',
    enforcementNotes: 'TPWD checks livewells at SRA ramps—log harvest zone when claiming winter exemption.',
    referenceUrl: 'https://tpwd.texas.gov/regulations/outdoor-annual/fishing/freshwater-fishing/',
    updatedAt: '2024-04-18',
  },
  {
    region: {
      key: 'us-ny',
      label: 'New York',
      countryCode: 'US',
      aliases: ['ny', 'new york', 'lake champlain ny'],
      license: {
        summary: 'New York licenses required except during free fishing days; Lake Champlain reciprocity with Vermont when both anglers hold valid licenses.',
        url: 'https://www.dec.ny.gov/permits/6091.html',
        notes: 'Separate marine registry needed for saltwater species even if all fishing occurs inland.',
        defaultReminderLeadDays: 20,
        typicalRenewalMonth: 9,
      },
    },
    species: {
      key: 'lake-trout',
      commonName: 'Lake Trout',
      aliases: ['mackinaw'],
    },
    summary:
      'Lake Champlain management allows two lake trout ≥ 18" with season closing October 1 – November 30 for spawning protection.',
    season: 'Open Jan 1 – Sep 30.',
    bagLimit: 'Daily 2 lake trout.',
    sizeLimit: 'Minimum 18".',
    gearNotes: 'Two rods per angler; setline registration required for jug fishing.',
    enforcementNotes: 'Joint NYDEC and VT wardens patrol Missisquoi Bay nightly during summer.',
    referenceUrl: 'https://dec.vermont.gov/fish/angler-resources/lake-champlain',
    updatedAt: '2024-02-08',
  },
];

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const regionAliasIndex = new Map<string, RegulationRegionKey>();
const speciesAliasIndex = new Map<string, RegulationSpeciesKey>();
const recordsByRegion = new Map<RegulationRegionKey, Map<RegulationSpeciesKey, RegulationRecord>>();
const recordsBySpecies = new Map<RegulationSpeciesKey, RegulationRecord[]>();

function registerRegion(region: RegulationRegionInfo) {
  const aliases = new Set<string>([region.key, region.label, ...region.aliases]);
  for (const alias of aliases) {
    const normalized = normalizeKey(alias);
    if (!normalized) continue;
    if (!regionAliasIndex.has(normalized)) {
      regionAliasIndex.set(normalized, region.key);
    }
  }
}

function registerSpecies(species: RegulationSpeciesInfo) {
  const aliases = new Set<string>([species.key, species.commonName, species.scientificName ?? '', ...species.aliases]);
  for (const alias of aliases) {
    const normalized = normalizeKey(alias);
    if (!normalized) continue;
    if (!speciesAliasIndex.has(normalized)) {
      speciesAliasIndex.set(normalized, species.key);
    }
  }
}

const regulationRecords: RegulationRecord[] = SEED_DATA.map((item) => {
  const data = rawSchema.parse(item);
  const region: RegulationRegionInfo = {
    key: normalizeKey(data.region.key) || normalizeKey(data.region.label),
    label: data.region.label,
    countryCode: data.region.countryCode.toUpperCase(),
    aliases: data.region.aliases.map((alias) => normalizeKey(alias)).filter(Boolean),
    license: {
      summary: data.region.license.summary,
      url: data.region.license.url ?? null,
      notes: data.region.license.notes ?? null,
      defaultReminderLeadDays: data.region.license.defaultReminderLeadDays,
      typicalRenewalMonth: data.region.license.typicalRenewalMonth ?? null,
    },
  };

  const species: RegulationSpeciesInfo = {
    key: normalizeKey(data.species.key) || normalizeKey(data.species.commonName),
    commonName: data.species.commonName,
    scientificName: data.species.scientificName ?? null,
    aliases: data.species.aliases.map((alias) => normalizeKey(alias)).filter(Boolean),
  };

  registerRegion(region);
  registerSpecies(species);

  const record: RegulationRecord = {
    id: `${region.key}:${species.key}`,
    region,
    species,
    summary: data.summary,
    season: data.season ?? null,
    bagLimit: data.bagLimit ?? null,
    sizeLimit: data.sizeLimit ?? null,
    gearNotes: data.gearNotes ?? null,
    enforcementNotes: data.enforcementNotes ?? null,
    referenceUrl: data.referenceUrl ?? null,
    updatedAt: data.updatedAt,
  };

  if (!recordsByRegion.has(region.key)) {
    recordsByRegion.set(region.key, new Map());
  }
  recordsByRegion.get(region.key)!.set(species.key, record);

  if (!recordsBySpecies.has(species.key)) {
    recordsBySpecies.set(species.key, []);
  }
  recordsBySpecies.get(species.key)!.push(record);

  return record;
});

regulationRecords.forEach((record) => {
  registerRegion(record.region);
  registerSpecies(record.species);
});

export const REGULATIONS_DATASET_VERSION = '2024.05-regulations-v1';

export function listRegions(): RegulationRegionInfo[] {
  const seen = new Map<RegulationRegionKey, RegulationRegionInfo>();
  for (const record of regulationRecords) {
    if (!seen.has(record.region.key)) {
      seen.set(record.region.key, record.region);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function listSpecies(regionKey?: string | null): RegulationSpeciesInfo[] {
  const normalizedRegion = regionKey ? getRegionKey(regionKey) : null;
  if (normalizedRegion) {
    const regionRecords = recordsByRegion.get(normalizedRegion);
    if (!regionRecords) return [];
    return Array.from(regionRecords.values())
      .map((record) => record.species)
      .sort((a, b) => a.commonName.localeCompare(b.commonName));
  }

  const seen = new Map<RegulationSpeciesKey, RegulationSpeciesInfo>();
  for (const record of regulationRecords) {
    if (!seen.has(record.species.key)) {
      seen.set(record.species.key, record.species);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.commonName.localeCompare(b.commonName));
}

export function getRegionKey(input: string | null | undefined): RegulationRegionKey | null {
  if (!input) return null;
  const normalized = normalizeKey(input);
  if (!normalized) return null;
  return regionAliasIndex.get(normalized) ?? null;
}

export function getSpeciesKey(input: string | null | undefined): RegulationSpeciesKey | null {
  if (!input) return null;
  const normalized = normalizeKey(input);
  if (!normalized) return null;
  return speciesAliasIndex.get(normalized) ?? null;
}

export function queryRegulations(options: RegulationQueryOptions = {}): RegulationRecord[] {
  const regionKey = getRegionKey(options.region ?? null);
  const speciesKey = getSpeciesKey(options.species ?? null);

  if (regionKey && speciesKey) {
    const byRegion = recordsByRegion.get(regionKey);
    const match = byRegion?.get(speciesKey);
    return match ? [match] : [];
  }

  if (regionKey) {
    const byRegion = recordsByRegion.get(regionKey);
    return byRegion ? Array.from(byRegion.values()) : [];
  }

  if (speciesKey) {
    return recordsBySpecies.get(speciesKey) ?? [];
  }

  return regulationRecords.slice();
}

export function getRegulationSummary(options: RegulationQueryOptions): RegulationRecord | null {
  const [record] = queryRegulations(options);
  return record ?? null;
}

export function describeLicense(regionInput: string | null | undefined): LicenseRule | null {
  const regionKey = getRegionKey(regionInput ?? null);
  if (!regionKey) return null;
  const regionRecords = recordsByRegion.get(regionKey);
  const sample = regionRecords ? regionRecords.values().next().value : null;
  return sample ? sample.region.license : null;
}

export function inferRegionFromLocation(text: string | null | undefined): RegulationRegionKey | null {
  if (!text) return null;
  const normalized = normalizeKey(text);
  if (!normalized) return null;

  if (regionAliasIndex.has(normalized)) {
    return regionAliasIndex.get(normalized) ?? null;
  }

  const parts = text
    .split(/[,\-/]/g)
    .map((segment) => normalizeKey(segment))
    .filter(Boolean);
  for (const part of parts) {
    if (regionAliasIndex.has(part)) {
      return regionAliasIndex.get(part) ?? null;
    }
  }

  return null;
}

export function getAllRegulationRecords(): RegulationRecord[] {
  return regulationRecords.slice();
}
