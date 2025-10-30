'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { MouseEvent } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebaseClient';
import {
  toggleLike,
  subscribeToUserLike,
  subscribeToLikesCount,
  deleteCatch,
  followUser,
  unfollowUser,
  subscribeToUser,
} from '@/lib/firestore';
import { Heart, MessageSquare, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ProBadge from './ProBadge';


export default function PostCard({ post, onOpen }: { post: any; onOpen?: (p: any) => void }) {
  const [user] = useAuthState(auth);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(post.likesCount || 0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const router = useRouter();
  const locationIsPrivate = Boolean(post.locationPrivate);
  const canShowLocation =
    post.location && (!locationIsPrivate || (user && user.uid === post.uid));
  const images = useMemo(() => {
    if (Array.isArray(post?.imageUrls) && post.imageUrls.length > 0) {
      return post.imageUrls.filter((url: unknown): url is string => typeof url === 'string');
    }
    return post?.imageUrl ? [post.imageUrl] : [];
  }, [post?.imageUrl, post?.imageUrls]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [post?.id, images.length]);

  const showPrevImage = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      setCurrentImageIndex((prev) => {
        if (images.length === 0) return prev;
        return prev === 0 ? images.length - 1 : prev - 1;
      });
    },
    [images.length],
  );

  const showNextImage = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      setCurrentImageIndex((prev) => {
        if (images.length === 0) return prev;
        return prev === images.length - 1 ? 0 : prev + 1;
      });
    },
    [images.length],
  );


  useEffect(() => {
    if (!user) return;
    const u1 = subscribeToUserLike(post.id, user.uid, setLiked);
    const u2 = subscribeToLikesCount(post.id, setLikesCount);
    return () => {
      u1();
      u2();
    };
  }, [user, post.id]);

  useEffect(() => {
    if (!user || user.uid === post.uid) return;

    const unsubscribe = subscribeToUser(post.uid, (data) => {
      if (!data) {
        setIsFollowing(false);
        return;
      }
      const followers: string[] = Array.isArray(data.followers) ? data.followers : [];
      setIsFollowing(followers.includes(user.uid));
    });

    return () => {
      unsubscribe();
    };
  }, [post.uid, user]);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent modal from opening
    if (!user) return alert('Sign in to like posts!');
    await toggleLike(post.id, user.uid);
  };

  useEffect(() => {
    if (!user || user.uid === post.uid) {
      setIsFollowing(false);
    }
  }, [post.uid, user]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent modal from opening
    if (!user || user.uid !== post.uid) return;
    if (confirm('Delete this catch?')) await deleteCatch(post.id);
  };

  const handleFollowToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      alert('Sign in to follow anglers!');
      return;
    }
    if (user.uid === post.uid || followPending) return;

    setFollowPending(true);
    try {
      if (isFollowing) {
        await unfollowUser(user.uid, post.uid);
      } else {
        await followUser(user.uid, post.uid);
      }
    } finally {
      setFollowPending(false);
    }
  };

  const isProMember = Boolean(
    post?.isPro ||
      post?.user?.isPro ||
      post?.userIsPro ||
      post?.user?.membership === 'pro' ||
      post?.membership === 'pro',
  );

  return (
    <div
      onClick={() => onOpen?.(post)}
      className="cursor-pointer card p-4 hover:bg-white/5 transition"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {post.userPhoto && <img src={post.userPhoto} className="w-8 h-8 rounded-full" alt="" />}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">{post.displayName}</p>
              {isProMember && <ProBadge className="text-[10px]" />}
            </div>
            {canShowLocation ? (
              <p className="text-xs opacity-70">{post.location}</p>
            ) : locationIsPrivate ? (
              <p className="text-xs italic opacity-60">Private location</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user?.uid !== post.uid && (
            <button
              onClick={handleFollowToggle}
              className={`px-3 py-1 text-sm rounded-full border transition ${
                isFollowing
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-brand-400 text-brand-200 hover:bg-brand-400/10'
              } ${followPending ? 'opacity-60 cursor-not-allowed' : 'hover:border-brand-300'}`}
              disabled={followPending}
            >
              {isFollowing ? 'Unfollow' : 'Follow'}
            </button>
          )}
          {user?.uid === post.uid && (
            <button
              onClick={handleDelete}
              className="text-red-400 hover:text-red-300"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      {images.length > 0 && (
        <div className="relative w-full mb-3 overflow-hidden rounded-xl bg-black/40 aspect-[4/5]">
          <img
            src={images[currentImageIndex]}
            alt={post.species}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={showPrevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={showNextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
              >
                ›
              </button>
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                {images.map((_, index) => (
                  <span
                    key={index}
                    className={`h-2 w-2 rounded-full transition ${
                      index === currentImageIndex ? 'bg-white' : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
	  
	  <p className="mt-2 text-sm opacity-80">
  Posted by{" "}
  <span
    className="font-medium text-blue-400 hover:underline cursor-pointer"
    onClick={(e) => {
      e.stopPropagation();
      router.push(`/profile/${post.uid}`);
    }}
  >
    {post.displayName || post.user.name}
  </span>
</p>


      <p className="font-medium">{post.species}</p>
      {post.caption && <p className="opacity-80 text-sm">{post.caption}</p>}

      <div className="flex items-center justify-between mt-3">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1 transition-colors ${
            liked ? 'text-red-500' : 'opacity-60 hover:opacity-100'
          }`}
        >
          <Heart className={`w-5 h-5 ${liked ? 'fill-red-500 stroke-red-500' : ''}`} />
          <span>{likesCount}</span>
        </button>

        <div className="flex items-center gap-1 opacity-60">
          <MessageSquare size={16} />
          <span>{post.commentsCount || 0}</span>
        </div>
      </div>
    </div>
  );
}
