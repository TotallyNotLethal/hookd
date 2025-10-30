'use client';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  addComment,
  deleteCatch,
  deleteComment,
  subscribeToComments,
  subscribeToUserLike,
  toggleLike,
} from '@/lib/firestore';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebaseClient';
import { Heart, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ProBadge from '@/components/ProBadge';

function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = Math.floor((now - timestamp) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

interface PostDetailModalProps {
  post: any;
  onClose: () => void;
  size?: 'default' | 'wide';
  onNavigateNext?: () => void;
  onNavigatePrevious?: () => void;
}

export default function PostDetailModal({
  post,
  onClose,
  size = 'default',
  onNavigateNext,
  onNavigatePrevious,
}: PostDetailModalProps) {
  const auth = getAuth(app);
  const user = auth.currentUser;
  const router = useRouter();
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [liked, setLiked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [commentActionBusy, setCommentActionBusy] = useState<string | null>(null);
  const locationIsPrivate = Boolean(post?.locationPrivate);
  const canShowLocation =
    post?.location && (!locationIsPrivate || (user && user.uid === post.uid));
  const isOwner = user?.uid === post?.uid;
  const images = useMemo(() => {
    if (Array.isArray(post?.imageUrls) && post.imageUrls.length > 0) {
      return post.imageUrls.filter((url: unknown): url is string => typeof url === 'string');
    }
    return post?.imageUrl ? [post.imageUrl] : [];
  }, [post?.imageUrl, post?.imageUrls]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageTransitionDirection, setImageTransitionDirection] = useState<1 | -1>(1);
  const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1);

  useEffect(() => {
    setActiveImageIndex(0);
    setImageTransitionDirection(1);
  }, [post?.id, images.length]);

  useEffect(() => {
    if (!post) return;
    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarGap = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarGap > 0) {
      body.style.paddingRight = `${scrollbarGap}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [post]);

  const showPrevImage = useCallback(
    (event?: { stopPropagation?: () => void }) => {
      event?.stopPropagation?.();
      setImageTransitionDirection(-1);
      setActiveImageIndex((prev) => {
        if (images.length === 0) return prev;
        return prev === 0 ? images.length - 1 : prev - 1;
      });
    },
    [images.length],
  );

  const showNextImage = useCallback(
    (event?: { stopPropagation?: () => void }) => {
      event?.stopPropagation?.();
      setImageTransitionDirection(1);
      setActiveImageIndex((prev) => {
        if (images.length === 0) return prev;
        return prev === images.length - 1 ? 0 : prev + 1;
      });
    },
    [images.length],
  );

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

  async function handleDelete() {
    if (!post?.id || !isOwner || deleting) return;
    if (!confirm('Delete this catch?')) return;
    try {
      setDeleting(true);
      await deleteCatch(post.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!post?.id || !user?.uid || commentActionBusy) return;
    const target = comments.find((comment) => comment.id === commentId);
    if (!target) return;

    const canDelete = target.uid === user.uid || isOwner;
    if (!canDelete) return;

    if (!confirm('Delete this comment?')) return;

    const previousComments = comments;
    setCommentActionBusy(commentId);
    setComments((prev) => prev.filter((comment) => comment.id !== commentId));

    try {
      await deleteComment(post.id, commentId, user.uid);
    } catch (error) {
      console.error('Failed to delete comment', error);
      setComments(previousComments);
      alert('Failed to delete comment. Please try again.');
    } finally {
      setCommentActionBusy(null);
    }
  }

  const postTime = post?.createdAt?.seconds
    ? timeAgo(post.createdAt.seconds * 1000)
    : null;
  const isProMember = Boolean(
    post?.isPro ||
      post?.user?.isPro ||
      post?.userIsPro ||
      post?.user?.membership === 'pro' ||
      post?.membership === 'pro',
  );

  const isWide = size === 'wide';
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const imageGestureStateRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    isActive: boolean;
  } | null>(null);
  const touchStateRef = useRef<{ y: number; path: EventTarget[] } | null>(null);
  const wheelStateRef = useRef<{ delta: number; direction: 1 | -1 | 0 }>({ delta: 0, direction: 0 });
  const navigationCooldownRef = useRef<number | null>(null);

  const modalContainerClasses = `relative bg-[var(--card)] border border-white/10 rounded-2xl w-full ${
    isWide ? 'max-w-5xl' : 'max-w-3xl'
  } max-h-[90vh] overflow-y-auto md:max-h-[85vh] md:overflow-hidden shadow-2xl`;
  const layoutClasses = `flex flex-col md:grid ${isWide ? 'md:grid-cols-[1.15fr_0.85fr]' : 'md:grid-cols-2'}`;
  const imageWrapperClasses = `relative h-64 sm:h-80 md:h-full ${
    isWide ? 'md:min-h-[540px]' : 'md:min-h-[480px]'
  } bg-black/60 flex items-center justify-center`;

  const buildPathFromTarget = useCallback((target: EventTarget | null) => {
    const path: EventTarget[] = [];
    if (!target || !(target instanceof Node)) return path;
    let current: Node | null = target;
    const overlayEl = overlayRef.current;
    while (current) {
      path.push(current);
      if (current === overlayEl) {
        break;
      }
      current = current.parentNode;
    }
    return path;
  }, []);

  const canScrollInPath = useCallback(
    (path: ReadonlyArray<EventTarget>, direction: 'up' | 'down') => {
      const overlayEl = overlayRef.current;
      if (!overlayEl) return false;

      for (const node of path) {
        if (!(node instanceof HTMLElement)) continue;
        if (!overlayEl.contains(node)) continue;

        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        if (overflowY !== 'auto' && overflowY !== 'scroll') continue;

        const scrollHeight = node.scrollHeight;
        const clientHeight = node.clientHeight;
        if (scrollHeight <= clientHeight + 1) continue;

        const maxScrollTop = scrollHeight - clientHeight;
        if (direction === 'up' && node.scrollTop > 0) {
          return true;
        }
        if (direction === 'down' && node.scrollTop < maxScrollTop - 1) {
          return true;
        }
      }

      return false;
    },
    [],
  );

  const triggerNavigation = useCallback(
    (type: 'next' | 'previous') => {
      if (navigationCooldownRef.current !== null) return;
      if (type === 'next' && onNavigateNext) {
        setTransitionDirection(1);
        onNavigateNext();
      } else if (type === 'previous' && onNavigatePrevious) {
        setTransitionDirection(-1);
        onNavigatePrevious();
      } else {
        return;
      }

      navigationCooldownRef.current = window.setTimeout(() => {
        navigationCooldownRef.current = null;
      }, 450);
    },
    [onNavigateNext, onNavigatePrevious],
  );

  useEffect(() => {
    return () => {
      if (navigationCooldownRef.current !== null) {
        window.clearTimeout(navigationCooldownRef.current);
        navigationCooldownRef.current = null;
      }
    };
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!post || (!onNavigateNext && !onNavigatePrevious)) return;
      const overlayEl = overlayRef.current;
      if (!overlayEl) return;
      if (!overlayEl.contains(event.target as Node)) return;
      if (event.ctrlKey) return;

      const path = typeof event.composedPath === 'function' ? event.composedPath() : buildPathFromTarget(event.target);
      const direction = event.deltaY > 0 ? 'down' : 'up';
      if (canScrollInPath(path, direction)) {
        wheelStateRef.current = { delta: 0, direction: 0 };
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const currentState = wheelStateRef.current;
      const sign: 1 | -1 | 0 = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
      if (sign === 0) return;

      if (currentState.direction !== 0 && currentState.direction !== sign) {
        wheelStateRef.current = { delta: event.deltaY, direction: sign };
      } else {
        wheelStateRef.current = {
          delta: (currentState.direction === sign ? currentState.delta : 0) + event.deltaY,
          direction: sign,
        };
      }

      const threshold = 120;
      if (wheelStateRef.current.direction === 1 && wheelStateRef.current.delta > threshold) {
        triggerNavigation('next');
        wheelStateRef.current = { delta: 0, direction: 0 };
      } else if (wheelStateRef.current.direction === -1 && wheelStateRef.current.delta < -threshold) {
        triggerNavigation('previous');
        wheelStateRef.current = { delta: 0, direction: 0 };
      }
    },
    [buildPathFromTarget, canScrollInPath, onNavigateNext, onNavigatePrevious, post, triggerNavigation],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!post || (!onNavigateNext && !onNavigatePrevious)) return;
      const overlayEl = overlayRef.current;
      if (!overlayEl) return;

      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        if (onNavigateNext) {
          event.preventDefault();
          triggerNavigation('next');
        }
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        if (onNavigatePrevious) {
          event.preventDefault();
          triggerNavigation('previous');
        }
      }
    },
    [onNavigateNext, onNavigatePrevious, post, triggerNavigation],
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!post || (!onNavigateNext && !onNavigatePrevious)) return;
      const overlayEl = overlayRef.current;
      if (!overlayEl) return;
      if (!overlayEl.contains(event.target as Node)) return;
      const touch = event.touches[0];
      if (!touch) return;
      const path = buildPathFromTarget(event.target);
      touchStateRef.current = { y: touch.clientY, path };
    },
    [buildPathFromTarget, onNavigateNext, onNavigatePrevious, post],
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (!touchStateRef.current) return;
      if (!post || (!onNavigateNext && !onNavigatePrevious)) {
        touchStateRef.current = null;
        return;
      }
      const touch = event.changedTouches[0];
      if (!touch) {
        touchStateRef.current = null;
        return;
      }

      const { y, path } = touchStateRef.current;
      touchStateRef.current = null;

      const deltaY = touch.clientY - y;
      const threshold = 60;
      if (Math.abs(deltaY) < threshold) return;

      const direction = deltaY < 0 ? 'down' : 'up';
      if (canScrollInPath(path, direction)) {
        return;
      }

      if (deltaY < 0 && onNavigateNext) {
        triggerNavigation('next');
      } else if (deltaY > 0 && onNavigatePrevious) {
        triggerNavigation('previous');
      }
    },
    [canScrollInPath, onNavigateNext, onNavigatePrevious, post, triggerNavigation],
  );

  useEffect(() => {
    if (!post) return;
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleKeyDown, handleTouchEnd, handleTouchStart, handleWheel, post]);

  const modalVariants = {
    enter: (direction: 1 | -1) => ({
      y: direction === 1 ? 80 : -80,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      y: 0,
      opacity: 1,
      scale: 1,
      transition: { duration: 0.35, ease: 'easeOut' },
    },
    exit: (direction: 1 | -1) => ({
      y: direction === 1 ? -80 : 80,
      opacity: 0,
      scale: 0.95,
      transition: { duration: 0.3, ease: 'easeIn' },
    }),
  } as const;

  const imageVariants = {
    enter: (direction: 1 | -1) => ({
      x: direction === 1 ? 120 : -120,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.35, ease: 'easeOut' },
    },
    exit: (direction: 1 | -1) => ({
      x: direction === 1 ? -120 : 120,
      opacity: 0,
      transition: { duration: 0.3, ease: 'easeIn' },
    }),
  } as const;

  const startImageGesture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (images.length <= 1) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const targetNode = event.target as HTMLElement | null;
      if (targetNode?.closest('button, a, input, textarea, select')) {
        return;
      }
      event.stopPropagation();
      const target = event.currentTarget;
      try {
        target.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore errors from unsupported pointer capture.
      }
      imageGestureStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        isActive: true,
      };
    },
    [images.length],
  );

  const moveImageGesture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = imageGestureStateRef.current;
      if (!state) return;
      if (state.pointerId !== null && state.pointerId !== event.pointerId) return;
      event.stopPropagation();
      if (!state.isActive) return;

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      const threshold = 40;
      if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY)) {
        return;
      }

      if (deltaX < 0) {
        showNextImage();
      } else {
        showPrevImage();
      }

      imageGestureStateRef.current = {
        pointerId: state.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        isActive: false,
      };
    },
    [showNextImage, showPrevImage],
  );

  const endImageGesture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = imageGestureStateRef.current;
    if (!state) return;
    if (state.pointerId !== null && state.pointerId !== event.pointerId) return;
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Ignore errors from unsupported pointer capture.
    }
    imageGestureStateRef.current = null;
  }, []);

  return (
    <AnimatePresence>
      {post && (
        <motion.div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-lg"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />

          <AnimatePresence
            mode="wait"
            initial={false}
            custom={transitionDirection}
          >
            <motion.div
              key={post?.id ?? 'active-post'}
              ref={modalContainerRef}
              className={modalContainerClasses}
              custom={transitionDirection}
              variants={modalVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <div className={layoutClasses}>
                {/* Image with zoom animation */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-3 top-3 z-20 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 md:right-4 md:top-4"
                    aria-label="Close catch details"
                  >
                    ✕
                  </button>
                  <motion.div
                    className={imageWrapperClasses}
                    initial={{ scale: 1.05 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    {images.length > 0 ? (
                      <div
                        className="relative flex h-full w-full items-center justify-center overflow-hidden"
                        onPointerDown={startImageGesture}
                        onPointerMove={moveImageGesture}
                        onPointerUp={endImageGesture}
                        onPointerCancel={endImageGesture}
                        onPointerLeave={endImageGesture}
                        onTouchStart={(event) => {
                          if (images.length > 1) {
                            event.stopPropagation();
                          }
                        }}
                        onTouchMove={(event) => {
                          if (images.length > 1) {
                            event.stopPropagation();
                          }
                        }}
                        onTouchEnd={(event) => {
                          if (images.length > 1) {
                            event.stopPropagation();
                          }
                        }}
                        onTouchCancel={(event) => {
                          if (images.length > 1) {
                            event.stopPropagation();
                          }
                        }}
                      >
                        <AnimatePresence
                          initial={false}
                          custom={imageTransitionDirection}
                          mode="wait"
                        >
                          <motion.div
                            key={activeImageIndex}
                            className="absolute inset-0 flex items-center justify-center"
                            custom={imageTransitionDirection}
                            variants={imageVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                          >
                            <img
                              src={images[activeImageIndex]}
                              alt={post.species}
                              className="max-h-full max-w-full object-contain"
                            />
                          </motion.div>
                        </AnimatePresence>
                        {images.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={showPrevImage}
                              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-lg text-white transition hover:bg-black/80"
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              onClick={showNextImage}
                              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-lg text-white transition hover:bg-black/80"
                            >
                              ›
                            </button>
                            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1">
                              {images.map((_, index) => (
                                <span
                                  key={index}
                                  className={`h-2.5 w-2.5 rounded-full transition ${
                                    index === activeImageIndex ? 'bg-white' : 'bg-white/40'
                                  }`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/60">
                        No photo available
                      </div>
                    )}
                  </motion.div>
                </div>

                {/* Right side (content) */}
                <div className="relative flex flex-col p-4 pb-20 md:h-full">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold">{post.species}</h3>
                    <div className="flex items-center gap-2">
                      {isOwner && (
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="opacity-70 hover:opacity-100 text-lg text-red-400 disabled:opacity-40"
                          title="Delete catch"
                        >
                          <Trash2 className="h-5 w-5" />
                          <span className="sr-only">Delete catch</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-left text-sm font-medium text-blue-400 hover:underline"
                        onClick={() => router.push(`/profile/${post.uid}`)}
                      >
                        {post.displayName || post.user.name}
                      </button>
                      {isProMember && <ProBadge className="text-[10px]" />}
                    </div>
                    {postTime && <span className="text-xs opacity-60">{postTime}</span>}
                  </div>

                  {post.caption && (
                    <p className="mb-2 whitespace-pre-line text-sm opacity-80">{post.caption}</p>
                  )}

                  {(post.weight || post.location) && (
                    <p className="mb-2 text-xs opacity-60">
                      {post.weight && <>Weight: {post.weight}</>}{' '}
                      {canShowLocation ? (
                        <span>• {post.location}</span>
                      ) : locationIsPrivate && post.location ? (
                        <span>• Private location</span>
                      ) : null}
                    </p>
                  )}

                  <div className="mb-2 flex items-center gap-3">
                    <button
                      onClick={() => user && toggleLike(post.id, user.uid)}
                      className={`flex items-center gap-1 transition ${
                        liked ? 'text-red-500' : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      <Heart
                        className={`h-5 w-5 ${
                          liked ? 'fill-red-500 stroke-red-500' : ''
                        }`}
                      />
                    </button>
                    <span className="text-sm opacity-60">{comments.length} comments</span>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto max-h-[320px] pr-2 pb-16">
                    {comments.map((c) => {
                      const canDeleteComment = user && (c.uid === user.uid || isOwner);
                      const isDeletingComment = commentActionBusy === c.id;
                      return (
                        <div
                          key={c.id}
                          className="flex flex-col border-b border-white/5 pb-2 text-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <span
                                className="font-medium text-blue-400 hover:underline"
                                onClick={() => router.push(`/profile/${c.uid}`)}
                              >
                                {c.displayName}
                              </span>{' '}
                              {c.text}
                            </div>
                            {canDeleteComment && (
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(c.id)}
                                disabled={isDeletingComment}
                                className="opacity-50 transition hover:opacity-100 disabled:opacity-30"
                                title="Delete comment"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete comment</span>
                              </button>
                            )}
                          </div>
                          {c.createdAt?.seconds && (
                            <span className="mt-0.5 text-xs opacity-50">
                              {timeAgo(c.createdAt.seconds * 1000)}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {comments.length === 0 && (
                      <p className="text-center text-sm opacity-60">No comments yet.</p>
                    )}
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-[var(--card)] p-3">
                    <div className="flex gap-2">
                      <input
                        className="flex-1 rounded-md bg-white/10 px-3 py-2 text-sm text-white outline-none"
                        placeholder="Write a comment…"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendComment()}
                      />
                      <button
                        className="rounded-md bg-blue-500 px-3 py-2 text-sm font-medium hover:bg-blue-600"
                        onClick={sendComment}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
