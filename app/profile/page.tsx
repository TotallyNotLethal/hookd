'use client';

import NavBar from "@/components/NavBar";
import ProfileView from "@/components/ProfileView";
import { app } from "@/lib/firebaseClient";
import {
  subscribeToUser,
  subscribeToUserCatches,
  updateUserProfile,
  uploadProfileAsset,
} from "@/lib/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function EditProfileModal({ user, onClose }: { user: any; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [username, setUserName] = useState(user?.username || "");
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

  async function save() {
    try {
      setSaving(true);
      setError(null);
      setStatusMessage(null);

      if (avatarError || bannerError) {
        setError("Please resolve image upload issues before saving.");
        return;
      }

      const updates: Record<string, any> = {
        displayName,
        bio,
      };

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
      if (username && username !== user.username) {
        const { setUsername } = await import("@/lib/firestore");
        await setUsername(user.uid, username);
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-semibold mb-4">Edit Profile</h3>
        <div className="space-y-3">
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
          />
          <input
            className="input"
            value={username}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Username (unique)"
          />
          <textarea
            className="input min-h-[80px]"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Short bio"
          />
          <div className="grid gap-2">
            <label className="text-sm text-white/70">Avatar</label>
            <div className="flex items-center gap-3">
              <img
                src={avatarPreview || "/logo.svg"}
                alt="Avatar preview"
                className="h-16 w-16 rounded-2xl object-cover border border-white/15"
              />
              <input
                className="input"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                onChange={handleAvatarChange}
              />
            </div>
            {avatarError && <p className="text-red-400 text-sm">{avatarError}</p>}
          </div>
          <div className="grid gap-2">
            <label className="text-sm text-white/70">Banner</label>
            <div className="flex items-center gap-3">
              <img
                src={bannerPreview || "/logo.svg"}
                alt="Banner preview"
                className="h-16 w-24 rounded-2xl object-cover border border-white/15"
              />
              <input
                className="input"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                onChange={handleBannerChange}
              />
            </div>
            {bannerError && <p className="text-red-400 text-sm">{bannerError}</p>}
          </div>
          {statusMessage && <p className="text-brand-300 text-sm">{statusMessage}</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
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
  const [profile, setProfile] = useState<any>(null);
  const [catches, setCatches] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const auth = getAuth(app);
    let unsubscribeProfile: (() => void) | undefined;
    let unsubscribeCatches: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;
      unsubscribeCatches?.();
      unsubscribeCatches = undefined;

      setAuthUser(user);

      if (user) {
        const baseProfile = {
          uid: user.uid,
          displayName: user.displayName ?? undefined,
          photoURL: user.photoURL ?? undefined,
          email: user.email ?? undefined,
        };
        setProfile(baseProfile);

        unsubscribeProfile = subscribeToUser(user.uid, (data) => {
          setProfile(data ? { ...baseProfile, ...data } : baseProfile);
        });
        unsubscribeCatches = subscribeToUserCatches(user.uid, setCatches);
      } else {
        setProfile(null);
        setCatches([]);
      }
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeCatches?.();
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
        <ProfileView profile={profile} catches={catches} isOwner onEditProfile={() => setEditing(true)} />
      </section>

      {editing && <EditProfileModal user={{ ...profile, uid: authUser.uid }} onClose={() => setEditing(false)} />}
    </main>
  );
}
