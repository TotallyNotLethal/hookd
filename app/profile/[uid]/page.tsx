'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { doc, getDoc, getDocs, collection, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import PostCard from '@/components/PostCard';
import PostDetailModal from '@/app/feed/PostDetailModal';

export default function ProfilePage() {
  const { uid } = useParams();
  const [user, setUser] = useState<any>(null);
  const [catches, setCatches] = useState<any[]>([]);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);

  // Load user info
  useEffect(() => {
    if (!uid) return;
    const loadUser = async () => {
      const snap = await getDoc(doc(db, 'users', uid as string));
      if (snap.exists()) setUser(snap.data());
    };
    loadUser();
  }, [uid]);

  // Fetch all user catches (includes IDs)
  useEffect(() => {
    if (!uid) return;
    const loadCatches = async () => {
      const q = query(collection(db, 'catches'), where('uid', '==', uid), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCatches(arr);
    };
    loadCatches();
  }, [uid]);

  if (!user)
    return (
      <div className="flex justify-center items-center h-screen text-white/70">
        Loading profile...
      </div>
    );

  return (
    <div className="p-6 text-white">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName}
            className="w-20 h-20 rounded-full object-cover border border-white/10"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-3xl font-semibold">
            {user.displayName?.[0]?.toUpperCase() || '?'}
          </div>
        )}

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
  {user.isTester ? (
    <>
      <span className="text-brand-300">hookd_{user.username || user.displayName}</span>
      <span className="text-blue-400" title="Tester">✔</span>
    </>
  ) : (
    <>{user.username || user.displayName}</>
  )}
</h1>
          {user.bio && <p className="opacity-80 mt-1">{user.bio}</p>}
          <div className="text-sm opacity-60 mt-1">
            {user.followers?.length || 0} followers · {user.following?.length || 0} following
          </div>
        </div>
      </div>

      {/* All catches */}
      <div>
        <h2 className="text-lg font-semibold mb-3">🎣 All Catches</h2>
        {catches.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {catches.map((post) => (
              <PostCard key={post.id} post={post} onOpen={setSelectedPost} />
            ))}
          </div>
        ) : (
          <p className="text-white/60 text-sm">No catches yet.</p>
        )}
      </div>

      {/* Modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
