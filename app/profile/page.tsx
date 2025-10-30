'use client';

import NavBar from "@/components/NavBar";
import ProfileView from "@/components/ProfileView";
import { summarizeCatchMetrics } from "@/lib/catchStats";
import { app } from "@/lib/firebaseClient";
import {
  subscribeToUser,
  subscribeToUserCatches,
  subscribeToTeamsForUser,
  updateUserProfile,
  uploadProfileAsset,
  type Team,
} from "@/lib/firestore";
import { subscribeToUserTackleStats, type UserTackleStats } from "@/lib/tackleBox";
import { USERNAME_MIN_LENGTH, validateAndNormalizeUsername } from "@/lib/username";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import clsx from "clsx";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import PostDetailModal from "@/app/feed/PostDetailModal";
import LogbookModal from "@/components/logbook/LogbookModal";
import {
  DEFAULT_PROFILE_THEME,
  PROFILE_ACCENT_OPTIONS,
  PROFILE_BACKGROUND_TEXTURES,
  PROFILE_LAYOUT_OPTIONS,
  coerceProfileTheme,
  isValidAccentKey,
  isValidLayoutKey,
  isValidTextureKey,
} from "@/lib/profileThemeOptions";
import {
  MAX_PROFILE_AGE,
  MIN_PROFILE_AGE,
  normalizeUserAge,
  type HookdUser,
  type ProfileAccentKey,
  type ProfileLayoutKey,
  type ProfileTheme,
  type ProfileTextureKey,
} from "@/lib/firestore";
import { useProAccess } from "@/hooks/useProAccess";

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

type UserCatch = {
  id: string;
  species?: string;
  weight?: string;
  imageUrl?: string;
  imageUrls?: string[];
  trophy?: boolean;
  [key: string]: any;
};

type OwnedProfile = Omit<Partial<HookdUser>, "profileTheme"> & {
  uid: string;
  email?: string | null;
  profileTheme?: Partial<ProfileTheme> | null;
};

type EditProfileUser = OwnedProfile;

type EditProfileModalProps = {
  user: EditProfileUser;
  catches: UserCatch[];
  onClose: () => void;
};

