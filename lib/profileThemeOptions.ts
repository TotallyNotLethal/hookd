import type { ProfileAccentKey, ProfileLayoutKey, ProfileTheme, ProfileTextureKey } from "./firestore";

export const PROFILE_ACCENT_OPTIONS: Record<ProfileAccentKey, { label: string; preview: string; className: string; description: string; }> = {
  tide: {
    label: "Tidal Blue",
    preview: "linear-gradient(135deg, rgba(56,189,248,1) 0%, rgba(14,116,144,1) 100%)",
    className: "profile-accent-tide",
    description: "Cool blues inspired by open water and clear skies.",
  },
  ember: {
    label: "Sunset Ember",
    preview: "linear-gradient(135deg, rgba(248,113,113,1) 0%, rgba(217,70,239,1) 100%)",
    className: "profile-accent-ember",
    description: "Warm sunset hues for a bold, high-contrast profile.",
  },
  kelp: {
    label: "Kelp Forest",
    preview: "linear-gradient(135deg, rgba(74,222,128,1) 0%, rgba(16,185,129,1) 100%)",
    className: "profile-accent-kelp",
    description: "Verdant greens inspired by coastal kelp forests.",
  },
  midnight: {
    label: "Midnight Tide",
    preview: "linear-gradient(135deg, rgba(129,140,248,1) 0%, rgba(99,102,241,1) 60%, rgba(56,189,248,1) 100%)",
    className: "profile-accent-midnight",
    description: "Soft violets and blues for a twilight vibe.",
  },
};

export const PROFILE_BACKGROUND_TEXTURES: Record<ProfileTextureKey, { label: string; preview: string; className: string; description: string; }> = {
  calm: {
    label: "Calm Current",
    preview: "radial-gradient(circle at 20% 20%, rgba(56,189,248,0.35), transparent 55%), radial-gradient(circle at 80% 30%, rgba(14,165,233,0.25), transparent 60%)",
    className: "profile-texture-calm",
    description: "Gentle gradients reminiscent of a calm morning drift.",
  },
  dusk: {
    label: "Dusk Horizon",
    preview: "radial-gradient(circle at 10% 10%, rgba(253,186,116,0.3), transparent 55%), radial-gradient(circle at 80% 80%, rgba(244,114,182,0.35), transparent 60%)",
    className: "profile-texture-dusk",
    description: "Warm dusk tones with soft atmospheric glow.",
  },
  midnight: {
    label: "Midnight Swell",
    preview: "radial-gradient(circle at 15% 80%, rgba(99,102,241,0.35), transparent 55%), radial-gradient(circle at 85% 20%, rgba(56,189,248,0.25), transparent 60%)",
    className: "profile-texture-midnight",
    description: "Deep blues with a hint of moonlit shimmer.",
  },
};

export const PROFILE_LAYOUT_OPTIONS: Record<ProfileLayoutKey, {
  label: string;
  description: string;
  wrapperClass: string;
  introClass: string;
  introWithHeroClass?: string;
  headerCardClass?: string;
  heroCardClass?: string;
}> = {
  classic: {
    label: "Classic",
    description: "Stacked layout that keeps the hero catch below your profile card.",
    wrapperClass: "space-y-8",
    introClass: "flex flex-col gap-6",
  },
  spotlight: {
    label: "Spotlight",
    description: "Places your featured catch alongside profile details on large screens.",
    wrapperClass: "space-y-8 lg:space-y-10",
    introClass: "flex flex-col gap-6",
    introWithHeroClass: "lg:grid lg:grid-cols-[2fr,1.2fr] lg:items-stretch",
    headerCardClass: "lg:h-full",
    heroCardClass: "lg:h-full",
  },
};

export const DEFAULT_PROFILE_THEME: ProfileTheme = {
  accentColor: "tide",
  backgroundTexture: "calm",
  layoutVariant: "classic",
  featuredCatchId: null,
};

export function coerceProfileTheme(
  input: Partial<ProfileTheme> | null | undefined,
  fallback: ProfileTheme = DEFAULT_PROFILE_THEME,
): ProfileTheme {
  const accent = input?.accentColor ?? fallback.accentColor;
  const texture = input?.backgroundTexture ?? fallback.backgroundTexture;
  const layout = input?.layoutVariant ?? fallback.layoutVariant;

  if (!(accent in PROFILE_ACCENT_OPTIONS)) {
    throw new Error("Unsupported accent color option");
  }
  if (!(texture in PROFILE_BACKGROUND_TEXTURES)) {
    throw new Error("Unsupported background texture option");
  }
  if (!(layout in PROFILE_LAYOUT_OPTIONS)) {
    throw new Error("Unsupported layout option");
  }

  const featuredCatchId = typeof input?.featuredCatchId === "string"
    ? input.featuredCatchId
    : input?.featuredCatchId === null
      ? null
      : fallback.featuredCatchId ?? null;

  return {
    accentColor: accent,
    backgroundTexture: texture,
    layoutVariant: layout,
    featuredCatchId,
  };
}

export function isValidAccentKey(value: unknown): value is ProfileAccentKey {
  return typeof value === "string" && value in PROFILE_ACCENT_OPTIONS;
}

export function isValidTextureKey(value: unknown): value is ProfileTextureKey {
  return typeof value === "string" && value in PROFILE_BACKGROUND_TEXTURES;
}

export function isValidLayoutKey(value: unknown): value is ProfileLayoutKey {
  return typeof value === "string" && value in PROFILE_LAYOUT_OPTIONS;
}
