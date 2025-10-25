'use client';
import NavBar from "@/components/NavBar";
import Image from "next/image";
import { app } from "@/lib/firebaseClient";
import { onAuthStateChanged, getAuth } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { subscribeToUser, subscribeToUserCatches, updateUserProfile } from "@/lib/firestore";

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
      // Update display name & bio
      await updateUserProfile(user.uid, { displayName, bio });
      // Update username if changed
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
    return onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      if (u) {
        const unsubU = subscribeToUser(u.uid, (data) => setProfile({ uid: u.uid, ...data }));
        const unsubC = subscribeToUserCatches(u.uid, setCatches);
        return () => { unsubU(); unsubC(); };
      }
    });
  }, []);

  const trophies = useMemo(() => catches.filter(c => c.trophy), [catches]);
  const others = useMemo(() => catches.filter(c => !c.trophy), [catches]);

  if (!authUser) {
    return (
      <main>
        <NavBar />
        <section className="container pt-28 pb-10">
          <div className="card p-6"><p className="text-white/70">Please sign in to view your profile.</p></div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <NavBar />
      <section className="container pt-28 pb-10">
        <div className="card overflow-hidden">
          <div className="relative h-40 w-full">
            <Image src={profile?.header || authUser.photoURL || '/logo.svg'} alt="Header" fill className="object-cover opacity-60" />
          </div>
          <div className="p-4 md:p-6">
            <div className="flex items-center gap-4">
              <Image src={authUser.photoURL || '/logo.svg'} alt="me" width={80} height={80} className="rounded-2xl -mt-12 border-4 border-[var(--card)]" />
              <div>
                <h1 className="text-2xl font-semibold flex items-center gap-2">
  {profile?.isTester ? (
    <>
      <span className="text-brand-300">hookd_{profile?.username || profile?.displayName}</span>
      <span className="text-blue-400" title="Tester">✔</span>
    </>
  ) : (
    <>{profile?.username || profile?.displayName || "Angler"}</>
  )}
</h1>

                <p className="text-white/60">{authUser.email}</p>
                <p className="text-white/70 text-sm mt-1">
                  <span className="font-medium">{(profile?.followers || []).length}</span> followers •{" "}
                  <span className="font-medium">{(profile?.following || []).length}</span> following
                </p>
              </div>
              <div className="ml-auto">
                <button className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5" onClick={() => setEditing(true)}>Edit Profile</button>
              </div>
            </div>
            {profile?.bio && <p className="text-white/80 mt-4">{profile.bio}</p>}
          </div>
        </div>

        {/* Trophy slider */}
        <h2 className="mt-8 mb-3 text-lg text-white/80">Trophy Catches</h2>
        {trophies.length ? (
          <div className="flex gap-4 overflow-auto pb-2">
            {trophies.map((t) => (
              <div key={t.id} className="min-w-[260px] h-[180px] relative rounded-2xl overflow-hidden border border-white/10">
                <Image src={t.imageUrl} alt={t.species || 'trophy'} fill className="object-cover" />
                <div className="absolute bottom-0 left-0 right-0 p-2 text-sm bg-gradient-to-t from-black/60 to-transparent">
                  <span className="font-medium">{t.species}</span>{t.weight ? ` • ${t.weight}` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-white/60">No trophies yet. Mark a catch as a trophy when you upload.</p>
        )}

        {/* All catches grid */}
        <h2 className="mt-8 mb-3 text-lg text-white/80">All Catches</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {others.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-2xl overflow-hidden border border-white/10">
              <Image src={p.imageUrl} alt={p.species || 'catch'} fill className="object-cover" />
            </div>
          ))}
          {others.length === 0 && <p className="text-white/60">No catches posted yet.</p>}
        </div>
      </section>

      {editing && <EditProfileModal user={{...profile, uid: authUser.uid}} onClose={() => setEditing(false)} />}
    </main>
  );
}