function EditProfileModal({ user, catches, onClose }: EditProfileModalProps) {
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [username, setUserName] = useState(user?.username || "");
  const [about, setAbout] = useState(user?.about || "");
  const [ageInput, setAgeInput] = useState(
    user?.age != null && Number.isFinite(user.age) ? String(user.age) : "",
  );
  const [ageError, setAgeError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ProfileTheme>(() => {
    try {
      return coerceProfileTheme(user?.profileTheme ?? null, DEFAULT_PROFILE_THEME);
    } catch {
      return DEFAULT_PROFILE_THEME;
    }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>(user?.photoURL || "/logo.svg");
  const [bannerPreview, setBannerPreview] = useState<string>(
    user?.header || user?.photoURL || "/logo.svg",
  );
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(() => {
    if (!username) {
      return `Usernames must be at least ${USERNAME_MIN_LENGTH} characters long.`;
    }
    try {
      validateAndNormalizeUsername(username);
      return null;
    } catch (validationError: any) {
      return validationError?.message ?? "Invalid username.";
    }
  });

  const catchIdSet = useMemo(() => new Set(catches.map((item) => item.id)), [catches]);
  const defaultAvatar = useMemo(() => user?.photoURL || "/logo.svg", [user?.photoURL]);
  const defaultBanner = useMemo(
    () => user?.header || user?.photoURL || "/logo.svg",
    [user?.header, user?.photoURL],
  );

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(defaultAvatar);
    }
  }, [defaultAvatar, avatarFile]);

  useEffect(() => {
    if (!bannerFile) {
      setBannerPreview(defaultBanner);
    }
  }, [defaultBanner, bannerFile]);

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    return () => {
      if (bannerPreview?.startsWith("blob:")) URL.revokeObjectURL(bannerPreview);
    };
  }, [bannerPreview]);

  function validateFile(file: File) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      return "Please choose a PNG, JPG, GIF, or WebP image.";
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return "Images must be 5MB or smaller.";
    }
    return null;
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setAvatarFile(null);
      setAvatarPreview(defaultAvatar);
      setAvatarError(null);
      event.target.value = "";
      return;
    }
    const validationError = validateFile(file);
    if (validationError) {
      setAvatarFile(null);
      setAvatarError(validationError);
      setAvatarPreview(defaultAvatar);
      event.target.value = "";
      return;
    }
    setAvatarError(null);
    setAvatarFile(file);
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
  }

  function handleBannerChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setBannerFile(null);
      setBannerPreview(defaultBanner);
      setBannerError(null);
      event.target.value = "";
      return;
    }
    const validationError = validateFile(file);
    if (validationError) {
      setBannerFile(null);
      setBannerError(validationError);
      setBannerPreview(defaultBanner);
      event.target.value = "";
      return;
    }
    setBannerError(null);
    setBannerFile(file);
    const previewUrl = URL.createObjectURL(file);
    setBannerPreview(previewUrl);
  }

  const handleAccentSelect = (accentKey: ProfileAccentKey) => {
    if (!isValidAccentKey(accentKey)) {
      setError("Selected accent color is not supported.");
      return;
    }
    setError(null);
    setTheme((prev) => ({ ...prev, accentColor: accentKey }));
  };

  const handleTextureSelect = (textureKey: ProfileTextureKey) => {
    if (!isValidTextureKey(textureKey)) {
      setError("Selected background texture is not supported.");
      return;
    }
    setError(null);
    setTheme((prev) => ({ ...prev, backgroundTexture: textureKey }));
  };

  const handleLayoutSelect = (layoutKey: ProfileLayoutKey) => {
    if (!isValidLayoutKey(layoutKey)) {
      setError("Selected layout is not supported.");
      return;
    }
    setError(null);
    setTheme((prev) => ({ ...prev, layoutVariant: layoutKey }));
  };

  const handleFeaturedCatchSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setError(null);
    setTheme((prev) => ({ ...prev, featuredCatchId: value ? value : null }));
  };

  const handleUsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;

    try {
      const normalized = validateAndNormalizeUsername(value);
      setUsernameError(null);
      setUserName(normalized);
    } catch (validationError: any) {
      setUsernameError(validationError?.message ?? "Invalid username.");
      setUserName(value);
    }
  };

  const handleAgeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setAgeInput(value);

    if (!value.trim()) {
      setAgeError(null);
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      setAgeError("Please enter a valid age.");
      return;
    }

    if (numericValue < MIN_PROFILE_AGE || numericValue > MAX_PROFILE_AGE) {
      setAgeError(`Please enter an age between ${MIN_PROFILE_AGE} and ${MAX_PROFILE_AGE}.`);
      return;
    }

    setAgeError(null);
  };

  async function save() {
    try {
      setSaving(true);
      setError(null);
      setStatusMessage(null);

      if (avatarError || bannerError) {
        setError("Please resolve image upload issues before saving.");
        return;
      }

      if (
        !isValidAccentKey(theme.accentColor) ||
        !isValidTextureKey(theme.backgroundTexture) ||
        !isValidLayoutKey(theme.layoutVariant)
      ) {
        setError("Selected theme options are no longer supported. Please choose different presets.");
        return;
      }

      if (ageError) {
        setError(ageError);
        return;
      }

      if (theme.featuredCatchId && !catchIdSet.has(theme.featuredCatchId)) {
        setError("The selected featured catch is no longer available.");
        return;
      }

      const updates: Record<string, any> = {
        displayName,
        bio,
        about,
        profileTheme: {
          accentColor: theme.accentColor,
          backgroundTexture: theme.backgroundTexture,
          layoutVariant: theme.layoutVariant,
          featuredCatchId: theme.featuredCatchId ?? null,
        },
      };

      const trimmedAge = ageInput.trim();
      if (trimmedAge) {
        const normalizedAge = normalizeUserAge(trimmedAge);
        if (normalizedAge === null) {
          const message = `Please enter an age between ${MIN_PROFILE_AGE} and ${MAX_PROFILE_AGE}.`;
          setAgeError(message);
          setError(message);
          return;
        }
        if (normalizedAge < MIN_PROFILE_AGE || normalizedAge > MAX_PROFILE_AGE) {
          const message = `Please enter an age between ${MIN_PROFILE_AGE} and ${MAX_PROFILE_AGE}.`;
          setAgeError(message);
          setError(message);
          return;
        }
        setAgeError(null);
        updates.age = normalizedAge;
      } else {
        updates.age = null;
        setAgeError(null);
      }

      if (avatarFile) {
        setStatusMessage("Uploading avatar…");
        const avatarUrl = await uploadProfileAsset(user.uid, avatarFile, "avatar");
        updates.photoURL = avatarUrl;
      }

      if (bannerFile) {
        setStatusMessage("Uploading banner…");
        const headerUrl = await uploadProfileAsset(user.uid, bannerFile, "header");
        updates.header = headerUrl;
      }

      setStatusMessage("Saving profile…");
      await updateUserProfile(user.uid, updates);
      let normalizedUsername: string | null = null;
      if (username) {
        try {
          normalizedUsername = validateAndNormalizeUsername(username);
          setUsernameError(null);
        } catch (validationError: any) {
          const message = validationError?.message ?? "Invalid username.";
          setUsernameError(message);
          setError(message);
          return;
        }
      }

      if (normalizedUsername && normalizedUsername !== user.username) {
        const { setUsername } = await import("@/lib/firestore");
        await setUsername(user.uid, normalizedUsername);
      }
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStatusMessage(null);
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-xl font-semibold">Edit Profile</h3>
        <div className="space-y-4">
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
          />
          <div className="grid gap-1">
            <input
              className="input"
              value={username}
              onChange={handleUsernameChange}
              placeholder="Username (unique)"
            />
            <p
              className={clsx("text-xs", usernameError ? "text-red-400" : "text-white/50")}
            >
              {usernameError ??
                `Use at least ${USERNAME_MIN_LENGTH} characters. Letters, numbers, and underscores only.`}
            </p>
          </div>
          <div className="grid gap-1">
            <label className="text-sm text-white/70" htmlFor="age-input">
              Age (optional)
            </label>
            <input
              id="age-input"
              className="input"
              type="number"
              inputMode="numeric"
              min={MIN_PROFILE_AGE}
              max={MAX_PROFILE_AGE}
              value={ageInput}
              onChange={handleAgeChange}
              placeholder="Add your age"
              aria-invalid={ageError ? "true" : "false"}
            />
            <p className={clsx("text-xs", ageError ? "text-red-400" : "text-white/50")}
            >
              {ageError ?? `Enter a whole number between ${MIN_PROFILE_AGE} and ${MAX_PROFILE_AGE}.`}
            </p>
          </div>
          <textarea
            className="input min-h-[80px]"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Short bio"
          />
          <div className="grid gap-2">
            <label className="text-sm text-white/70" htmlFor="about-input">
              About (Markdown supported)
            </label>
            <textarea
              id="about-input"
              className="input min-h-[140px]"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Share your story, favorite techniques, or fishing philosophy."
            />
            <p className="text-xs text-white/50">
              Supports **bold**, _italic_, [links](https://example.com), lists, and inline code.
            </p>
          </div>

          <div className="grid gap-4 border-t border-white/10 pt-4">
            <div>
              <p className="text-sm font-medium text-white">Profile theme</p>
              <p className="text-xs text-white/60">
                Choose curated presets to keep your profile consistent and readable.
              </p>
            </div>

            <div className="grid gap-2">
              <span className="text-sm text-white/70">Accent color</span>
              <div className="flex flex-wrap gap-3">
                {Object.entries(PROFILE_ACCENT_OPTIONS).map(([key, option]) => {
                  const accentKey = key as ProfileAccentKey;
                  const selected = theme.accentColor === accentKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={clsx(
                        "flex w-[140px] flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                        selected ? "border-white/40 ring-2 ring-white/60" : "hover:border-white/25",
                      )}
                      onClick={() => handleAccentSelect(accentKey)}
                      aria-pressed={selected}
                      title={option.description}
                    >
                      <span
                        aria-hidden
                        className="h-12 w-full rounded-lg border border-white/20"
                        style={{ background: option.preview }}
                      />
                      <span className="text-xs font-medium text-white">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-sm text-white/70">Background texture</span>
              <div className="flex flex-wrap gap-3">
                {Object.entries(PROFILE_BACKGROUND_TEXTURES).map(([key, option]) => {
                  const textureKey = key as ProfileTextureKey;
                  const selected = theme.backgroundTexture === textureKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={clsx(
                        "flex w-[140px] flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                        selected ? "border-white/40 ring-2 ring-white/60" : "hover:border-white/25",
                      )}
                      style={{ backgroundImage: option.preview }}
                      onClick={() => handleTextureSelect(textureKey)}
                      aria-pressed={selected}
                      title={option.description}
                    >
                      <span className="text-xs font-medium text-white drop-shadow">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-sm text-white/70">Layout</span>
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
                {Object.entries(PROFILE_LAYOUT_OPTIONS).map(([key, option]) => {
                  const layoutKey = key as ProfileLayoutKey;
                  const selected = theme.layoutVariant === layoutKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={clsx(
                        "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:w-[calc(50%-0.5rem)]",
                        selected ? "border-white/40 ring-2 ring-white/60" : "hover:border-white/25",
                      )}
                      onClick={() => handleLayoutSelect(layoutKey)}
                      aria-pressed={selected}
                    >
                      <span className="text-sm font-semibold text-white">{option.label}</span>
                      <p className="mt-1 text-xs text-white/70">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm text-white/70" htmlFor="featured-catch-select">
                Featured catch
              </label>
              <select
                id="featured-catch-select"
                className="input"
                value={theme.featuredCatchId ?? ""}
                onChange={handleFeaturedCatchSelect}
                disabled={!catches.length}
              >
                <option value="">None</option>
                {catches.map((catchItem) => (
                  <option key={catchItem.id} value={catchItem.id}>
                    {catchItem.species || "Catch"}
                    {catchItem.weight ? ` • ${catchItem.weight}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-white/50">
                Highlight one of your catches as a hero image on your profile.
              </p>
              {!catches.length && (
                <p className="text-xs text-white/40">
                  You haven’t shared any catches yet. Post one to feature it here.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-2 border-t border-white/10 pt-4">
            <label className="text-sm text-white/70">Avatar</label>
            <div className="flex items-center gap-3">
              <img
                src={avatarPreview || "/logo.svg"}
                alt="Avatar preview"
                className="h-16 w-16 rounded-2xl border border-white/15 object-cover"
              />
              <input
                className="input"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                onChange={handleAvatarChange}
              />
            </div>
            {avatarError && <p className="text-sm text-red-400">{avatarError}</p>}
          </div>

          <div className="grid gap-2">
            <label className="text-sm text-white/70">Banner</label>
            <div className="flex items-center gap-3">
              <img
                src={bannerPreview || "/logo.svg"}
                alt="Banner preview"
                className="h-16 w-24 rounded-2xl border border-white/15 object-cover"
              />
              <input
                className="input"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                onChange={handleBannerChange}
              />
            </div>
            {bannerError && <p className="text-sm text-red-400">{bannerError}</p>}
          </div>

          {statusMessage && <p className="text-sm text-brand-300">{statusMessage}</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button className="rounded-xl border border-white/15 px-4 py-2 hover:bg-white/5" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={save}
              disabled={saving || Boolean(usernameError)}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [authUser, setAuthUser] = useState<any>(null);
  const [profile, setProfile] = useState<OwnedProfile | null>(null);
  const [catches, setCatches] = useState<UserCatch[]>([]);
  const [tackleStats, setTackleStats] = useState<UserTackleStats | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editing, setEditing] = useState(false);
  const [activeCatch, setActiveCatch] = useState<UserCatch | null>(null);
  const [isLogbookModalOpen, setIsLogbookModalOpen] = useState(false);
  const catchSummary = useMemo(() => summarizeCatchMetrics(catches), [catches]);
  const { isPro: hasProAccess } = useProAccess();
  const canManageLogbook = useMemo(() => Boolean(hasProAccess), [hasProAccess]);

  useEffect(() => {
    const auth = getAuth(app);
    let unsubscribeProfile: (() => void) | undefined;
    let unsubscribeCatches: (() => void) | undefined;
    let unsubscribeTackle: (() => void) | undefined;
    let unsubscribeTeams: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;
      unsubscribeCatches?.();
      unsubscribeCatches = undefined;
      unsubscribeTackle?.();
      unsubscribeTackle = undefined;

      setAuthUser(user);

      if (user) {
        const baseProfile: OwnedProfile = {
          uid: user.uid,
          displayName: user.displayName ?? undefined,
          photoURL: user.photoURL ?? undefined,
          email: user.email ?? undefined,
        };
        setProfile(baseProfile);

        unsubscribeProfile = subscribeToUser(user.uid, (data) => {
          setProfile(data ? { ...baseProfile, ...data } : baseProfile);
        });
        unsubscribeCatches = subscribeToUserCatches(user.uid, (items) => {
          setCatches(items);
          setActiveCatch((current) => {
            if (!current) return current;
            return items.find((item) => item.id === current.id) ?? null;
          });
        });
        unsubscribeTackle = subscribeToUserTackleStats(user.uid, (stats) => {
          setTackleStats(stats);
        });
        unsubscribeTeams = subscribeToTeamsForUser(user.uid, (items) => {
          setTeams(items);
        });
      } else {
        setProfile(null);
        setCatches([]);
        setActiveCatch(null);
        setTackleStats(null);
        setTeams([]);
      }
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeCatches?.();
      unsubscribeTackle?.();
      unsubscribeTeams?.();
      unsubscribeAuth();
    };
  }, []);

  if (!authUser) {
    return (
      <main>
        <NavBar />
        <section className="container pt-28 pb-10">
          <div className="card p-6">
            <p className="text-white/70">Please sign in to view your profile.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <NavBar />
      <section className="container pt-28 pb-10">
        <ProfileView
          profile={profile}
          catches={catches}
          isOwner
          onEditProfile={() => setEditing(true)}
          onOpenLogbook={canManageLogbook ? () => setIsLogbookModalOpen(true) : undefined}
          onCatchSelect={(catchItem) => setActiveCatch(catchItem)}
          catchSummary={catchSummary}
          tackleStats={tackleStats}
          teams={teams}
        />
      </section>

      {editing && (
        <EditProfileModal
          user={{ ...profile, uid: authUser.uid }}
          catches={catches}
          onClose={() => setEditing(false)}
        />
      )}
      {activeCatch && (
        <PostDetailModal post={activeCatch} onClose={() => setActiveCatch(null)} />
      )}
      {canManageLogbook && (
        <LogbookModal open={isLogbookModalOpen} onClose={() => setIsLogbookModalOpen(false)} />
      )}
    </main>
  );
}
