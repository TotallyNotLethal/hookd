'use client';

import NavBar from "@/components/NavBar";
import ProfileView from "@/components/ProfileView";
import { app } from "@/lib/firebaseClient";
import { subscribeToUser, subscribeToUserCatches, updateUserProfile } from "@/lib/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";

function EditProfileModal({ user, onClose }: { user: any; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [username, setUserName] = useState(user?.username || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    try {
      setSaving(true);
      setError("");
      await updateUserProfile(user.uid, { displayName, bio });
      if (username && username !== user.username) {
        const { setUsername } = await import("@/lib/firestore");
        await setUsername(user.uid, username);
      }
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
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
