export type FishingSpot = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceFromCantonMi: number;
  species: string[];
  publicAccess: boolean;
  regulations: {
    description: string;
    bagLimit: string;
  };
  latestCatch: {
    species: string;
    weight: string;
    bait: string;
  } | null;
};

export const fishingSpots: FishingSpot[] = [
  {
    id: "sippo-lake",
    name: "Sippo Lake",
    latitude: 40.8482,
    longitude: -81.4375,
    distanceFromCantonMi: 4.5,
    species: ["Largemouth Bass", "Channel Catfish", "Bluegill"],
    publicAccess: true,
    regulations: {
      description: "Electric motors only. Shoreline fishing permitted at public park.",
      bagLimit: "Bass 5 (≥ 12\"), Catfish 6",
    },
    latestCatch: {
      species: "Largemouth Bass",
      weight: "3.4 lb",
      bait: "Chartreuse paddle tail",
    },
  },
  {
    id: "nimisila-reservoir",
    name: "Nimisila Reservoir",
    latitude: 40.937,
    longitude: -81.5116,
    distanceFromCantonMi: 13.1,
    species: ["Muskie", "Crappie", "Yellow Perch"],
    publicAccess: true,
    regulations: {
      description: "No wake after sunset. State boating permit required.",
      bagLimit: "Muskie catch-and-release, Perch 30",
    },
    latestCatch: {
      species: "Muskie",
      weight: "38 in",
      bait: "Silver bucktail spinner",
    },
  },
  {
    id: "portage-lakes",
    name: "Portage Lakes",
    latitude: 40.9972,
    longitude: -81.5416,
    distanceFromCantonMi: 17.5,
    species: ["Smallmouth Bass", "Walleye", "Carp"],
    publicAccess: true,
    regulations: {
      description: "Multiple public ramps. Observe 12\" minimum for bass.",
      bagLimit: "Bass 5 (≥ 12\"), Walleye 6",
    },
    latestCatch: {
      species: "Smallmouth Bass",
      weight: "2.9 lb",
      bait: "Ned rig",
    },
  },
  {
    id: "tuscarawas-river",
    name: "Tuscarawas River",
    latitude: 40.783,
    longitude: -81.3785,
    distanceFromCantonMi: 1.1,
    species: ["Smallmouth Bass", "Sauger", "Channel Catfish"],
    publicAccess: true,
    regulations: {
      description: "Check seasonal closures for sauger. Respect private property lines.",
      bagLimit: "Sauger 6, Catfish 6",
    },
    latestCatch: {
      species: "Sauger",
      weight: "18 in",
      bait: "Chartreuse jig",
    },
  },
];
