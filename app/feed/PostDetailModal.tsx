'use client';
import { useEffect, useState } from 'react';
import { addComment, subscribeToComments, subscribeToUserLike, toggleLike } from '@/lib/firestore';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebaseClient';
import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = Math.floor((now - timestamp) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function PostDetailModal({ post, onClose }: { post: any; onClose: () => void }) {
  const auth = getAuth(app);
  const user = auth.currentUser;
  const router = useRouter();
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [liked, setLiked] = useState(false);
  const locationIsPrivate = Boolean(post?.locationPrivate);
  const canShowLocation =
    post?.location && (!locationIsPrivate || (user && user.uid === post.uid));

  useEffect(() => {
    if (!user?.uid || !post?.id) return;
    const unsubLike = subscribeToUserLike(post.id, user.uid, setLiked);
    const unsubComments = subscribeToComments(post.id, setComments);
    return () => {
      unsubLike?.();
      unsubComments?.();
    };
  }, [post.id, user?.uid]);

  async function sendComment() {
    if (!user || !text.trim()) return;
    await addComment(post.id, {
      uid: user.uid,
      displayName: user.displayName || 'Angler',
      photoURL: user.photoURL || undefined,
      text,
    });
    setText('');
  }

  const postTime = post?.createdAt?.seconds
    ? timeAgo(post.createdAt.seconds * 1000)
    : null;

  return (
    <AnimatePresence>
      {post && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />

          {/* Modal container */}
          <motion.div
            className="relative bg-[var(--card)] border border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl"
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Image with zoom animation */}
              <motion.div
                className="relative md:min-h-[480px] overflow-hidden"
                initial={{ scale: 1.05 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                {post.imageUrl && (
                  <img
                    src={post.imageUrl}
                    alt={post.species}
                    className="w-full h-full object-cover"
                  />
                )}
              </motion.div>

              {/* Right side (content) */}
              <div className="p-4 pb-20 relative flex flex-col h-full">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{post.species}</h3>
                  <button onClick={onClose} className="opacity-70 hover:opacity-100 text-lg">
                    ✕
                  </button>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <div
                    className="text-sm text-blue-400 hover:underline cursor-pointer font-medium"
                    onClick={() => router.push(`/profile/${post.uid}`)}
                  >
                    {post.displayName || post.user.name}
                  </div>
                  {postTime && <span className="text-xs opacity-60">{postTime}</span>}
                </div>

                {post.caption && (
                  <p className="text-sm opacity-80 mb-2 whitespace-pre-line">{post.caption}</p>
                )}

                {(post.weight || post.location) && (
                  <p className="text-xs opacity-60 mb-2">
                    {post.weight && <>Weight: {post.weight}</>}{' '}
                    {canShowLocation ? (
                      <span>• {post.location}</span>
                    ) : locationIsPrivate && post.location ? (
                      <span>• Private location</span>
                    ) : null}
                  </p>
                )}


                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={() => user && toggleLike(post.id, user.uid)}
                    className={`flex items-center gap-1 transition ${
                      liked ? 'text-red-500' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    <Heart
                      className={`w-5 h-5 ${
                        liked ? 'fill-red-500 stroke-red-500' : ''
                      }`}
                    />
                  </button>
                  <span className="opacity-60 text-sm">{comments.length} comments</span>
                </div>

                <div className="space-y-3 overflow-y-auto max-h-[320px] pr-2 pb-16 flex-1">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className="text-sm flex flex-col border-b border-white/5 pb-2"
                    >
                      <div>
                        <span
                          className="font-medium text-blue-400 hover:underline cursor-pointer"
                          onClick={() => router.push(`/profile/${c.uid}`)}
                        >
                          {c.displayName}
                        </span>{' '}
                        {c.text}
                      </div>
                      {c.createdAt?.seconds && (
                        <span className="text-xs opacity-50 mt-0.5">
                          {timeAgo(c.createdAt.seconds * 1000)}
                        </span>
                      )}
                    </div>
                  ))}

                  {comments.length === 0 && (
                    <p className="opacity-60 text-sm text-center">
                      No comments yet.
                    </p>
                  )}
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-3 bg-[var(--card)] border-t border-white/10">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-md bg-white/10 text-white px-3 py-2 text-sm outline-none"
                      placeholder="Write a comment…"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendComment()}
                    />
                    <button
                      className="px-3 py-2 bg-blue-500 rounded-md text-sm font-medium hover:bg-blue-600"
                      onClick={sendComment}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
