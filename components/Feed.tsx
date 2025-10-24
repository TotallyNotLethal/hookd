'use client';
import { useEffect, useState } from 'react';
import { db, auth } from '../firebaseClient';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Heart, MessageSquare, Trash2 } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';

export default function Feed() {
  const [posts, setPosts] = useState([]);
  const [user] = useAuthState(auth);

  useEffect(() => {
    const q = query(collection(db, 'catches'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updated = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPosts(updated);
    });
    return () => unsubscribe();
  }, []);

  const toggleLike = async (postId, likes) => {
    if (!user) return alert('Please sign in to like posts');
    const postRef = doc(db, 'catches', postId);
    const liked = likes?.includes(user.uid);
    await updateDoc(postRef, {
      likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
    });
  };

  const deletePost = async (id) => {
    if (confirm('Delete this catch?')) {
      await deleteDoc(doc(db, 'catches', id));
    }
  };

  return (
    <div className="space-y-6 mt-8">
      {posts.map((post) => (
        <div key={post.id} className="glass rounded-2xl p-4">
          <img src={post.imageUrl} alt={post.species} className="w-full rounded-xl mb-3" />
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">{post.species}</h3>
            {user?.uid === post.userId && (
              <button onClick={() => deletePost(post.id)} className="text-red-400 hover:text-red-300">
                <Trash2 size={18} />
              </button>
            )}
          </div>
          <p className="text-sm opacity-80">{post.location}</p>
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => toggleLike(post.id, post.likes || [])}
              className={`flex items-center gap-1 ${post.likes?.includes(user?.uid) ? 'text-red-500' : 'opacity-60 hover:opacity-100'}`}
            >
              <Heart size={16} /> {post.likes?.length || 0}
            </button>
            <div className="flex items-center gap-1 opacity-60">
              <MessageSquare size={16} /> {post.commentsCount || 0}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}