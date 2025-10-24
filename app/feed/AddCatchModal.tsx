//THIS IS IN app\feed folder
'use client';
import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebaseClient';
import { createCatch } from '@/lib/firestore';

export default function AddCatchModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [species, setSpecies] = useState('');
  const [weight, setWeight] = useState('');
  const [location, setLocation] = useState('');
  const [caption, setCaption] = useState('');
  const [trophy, setTrophy] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const user = getAuth(app).currentUser;
    if (!user) return alert('Please sign in first.');
    if (!file) return alert('Please add a photo of your catch.');

    setLoading(true);
    try {
      await createCatch({
        uid: user.uid,
        displayName: user.displayName || 'Angler',
        userPhoto: user.photoURL || undefined,
        species, weight, location, caption, trophy,
        file
      });
      onClose();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-semibold mb-4">Add Catch</h3>
        <div className="space-y-3">
          <input type="file" accept="image/*" onChange={(e)=> setFile(e.target.files?.[0] || null)} className="block w-full text-sm" />
          <input className="input" placeholder="Species (e.g., Largemouth Bass)" value={species} onChange={e=>setSpecies(e.target.value)} />
          <input className="input" placeholder="Weight (e.g., 3.4 lb)" value={weight} onChange={e=>setWeight(e.target.value)} />
          <input className="input" placeholder="Location (optional)" value={location} onChange={e=>setLocation(e.target.value)} />
          <textarea className="input min-h-[80px]" placeholder="Caption" value={caption} onChange={e=>setCaption(e.target.value)} />
          <label className="flex items-center gap-2 text-white/80">
            <input type="checkbox" checked={trophy} onChange={e=>setTrophy(e.target.checked)} />
            Mark as Trophy catch
          </label>
          <div className="flex gap-3 justify-end pt-2">
            <button className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={submit} disabled={loading}>{loading ? 'Uploading…' : 'Post'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
