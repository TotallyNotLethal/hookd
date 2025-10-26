export interface FishSpecies {
  id: string;
  name: string;
  aliases: string[];
}

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const makeAliases = (name: string, aliases: string[] = []) => {
  const normalizedName = normalize(name);
  const normalizedAliases = aliases
    .map((alias) => alias.trim())
    .filter((alias) => alias.length && normalize(alias) !== normalizedName);
  return [name, ...normalizedAliases.filter(Boolean)];
};

export const fishSpecies: FishSpecies[] = [
  {
    id: 'largemouth-bass',
    name: 'Largemouth Bass',
    aliases: ['Bucketmouth', 'Bigmouth Bass'],
  },
  {
    id: 'smallmouth-bass',
    name: 'Smallmouth Bass',
    aliases: ['Bronzeback', 'Brown Bass'],
  },
  {
    id: 'spotted-bass',
    name: 'Spotted Bass',
    aliases: ['Kentucky Bass', 'Spot'],
  },
  {
    id: 'striped-bass',
    name: 'Striped Bass',
    aliases: ['Rockfish', 'Linesider'],
  },
  {
    id: 'white-bass',
    name: 'White Bass',
    aliases: ['Sand Bass', 'Silver Bass'],
  },
  {
    id: 'black-crappie',
    name: 'Black Crappie',
    aliases: ['Papermouth', 'Speckled Perch'],
  },
  {
    id: 'white-crappie',
    name: 'White Crappie',
    aliases: ['Sac-a-lait'],
  },
  {
    id: 'bluegill',
    name: 'Bluegill',
    aliases: ['Bream', 'Brim', 'Sunfish'],
  },
  {
    id: 'redear-sunfish',
    name: 'Redear Sunfish',
    aliases: ['Shellcracker'],
  },
  {
    id: 'pumpkinseed',
    name: 'Pumpkinseed',
    aliases: ['Kivver'],
  },
  {
    id: 'yellow-perch',
    name: 'Yellow Perch',
    aliases: ['Ringed Perch'],
  },
  {
    id: 'walleye',
    name: 'Walleye',
    aliases: ['Pickerel', 'Yellow Pike'],
  },
  {
    id: 'sauger',
    name: 'Sauger',
    aliases: ['Sand Pike'],
  },
  {
    id: 'northern-pike',
    name: 'Northern Pike',
    aliases: ['Jackfish', 'Gator'],
  },
  {
    id: 'muskellunge',
    name: 'Muskellunge',
    aliases: ['Muskie'],
  },
  {
    id: 'tiger-muskie',
    name: 'Tiger Muskie',
    aliases: ['Hybrid Muskie'],
  },
  {
    id: 'chain-pickerel',
    name: 'Chain Pickerel',
    aliases: ['Federation Pike'],
  },
  {
    id: 'lake-trout',
    name: 'Lake Trout',
    aliases: ['Laker', 'Mackinaw'],
  },
  {
    id: 'brook-trout',
    name: 'Brook Trout',
    aliases: ['Brookie', 'Speckled Trout'],
  },
  {
    id: 'brown-trout',
    name: 'Brown Trout',
    aliases: ['German Brown'],
  },
  {
    id: 'rainbow-trout',
    name: 'Rainbow Trout',
    aliases: ['Steelhead (Freshwater)'],
  },
  {
    id: 'cutthroat-trout',
    name: 'Cutthroat Trout',
    aliases: ['Cutt'],
  },
  {
    id: 'steelhead',
    name: 'Steelhead',
    aliases: ['Sea-run Rainbow Trout'],
  },
  {
    id: 'chinook-salmon',
    name: 'Chinook Salmon',
    aliases: ['King Salmon'],
  },
  {
    id: 'coho-salmon',
    name: 'Coho Salmon',
    aliases: ['Silver Salmon'],
  },
  {
    id: 'sockeye-salmon',
    name: 'Sockeye Salmon',
    aliases: ['Red Salmon'],
  },
  {
    id: 'pink-salmon',
    name: 'Pink Salmon',
    aliases: ['Humpy'],
  },
  {
    id: 'atlantic-salmon',
    name: 'Atlantic Salmon',
    aliases: ['Salmo Salar'],
  },
  {
    id: 'kokanee',
    name: 'Kokanee Salmon',
    aliases: ['Landlocked Sockeye'],
  },
  {
    id: 'channel-catfish',
    name: 'Channel Catfish',
    aliases: ['Channel Cat'],
  },
  {
    id: 'blue-catfish',
    name: 'Blue Catfish',
    aliases: ['Humpback Cat'],
  },
  {
    id: 'flathead-catfish',
    name: 'Flathead Catfish',
    aliases: ['Yellow Cat'],
  },
  {
    id: 'bullhead-catfish',
    name: 'Bullhead Catfish',
    aliases: ['Mudcat'],
  },
  {
    id: 'white-sturgeon',
    name: 'White Sturgeon',
    aliases: ['Pacific Sturgeon'],
  },
  {
    id: 'lake-sturgeon',
    name: 'Lake Sturgeon',
    aliases: ['Rock Sturgeon'],
  },
  {
    id: 'shortnose-gar',
    name: 'Shortnose Gar',
    aliases: ['Short-nosed Gar'],
  },
  {
    id: 'longnose-gar',
    name: 'Longnose Gar',
    aliases: ['Long-nosed Gar'],
  },
  {
    id: 'alligator-gar',
    name: 'Alligator Gar',
    aliases: ['Gator Gar'],
  },
  {
    id: 'bowfin',
    name: 'Bowfin',
    aliases: ['Dogfish', 'Mudfish'],
  },
  {
    id: 'common-carp',
    name: 'Common Carp',
    aliases: ['European Carp'],
  },
  {
    id: 'grass-carp',
    name: 'Grass Carp',
    aliases: ['White Amur'],
  },
  {
    id: 'bighead-carp',
    name: 'Bighead Carp',
    aliases: ['Asian Carp'],
  },
  {
    id: 'black-drum',
    name: 'Black Drum',
    aliases: ['Drumfish'],
  },
  {
    id: 'red-drum',
    name: 'Red Drum',
    aliases: ['Redfish', 'Channel Bass'],
  },
  {
    id: 'snook',
    name: 'Snook',
    aliases: ['Linesider Snook'],
  },
  {
    id: 'tarpon',
    name: 'Tarpon',
    aliases: ['Silver King'],
  },
  {
    id: 'mahi-mahi',
    name: 'Mahi-Mahi',
    aliases: ['Dorado', 'Dolphinfish'],
  },
  {
    id: 'sailfish',
    name: 'Sailfish',
    aliases: ['Atlantic Sailfish'],
  },
  {
    id: 'yellowfin-tuna',
    name: 'Yellowfin Tuna',
    aliases: ['Ahi'],
  },
  {
    id: 'bluefin-tuna',
    name: 'Bluefin Tuna',
    aliases: ['Giant Bluefin'],
  },
  {
    id: 'halibut',
    name: 'Pacific Halibut',
    aliases: ['Halibut'],
  },
  {
    id: 'flounder',
    name: 'Summer Flounder',
    aliases: ['Fluke'],
  },
  {
    id: 'sheepshead',
    name: 'Sheepshead',
    aliases: ['Convict Fish'],
  },
  {
    id: 'black-sea-bass',
    name: 'Black Sea Bass',
    aliases: ['Sea Bass'],
  },
  {
    id: 'pompano',
    name: 'Florida Pompano',
    aliases: ['Pompano'],
  },
  {
    id: 'speckled-trout',
    name: 'Spotted Seatrout',
    aliases: ['Speckled Trout'],
  },
  {
    id: 'weakfish',
    name: 'Weakfish',
    aliases: ['Sea Trout'],
  },
  {
    id: 'bluefish',
    name: 'Bluefish',
    aliases: ['Snapper Blue'],
  },
  {
    id: 'american-shad',
    name: 'American Shad',
    aliases: ['White Shad'],
  },
  {
    id: 'striped-mullet',
    name: 'Striped Mullet',
    aliases: ['Jumping Mullet'],
  },
  {
    id: 'yellowtail-snapper',
    name: 'Yellowtail Snapper',
    aliases: ['Flag Yellowtail'],
  },
  {
    id: 'mangrove-snapper',
    name: 'Mangrove Snapper',
    aliases: ['Gray Snapper'],
  },
  {
    id: 'red-snapper',
    name: 'Red Snapper',
    aliases: ['American Red Snapper'],
  },
  {
    id: 'grouper-gag',
    name: 'Gag Grouper',
    aliases: ['Gag'],
  },
  {
    id: 'grouper-black',
    name: 'Black Grouper',
    aliases: ['Marbled Grouper'],
  },
  {
    id: 'cobia',
    name: 'Cobia',
    aliases: ['Ling'],
  },
  {
    id: 'amberjack',
    name: 'Greater Amberjack',
    aliases: ['AJ'],
  },
  {
    id: 'hogfish',
    name: 'Hogfish',
    aliases: ['Hog Snapper'],
  },
  {
    id: 'triggerfish',
    name: 'Gray Triggerfish',
    aliases: ['Trigger'],
  },
  {
    id: 'blacktip-shark',
    name: 'Blacktip Shark',
    aliases: ['Black-tip Shark'],
  },
  {
    id: 'bonnethead-shark',
    name: 'Bonnethead Shark',
    aliases: ['Bonnet Shark'],
  },
  {
    id: 'leopard-shark',
    name: 'Leopard Shark',
    aliases: ['Triakis'],
  },
  {
    id: 'stingray',
    name: 'Southern Stingray',
    aliases: ['Whipray'],
  },
  {
    id: 'bowhead',
    name: 'Bowhead',
    aliases: ['Bowhead Fish'],
  },
];

const searchIndex = fishSpecies.map((species) => ({
  species,
  tokens: makeAliases(species.name, species.aliases).map((alias) => normalize(alias)),
}));

export const normalizeFishName = normalize;

export function filterFishSpecies(query: string, list: FishSpecies[] = fishSpecies): FishSpecies[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return list;
  }

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!queryTokens.length) {
    return list;
  }

  const allowedIds = new Set(list.map((item) => item.id));

  return searchIndex
    .filter(({ species }) => allowedIds.has(species.id))
    .filter(({ tokens }) => queryTokens.every((token) => tokens.some((alias) => alias.includes(token))))
    .map(({ species }) => species);
}

export function findFishSpeciesById(id: string): FishSpecies | undefined {
  return fishSpecies.find((species) => species.id === id);
}

export function findFishSpeciesByName(name: string): FishSpecies | undefined {
  const normalizedName = normalize(name);
  return searchIndex.find(({ tokens }) => tokens.some((alias) => alias === normalizedName))?.species;
}

export function sortSpeciesByName(list: FishSpecies[]): FishSpecies[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}
