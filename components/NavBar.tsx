'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { app } from '@/lib/firebaseClient';
import { HookdUser, Notification, subscribeToUser } from '@/lib/firestore';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationPreferencesModal from './NotificationPreferencesModal';
import {
  Bell,
  Home,
  LogIn,
  LogOut,
  Map as MapIcon,
  Fish,
  Bot,
  X,
  MessageSquare,
  Loader2,
  Settings,
  Newspaper,
} from 'lucide-react';

export const tabs = [
  { href: '/', icon: Home, label: 'Home', type: 'link' as const },
  { href: '/feed', icon: Newspaper, label: 'Feed', type: 'link' as const },
  { href: '/map', icon: MapIcon, label: 'Map', type: 'link' as const },
  { href: '/chat', icon: MessageSquare, label: 'Chat', type: 'link' as const },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [profile, setProfile] = useState<HookdUser | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isNotificationPreferencesOpen, setIsNotificationPreferencesOpen] = useState(false);
  const [isClearingNotifications, setIsClearingNotifications] = useState(false);
  const [navHeight, setNavHeight] = useState<string>('5.5rem');
  const notificationsContainerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);

  const {
    notifications,
    unreadCount,
    isLoading: notificationsLoading,
    markNotificationAsRead: markNotificationAsReadMutation,
    markAllNotificationsAsRead: markAllNotificationsAsReadMutation,
    clearNotifications: clearNotificationsMutation,
  } = useNotifications(user?.uid ?? null);
  const hasUnreadNotifications = unreadCount > 0;
  const hasNotifications = notifications.length > 0;

  useEffect(() => {
    const auth = getAuth(app);
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = undefined;
      }

      if (u) {
        unsubscribeProfile = subscribeToUser(u.uid, (data) => {
          setProfile(data);
        });
      } else {
        setProfile(null);
        setIsNotificationsOpen(false);
        setIsNotificationPreferencesOpen(false);
      }
    });

    return () => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (!notificationsContainerRef.current) return;
      if (!notificationsContainerRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateNavHeight = () => {
      if (!headerRef.current) {
        return;
      }

      const height = headerRef.current.offsetHeight;
      const value = `${height}px`;
      setNavHeight(value);
      document.documentElement.style.setProperty('--nav-height', value);
    };

    updateNavHeight();

    let resizeObserver: ResizeObserver | null = null;

    if (typeof ResizeObserver !== 'undefined' && headerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateNavHeight();
      });
      resizeObserver.observe(headerRef.current);
    } else {
      window.addEventListener('resize', updateNavHeight);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateNavHeight);
      }
    };
  }, []);

  const isProMember = useMemo(() => Boolean(profile?.isPro), [profile?.isPro]);

  const displayedNotifications = useMemo(() => notifications.slice(0, 20), [notifications]);

  const relativeTimeFormatter = useMemo(() => (
    typeof Intl !== 'undefined'
      ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
      : null
  ), []);

  const formatRelativeTime = useCallback((date: Date | null) => {
    if (!date) return '';
    if (!relativeTimeFormatter) return date.toLocaleString();

    const diff = date.getTime() - Date.now();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;

    if (Math.abs(diff) < hour) {
      return relativeTimeFormatter.format(Math.round(diff / minute), 'minute');
    }
    if (Math.abs(diff) < day) {
      return relativeTimeFormatter.format(Math.round(diff / hour), 'hour');
    }
    if (Math.abs(diff) < week) {
      return relativeTimeFormatter.format(Math.round(diff / day), 'day');
    }
    return date.toLocaleDateString();
  }, [relativeTimeFormatter]);

  const resolveNotificationLabel = useCallback((notification: Notification) => {
    const actorName = notification.actorDisplayName
      || (notification.actorUsername ? `@${notification.actorUsername}` : 'An angler');

    switch (notification.verb) {
      case 'follow':
        return `${actorName} started following you.`;
      case 'direct_message':
        return `${actorName} sent you a direct message.`;
      case 'like':
        return `${actorName} liked your catch.`;
      case 'comment':
        return `${actorName} commented on your catch.`;
      case 'followed_catch': {
        const metadata = notification.metadata as Record<string, unknown> | null | undefined;
        const species = metadata && typeof metadata['species'] === 'string'
          ? (metadata['species'] as string).trim()
          : '';
        if (species) {
          return `${actorName} caught ${species}.`;
        }
        return `${actorName} shared a new catch.`;
      }
      case 'team_invite_accepted':
        return `${actorName} joined your team.`;
      case 'team_invite_canceled':
        return `${actorName} updated a team invite.`;
      case 'chat_mention':
        return `${actorName} mentioned you in chat.`;
      default:
        return 'You have a new notification.';
    }
  }, []);

  const resolveNotificationHref = useCallback((notification: Notification) => {
    switch (notification.verb) {
      case 'follow':
        return `/profile/${notification.actorUid}`;
      case 'direct_message':
        if (notification.resource?.type === 'directThread') {
          const targetUid = notification.resource.otherUid || notification.actorUid;
          if (targetUid) {
            return `/messages/${targetUid}`;
          }
        }
        return `/messages/${notification.actorUid}`;
      case 'like':
      case 'comment':
      case 'followed_catch':
        if (notification.resource?.type === 'catch') {
          const catchId = notification.resource.catchId
            || (typeof notification.metadata?.catchId === 'string' ? notification.metadata.catchId : null);
          if (catchId) {
            return `/feed?catchId=${catchId}`;
          }
          const owner = notification.resource.ownerUid || notification.actorUid;
          return `/profile/${owner}`;
        }
        if (typeof notification.metadata?.catchId === 'string') {
          return `/feed?catchId=${notification.metadata.catchId}`;
        }
        return `/profile/${notification.actorUid}`;
      case 'team_invite_accepted':
      case 'team_invite_canceled':
        if (notification.resource?.type === 'team') {
          return `/teams/${notification.resource.teamId}`;
        }
        return '/teams';
      case 'chat_mention':
        return '/chat';
      default:
        return null;
    }
  }, []);

  const extractPreview = useCallback((notification: Notification) => {
    const metadata = notification.metadata as Record<string, unknown> | null;
    if (!metadata) return null;
    const preview = metadata.preview;
    if (typeof preview === 'string' && preview.trim()) {
      return preview.trim();
    }
    return null;
  }, []);

  const resolveInitials = useCallback((notification: Notification) => {
    const source = notification.actorDisplayName
      || notification.actorUsername
      || '';
    if (!source) {
      return '?';
    }
    const parts = source.trim().split(/\s+/);
    if (parts.length === 0) {
      return '?';
    }
    const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
    return initials || '?';
  }, []);

  const handleNotificationClick = useCallback(async (notification: Notification) => {
    const destination = resolveNotificationHref(notification);
    setIsNotificationsOpen(false);
    if (!notification.isRead) {
      await markNotificationAsReadMutation(notification.id);
    }
    if (destination) {
      router.push(destination);
    }
  }, [markNotificationAsReadMutation, resolveNotificationHref, router]);

  const handleMarkAllNotificationsAsRead = useCallback(async () => {
    await markAllNotificationsAsReadMutation();
    setIsNotificationsOpen(false);
  }, [markAllNotificationsAsReadMutation]);

  const handleClearAllNotifications = useCallback(async () => {
    if (isClearingNotifications || !hasNotifications) {
      return;
    }

    const shouldClear = typeof window !== 'undefined'
      ? window.confirm('Clear all notifications? This cannot be undone.')
      : true;

    if (!shouldClear) {
      return;
    }

    setIsClearingNotifications(true);
    try {
      await clearNotificationsMutation();
    } catch (error) {
      console.error('Failed to clear notifications', error);
    } finally {
      setIsClearingNotifications(false);
    }
  }, [clearNotificationsMutation, hasNotifications, isClearingNotifications]);

  return (
    <>
      <header
        ref={headerRef}
        style={{ '--nav-height': navHeight } as CSSProperties}
        className="fixed top-0 left-0 right-0 z-[1000] bg-slate-950/95 backdrop-blur border-b border-white/10"
      >
        <div className="container py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo.svg" alt="Hook'd" width={36} height={36} className="rounded-xl shadow-glow" />
              <span className="text-xl font-semibold tracking-tight">Hook&apos;d</span>
            </Link>

            <div className="flex items-center gap-3">
              <Link
                href="/tools/fishing-assistant"
                className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
              >
                AI Guide
                <span className="rounded-full border border-amber-300/60 bg-amber-500/20 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                  Pro
                </span>
              </Link>

              {/* Notifications dropdown (shared) */}
              {user ? (
                <div ref={notificationsContainerRef} className="relative order-2 sm:order-none">
                  <button
                    type="button"
                    onClick={() => setIsNotificationsOpen((prev) => !prev)}
                    className="relative hidden sm:inline-flex items-center justify-center rounded-xl border border-white/15 p-2 text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                    aria-label="View notifications"
                >
                  <Bell className={`h-5 w-5 ${hasUnreadNotifications ? 'fill-brand-400 text-brand-300' : ''}`} />
                  {hasUnreadNotifications ? (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] rounded-full bg-brand-400 px-1 text-center text-[10px] font-semibold text-slate-950 shadow">
                      {unreadCount > 9 ? '9+' : unreadCount}
                      <span className="sr-only"> unread notifications</span>
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen((prev) => !prev)}
                  className="relative inline-flex items-center justify-center rounded-xl border border-white/15 p-2 text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300 sm:hidden"
                  aria-label="View notifications"
                >
                  <Bell className={`h-5 w-5 ${hasUnreadNotifications ? 'fill-brand-400 text-brand-300' : ''}`} />
                  {hasUnreadNotifications ? (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] rounded-full bg-brand-400 px-1 text-center text-[10px] font-semibold text-slate-950 shadow">
                      {unreadCount > 9 ? '9+' : unreadCount}
                      <span className="sr-only"> unread notifications</span>
                    </span>
                  ) : null}
                </button>

                {isNotificationsOpen ? (
                  <div className="absolute right-0 sm:right-0 mt-3 w-screen max-w-[min(90vw,22rem)] sm:w-96 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur z-50">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                      <p className="text-sm font-semibold text-white">Notifications</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsNotificationPreferencesOpen(true);
                            setIsNotificationsOpen(false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-brand-300/60 hover:text-white"
                          aria-label="Open notification preferences"
                        >
                          <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">Preferences</span>
                          <span className="sm:hidden">Prefs</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAllNotifications}
                          className="text-xs font-medium text-brand-200 transition hover:text-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!hasNotifications || isClearingNotifications}
                        >
                          {isClearingNotifications ? 'Clearing…' : 'Clear all'}
                        </button>
                        <button
                          type="button"
                          onClick={handleMarkAllNotificationsAsRead}
                          className="text-xs font-medium text-brand-200 transition hover:text-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!hasUnreadNotifications || isClearingNotifications}
                        >
                          Mark all as read
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[calc(100vh-7rem)] sm:max-h-96 overflow-y-auto">
                      {notificationsLoading ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-white/70">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading notifications…
                        </div>
                      ) : displayedNotifications.length === 0 ? (
                        <div className="px-4 py-8 text-sm text-white/60">
                          You&apos;re all caught up. No notifications yet.
                        </div>
                      ) : (
                        <ul className="divide-y divide-white/5">
                          {displayedNotifications.map((notification) => {
                            const preview = extractPreview(notification);
                            return (
                              <li key={notification.id}>
                                <button
                                  type="button"
                                  onClick={() => handleNotificationClick(notification)}
                                  className={`flex w-full gap-3 px-4 py-3 text-left transition ${notification.isRead ? 'hover:bg-white/5' : 'bg-white/5 hover:bg-white/10'}`}
                                >
                                  {notification.actorPhotoURL ? (
                                    <Image
                                      src={notification.actorPhotoURL}
                                      alt={notification.actorDisplayName || 'Notification avatar'}
                                      width={40}
                                      height={40}
                                      className="h-10 w-10 rounded-full object-cover"
                                    />
                                  ) : (
                                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold uppercase text-white/80">
                                      {resolveInitials(notification)}
                                    </span>
                                  )}
                                  <span className="flex-1">
                                    <span className="block text-sm font-medium text-white">{resolveNotificationLabel(notification)}</span>
                                    {preview ? (
                                      <span className="mt-1 block text-xs text-white/60 line-clamp-2">{preview}</span>
                                    ) : null}
                                    <span className="mt-1 block text-xs text-white/40">{formatRelativeTime(notification.createdAt)}</span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

              {user ? (
                <Link
                  href="/profile"
                  aria-label="Profile"
                  className="relative hidden sm:inline-flex rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                >
                  <Image
                    src={profile?.photoURL || user?.photoURL || '/logo.svg'}
                    alt={profile?.displayName || user?.displayName || 'Account avatar'}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                  {isProMember && (
                    <span className="absolute -bottom-1 -right-1 rounded-full border border-amber-300/60 bg-amber-500/80 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-950 shadow-lg">
                      <span aria-hidden>Pro</span>
                      <span className="sr-only">Pro member</span>
                    </span>
                  )}
                </Link>
              ) : null}

              <div className="hidden sm:flex items-center gap-3 ml-4 pl-4 border-l border-white/10">
                <Link href="/map" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Map</Link>
                <Link href="/chat" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Chat</Link>
                <Link
                  href="/tools/fish-identifier"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                >
                  Fish ID
                  <span className="rounded-full border border-amber-300/60 bg-amber-500/20 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                    Pro
                  </span>
                </Link>
                {user ? (
                  <>
                    <Link href="/feed" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Feed</Link>
                    <button
                      onClick={() => signOut(getAuth(app))}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                    >
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="px-4 py-2 rounded-xl border border-white/15 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300">Log in</Link>
                    <Link href="/login" className="btn-primary">Sign up</Link>
                  </>
                )}
              </div>

            {/* Mobile actions */}
            <div className="flex items-center gap-2 order-1 sm:order-none sm:hidden">
              <Link
                href="/tools/fishing-assistant"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
              >
                <Bot className="h-5 w-5" />
                <span className="flex items-center gap-1">
                  AI Guide
                  <span className="rounded-full border border-amber-300/60 bg-amber-500/20 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                    Pro
                  </span>
                </span>
              </Link>
              {user ? (
                <Link
                  href="/profile"
                  aria-label="Profile"
                  className="relative inline-flex rounded-full border border-white/15 p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                >
                  <Image
                    src={profile?.photoURL || user?.photoURL || '/logo.svg'}
                    alt={profile?.displayName || user?.displayName || 'Account avatar'}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                  {isProMember && (
                    <span className="absolute -bottom-1 -right-1 rounded-full border border-amber-300/60 bg-amber-500/80 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-950 shadow-lg">
                      <span aria-hidden>Pro</span>
                      <span className="sr-only">Pro member</span>
                    </span>
                  )}
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                >
                  Log in
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Mobile drawer menu */}
        <div className="sm:hidden">
          {/* Overlay */}
          {isMobileMenuOpen ? (
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-30 bg-black/40"
            />
          ) : null}

          <nav
            className={`fixed inset-y-0 left-0 z-40 w-72 max-w-full transform border-r border-white/10 bg-slate-950/80 px-6 py-6 transition-transform duration-300 ease-in-out backdrop-blur ${
              isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            aria-hidden={!isMobileMenuOpen}
          >
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-3" onClick={() => setIsMobileMenuOpen(false)}>
                <Image src="/logo.svg" alt="Hook'd" width={32} height={32} className="rounded-xl shadow-glow" />
                <span className="text-lg font-semibold tracking-tight">Hook&apos;d</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="inline-flex items-center justify-center rounded-xl border border-white/15 p-2 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ul className="mt-6 flex flex-col gap-2">
              {tabs.map((t) => {
                const baseHref = t.href.split('?')[0];
                const active = baseHref === '/' ? pathname === '/' : pathname.startsWith(baseHref);
                const Icon = t.icon;
                return (
                  <li key={t.href}>
                    <Link
                      href={t.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition bg-slate-900/95 shadow-inner ${
                        active
                          ? 'ring-1 ring-white/20 text-white'
                          : 'hover:bg-slate-900/95 hover:ring-1 hover:ring-white/10'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{t.label}</span>
                    </Link>
                  </li>
                );
              })}
              <li>
                <Link
                  href="/tools/fish-identifier"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition bg-slate-900/80 shadow-inner hover:bg-slate-900/95 hover:ring-1 hover:ring-white/10"
                >
                  <Fish className="h-5 w-5" />
                  <span className="flex items-center gap-2">
                    Fish ID
                    <span className="rounded-full border border-amber-300/60 bg-amber-500/20 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                      Pro
                    </span>
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  href="/tools/fishing-assistant"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition bg-slate-900/80 shadow-inner hover:bg-slate-900/95 hover:ring-1 hover:ring-white/10"
                >
                  <Bot className="h-5 w-5" />
                  <span className="flex items-center gap-2">
                    AI Guide
                    <span className="rounded-full border border-amber-300/60 bg-amber-500/20 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                      Pro
                    </span>
                  </span>
                </Link>
              </li>
              {!user ? (
                <li>
                  <Link
                    href="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition bg-slate-900/80 shadow-inner hover:bg-slate-900/95 hover:ring-1 hover:ring-white/10"
                  >
                    <LogIn className="h-5 w-5" />
                    <span>Login</span>
                  </Link>
                </li>
              ) : (
                <li>
                  <button
                    onClick={() => {
                      signOut(getAuth(app));
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition bg-slate-900/80 shadow-inner hover:bg-slate-900/95 hover:ring-1 hover:ring-white/10"
                  >
                    <LogOut className="h-5 w-5" />
                    <span>Logout</span>
                  </button>
                </li>
              )}
            </ul>
          </nav>
        </div>
        </div>
      </header>
      <NotificationPreferencesModal
        open={isNotificationPreferencesOpen}
        onClose={() => setIsNotificationPreferencesOpen(false)}
        uid={user?.uid}
      />
    </>
  );
}
