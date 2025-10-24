//THIS IS IN components folder
'use client';
import { useState } from 'react';
import { db, storage, auth } from '@/lib/firebaseClient';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';

export default function AddCatchModal({ onClose }) {
  const [file, setFile] = useState(null);
  const [species, setSpecies] = useState('');
  const [weight, setWeight] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [isTrophy, setIsTrophy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [user] = useAuthState(auth);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return alert('Sign in first!');
    if (!file) return alert('Upload an image');

    setUploading(true);
    try {
      const storageRef = ref(storage, `catches/${user.uid}-${Date.now()}`);
	  console.log('Uploading to bucket:', storage.bucket);

      await uploadBytes(storageRef, file);
      const imageUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'catches'), {
        userId: user.uid,
        userName: user.displayName,
        species,
        weight,
        location,
        notes,
        isTrophy,
        imageUrl,
        likes: [],
        commentsCount: 0,
        createdAt: serverTimestamp(),
      });

      alert('Catch uploaded!');
      setUploading(false);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error uploading catch');
      setUploading(false);
    }
  };

  return (
    <div className="modal">
      <form onSubmit={handleSubmit} className="modal-content glass p-6 rounded-xl w-[400px]">
        <h2 className="text-lg font-semibold mb-4">Add Catch</h2>
        <input type="file" onChange={(e) => setFile(e.target.files[0])} required />
        <input className="input" placeholder="Species" value={species} onChange={(e) => setSpecies(e.target.value)} required />
        <input className="input" placeholder="Weight" value={weight} onChange={(e) => setWeight(e.target.value)} required />
        <input className="input" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} required />
        <textarea className="input" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <label className="flex items-center gap-2 mt-2">
          <input type="checkbox" checked={isTrophy} onChange={(e) => setIsTrophy(e.target.checked)} />
          Mark as Trophy Catch
        </label>
        <div className="flex justify-end gap-3 mt-4">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={uploading} className="btn-primary">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  );
}
