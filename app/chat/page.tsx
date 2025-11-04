'use client';

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuthState } from 'react-firebase-hooks/auth';
import {
  Eraser,
  Loader2,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';

import NavBar from '@/components/NavBar';
import LoginButton from '@/components/auth/LoginButton';
import DirectMessageThreadsList from '@/components/direct-messages/DirectMessageThreadsList';
import Modal from '@/components/ui/Modal';
import {
  collection,
  doc,
  endAt,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query as firestoreQuery,
  startAt,
} from 'firebase/firestore';

import { auth, db } from '@/lib/firebaseClient';
import {
  ChatMessage,
  ChatPresence,
  ChatMessageMention,
  Team,
  clearChatMessages,
  deleteChatMessage,
  listMutedUsers,
  sendChatMessage,
  setChatMute,
  subscribeToChatMessages,
  subscribeToChatPresence,
  subscribeToTeamsForUser,
  subscribeToUser,
  updateChatPresence,
} from '@/lib/firestore';

type UserProfile = {
  uid: string;
  displayName?: string | null;
  photoURL?: string | null;
  [key: string]: unknown;
};

const AUTO_SCROLL_THRESHOLD_PX = 120;

export default function ChatPage() {
  const [user] = useAuthState(auth);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [presenceCount, setPresenceCount] = useState<number | null>(null);
  const [isDmModalOpen, setIsDmModalOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mentionListId = 'chat-mention-suggestions';

  type MentionOption = {
    uid: string;
    username: string;
    displayName?: string | null;
    photoURL?: string | null;
  };

  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<MentionOption[]>([]);
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0);
  const [activeMentionRange, setActiveMentionRange] = useState<{ start: number; end: number } | null>(null);
  const [isMentionLoading, setIsMentionLoading] = useState(false);
  const [selectedMentions, setSelectedMentions] = useState<ChatMessageMention[]>([]);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const [mutedUsers, setMutedUsers] = useState<string[]>([]);
  const [deletingMessageIds, setDeletingMessageIds] = useState<Record<string, boolean>>({});
  const [pendingMuteActions, setPendingMuteActions] = useState<Record<string, boolean>>({});
  const [isClearingChannel, setIsClearingChannel] = useState(false);
  const [isChatMuted, setIsChatMuted] = useState(false);
  const [isCheckingMute, setIsCheckingMute] = useState(false);

  const isModerator = Boolean(userProfile?.isModerator);
  const moderatorMutedUserSet = useMemo(() => new Set(mutedUsers), [mutedUsers]);

  useEffect(() => {
    if (!user?.uid) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      setPresenceCount(null);
      return;
    }

    let isActive = true;

    const sendHeartbeat = async () => {
      try {
        await updateChatPresence(user.uid);
      } catch (err) {
        console.error('Failed to update chat presence', err);
      }
    };

    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 30_000);

    const unsubscribe = subscribeToChatPresence((presence: ChatPresence[]) => {
      if (!isActive) return;
      setPresenceCount(presence.length);
    }, {
      onError: (err) => {
        console.error('Failed to subscribe to chat presence', err);
      },
    });

    return () => {
      isActive = false;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      setPresenceCount(null);
      unsubscribe();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setIsChatMuted(false);
      setIsCheckingMute(false);
      return;
    }

    setIsCheckingMute(true);
    const muteRef = doc(db, 'chatMutes', user.uid);
    const unsubscribe = onSnapshot(muteRef, (snapshot) => {
      setIsChatMuted(snapshot.exists());
      setIsCheckingMute(false);
    }, (err) => {
      console.error('Failed to subscribe to chat mute status', err);
      setIsCheckingMute(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  useEffect(() => {
    const unsubscribe = subscribeToChatMessages((incoming) => {
      setMessages(incoming);
      setIsLoading(false);
    }, {
      onError: (err) => {
        setError('We could not load the chat right now. Please try again.');
        console.error(err);
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;

    const updateShouldAutoScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
      shouldAutoScrollRef.current = distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX;
    };

    updateShouldAutoScroll();
    container.addEventListener('scroll', updateShouldAutoScroll);

    return () => {
      container.removeEventListener('scroll', updateShouldAutoScroll);
    };
  }, []);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container || !shouldAutoScrollRef.current) return;

    const scrollToBottom = () => {
      container.scrollTop = container.scrollHeight;
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(scrollToBottom);
    } else {
      scrollToBottom();
    }
  }, [messages.length]);

  useEffect(() => {
    if (!user?.uid) {
      setUserProfile(null);
      return;
    }

    const unsubscribe = subscribeToUser(user.uid, (data) => {
      setUserProfile(data);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!isModerator) {
      setMutedUsers([]);
      setModerationError(null);
      return;
    }

    let isActive = true;

    (async () => {
      try {
        const muted = await listMutedUsers({ isModerator });
        if (isActive) {
          setMutedUsers(muted);
        }
      } catch (err) {
        console.error('Failed to load muted users', err);
        if (isActive) {
          setModerationError('We could not load the current mute list.');
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [isModerator]);

  useEffect(() => {
    if (!user?.uid) {
      setTeams([]);
      return;
    }

    const unsubscribe = subscribeToTeamsForUser(user.uid, (next) => {
      setTeams(next);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const syncSelectedMentionsWithText = (value: string) => {
    const matchSet = new Set<string>();
    const regex = /@([a-z0-9_]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value)) !== null) {
      matchSet.add(match[1].toLowerCase());
    }
    setSelectedMentions((prev) => prev.filter((mention) => matchSet.has(mention.username)));
  };

  const detectMentionContext = (value: string, caret: number | null) => {
    if (caret == null) {
      setActiveMentionRange(null);
      setMentionQuery('');
      return;
    }

    const uptoCaret = value.slice(0, caret);
    const match = uptoCaret.match(/(^|[\s.,()[\]{}!?:;])@([a-z0-9_]{0,32})$/i);

    if (match) {
      const atPosition = uptoCaret.lastIndexOf('@');
      setActiveMentionRange({ start: atPosition, end: caret });
      setMentionQuery(match[2].toLowerCase());
    } else {
      setActiveMentionRange(null);
      setMentionQuery('');
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setInput(nextValue);
    detectMentionContext(nextValue, event.target.selectionStart ?? nextValue.length);
    syncSelectedMentionsWithText(nextValue);
  };

  const handleTextareaSelect = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    detectMentionContext(textarea.value, textarea.selectionStart ?? textarea.value.length);
  };

  const handleMentionSelect = (option: MentionOption) => {
    if (!textareaRef.current || !activeMentionRange) {
      return;
    }

    const textarea = textareaRef.current;
    const value = textarea.value;
    const before = value.slice(0, activeMentionRange.start);
    const after = value.slice(activeMentionRange.end);
    const mentionText = `@${option.username}`;
    const needsTrailingSpace = after.startsWith(' ') || after.startsWith('\n') || after.length === 0 ? '' : ' ';
    const nextValue = `${before}${mentionText}${needsTrailingSpace}${after}`;
    const nextCaret = before.length + mentionText.length + needsTrailingSpace.length;

    setInput(nextValue);
    setActiveMentionRange(null);
    setMentionQuery('');
    setMentionResults([]);
    syncSelectedMentionsWithText(nextValue);
    setSelectedMentions((prev) => {
      const normalizedUsername = option.username.toLowerCase();
      if (prev.some((mention) => mention.uid === option.uid || mention.username === normalizedUsername)) {
        return prev;
      }
      return [
        ...prev,
        {
          uid: option.uid,
          username: normalizedUsername,
          displayName: option.displayName ?? null,
        },
      ];
    });

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeMentionRange || (!mentionResults.length && !isMentionLoading)) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMentionHighlightIndex((prev) => (prev + 1) % Math.max(mentionResults.length, 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMentionHighlightIndex((prev) => {
        if (!mentionResults.length) return prev;
        return (prev - 1 + mentionResults.length) % mentionResults.length;
      });
      return;
    }

    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      if (mentionResults.length) {
        event.preventDefault();
        const option = mentionResults[mentionHighlightIndex] ?? mentionResults[0];
        handleMentionSelect(option);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setActiveMentionRange(null);
      setMentionQuery('');
      setMentionResults([]);
    }
  };

  const renderMessageContent = (message: ChatMessage): ReactNode => {
    if (!message.mentions?.length) {
      return message.text;
    }

    const mentionMap = new Map(
      message.mentions.map((mention) => [mention.username.toLowerCase(), mention]),
    );
    const regex = /@([a-z0-9_]+)/gi;
    const text = message.text;
    const nodes: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (start > lastIndex) {
        nodes.push(text.slice(lastIndex, start));
      }

      const username = match[1].toLowerCase();
      const mention = mentionMap.get(username);

      if (mention) {
        nodes.push(
          <Link
            key={`${mention.uid}-${start}`}
            href={`/profile/${mention.uid}`}
            prefetch={false}
            className="inline-flex items-center gap-1 rounded-full bg-brand-400/20 px-1.5 py-0.5 font-medium text-brand-100 underline decoration-dotted decoration-2 underline-offset-2 transition hover:bg-brand-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            @{mention.username}
            <span className="sr-only"> — View profile</span>
          </Link>,
        );
      } else {
        nodes.push(match[0]);
      }

      lastIndex = end;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }

    return nodes.length ? nodes : text;
  };

  const formattedMessages = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return messages.map((message) => ({
      ...message,
      displayName: typeof message.displayName === 'string' && message.displayName.trim()
        ? message.displayName
        : 'Angler',
      photoURL: message.photoURL || null,
      isPro: Boolean(message.isPro),
      timestampLabel: message.createdAt ? formatter.format(message.createdAt) : 'Sending…',
    }));
  }, [messages]);

  useEffect(() => {
    if (!activeMentionRange || !mentionQuery) {
      setMentionResults([]);
      setIsMentionLoading(false);
      return;
    }

    let isCurrent = true;
    setIsMentionLoading(true);

    const timeoutId = setTimeout(async () => {
      try {
        const usersRef = collection(db, 'users');
        const searchQuery = firestoreQuery(
          usersRef,
          orderBy('username'),
          startAt(mentionQuery),
          endAt(`${mentionQuery}\uf8ff`),
          limit(5),
        );
        const snap = await getDocs(searchQuery);
        if (!isCurrent) return;

        const options: MentionOption[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, any>;
          const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
          if (!username) return;
          if (user?.uid && docSnap.id === user.uid) return;
          if (options.some((option) => option.username === username)) return;
          options.push({
            uid: docSnap.id,
            username,
            displayName: typeof data.displayName === 'string' ? data.displayName : null,
            photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
          });
        });

        setMentionResults(options);
        setMentionHighlightIndex(0);
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to fetch mention suggestions', err);
        }
        if (isCurrent) {
          setMentionResults([]);
        }
      } finally {
        if (isCurrent) {
          setIsMentionLoading(false);
        }
      }
    }, 200);

    return () => {
      isCurrent = false;
      clearTimeout(timeoutId);
    };
  }, [activeMentionRange, mentionQuery, user?.uid]);

  useEffect(() => {
    setMentionHighlightIndex(0);
  }, [mentionQuery]);

  useEffect(() => {
    if (!mentionResults.length) {
      setMentionHighlightIndex(0);
      return;
    }

    setMentionHighlightIndex((prev) => {
      if (prev >= mentionResults.length) {
        return mentionResults.length - 1;
      }
      return prev;
    });
  }, [mentionResults.length]);

  const activeMentionId = mentionResults.length
    ? `${mentionListId}-option-${Math.min(mentionHighlightIndex, mentionResults.length - 1)}`
    : undefined;

  const isMentionPopoverVisible = Boolean(
    activeMentionRange && (isMentionLoading || mentionResults.length > 0 || mentionQuery.length > 0),
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendError(null);

    if (!user) {
      setSendError('Sign in to share a message with the community.');
      return;
    }

    if (isChatMuted) {
      setSendError('You are currently muted from chat.');
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    try {
      setIsSending(true);
      const displayName = userProfile?.displayName && userProfile.displayName.trim()
        ? userProfile.displayName.trim()
        : 'Angler';
      const photoURL = userProfile?.photoURL && typeof userProfile.photoURL === 'string'
        ? userProfile.photoURL
        : null;

      const mentionSet = new Set<string>();
      const regex = /@([a-z0-9_]+)/gi;
      let mentionMatch: RegExpExecArray | null;
      while ((mentionMatch = regex.exec(trimmed)) !== null) {
        mentionSet.add(mentionMatch[1].toLowerCase());
      }

      const mentionsToSend = selectedMentions.filter((mention) => mentionSet.has(mention.username));

      await sendChatMessage({
        uid: user.uid,
        displayName,
        text: trimmed,
        isPro: Boolean(userProfile?.isPro),
        photoURL,
        mentions: mentionsToSend,
      });
      setInput('');
      setSelectedMentions([]);
      setMentionQuery('');
      setMentionResults([]);
      setActiveMentionRange(null);
    } catch (err) {
      console.error('Failed to send chat message', err);
      if (err instanceof Error) {
        setSendError(err.message);
      } else {
        setSendError('Unable to send that message. Please try again.');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!user?.uid || !isModerator || !messageId) {
      return;
    }

    setModerationError(null);
    setDeletingMessageIds((prev) => ({ ...prev, [messageId]: true }));

    try {
      await deleteChatMessage({
        moderatorUid: user.uid,
        isModerator,
        messageId,
      });
    } catch (err) {
      console.error('Failed to delete chat message', err);
      setModerationError('We could not delete that message. Please try again.');
    } finally {
      setDeletingMessageIds((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    }
  };

  const handleToggleMute = async (targetUid: string, mute: boolean) => {
    if (!user?.uid || !isModerator || !targetUid) {
      return;
    }

    setModerationError(null);
    setPendingMuteActions((prev) => ({ ...prev, [targetUid]: true }));

    try {
      await setChatMute({
        moderatorUid: user.uid,
        isModerator,
        targetUid,
        mute,
      });

      setMutedUsers((prev) => {
        if (mute) {
          if (prev.includes(targetUid)) {
            return prev;
          }
          return [...prev, targetUid];
        }

        return prev.filter((id) => id !== targetUid);
      });
    } catch (err) {
      console.error('Failed to update mute state', err);
      setModerationError('We could not update the mute list. Please try again.');
    } finally {
      setPendingMuteActions((prev) => {
        const next = { ...prev };
        delete next[targetUid];
        return next;
      });
    }
  };

  const handleClearChannel = async () => {
    if (!user?.uid || !isModerator) {
      return;
    }

    const confirmed = window.confirm('This will remove all messages from the general channel. Continue?');
    if (!confirmed) {
      return;
    }

    setModerationError(null);
    setIsClearingChannel(true);

    try {
      await clearChatMessages({
        moderatorUid: user.uid,
        isModerator,
      });
    } catch (err) {
      console.error('Failed to clear chat messages', err);
      setModerationError('We could not clear the channel. Please try again.');
    } finally {
      setIsClearingChannel(false);
    }
  };

  return (
    <>
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-white">
      <NavBar />
      <section className="container pt-nav pb-12 md:pb-16">
        <div className="flex flex-col gap-4 md:gap-6">
          <header className="flex flex-col gap-2 md:gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60 md:text-sm">
              <MessageSquare className="h-4 w-4" />
              <span>Community</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <h1 className="flex-1 text-2xl font-semibold tracking-tight md:text-4xl">Live Chat</h1>
              <Link
                href="/groups"
                className="btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap px-3 py-2 text-sm md:px-4"
              >
                <Users className="h-4 w-4" />
                Explore groups
              </Link>
            </div>
            <p className="hidden max-w-2xl text-white/70 md:block">
              Share quick updates, celebrate catches, and plan your next trip with the Hook&apos;d crew. Messages update in real time
              so you&apos;re always in the loop.
            </p>
          </header>

          {teams.length > 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/50">
                <Users className="h-4 w-4" />
                <span>Your team channels</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {teams.map((team) => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}/chat`}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-white/80 transition hover:border-brand-300 hover:text-brand-200"
                  >
                    <span>{team.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="glass border border-white/10 rounded-3xl p-0 overflow-hidden shadow-2xl shadow-slate-950/50">
            <div className="flex flex-col gap-3 border-b border-white/10 bg-white/5 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-4 md:px-6 md:py-4">
              <div className="space-y-1">
                <h2 className="text-base font-medium md:text-lg">General Channel</h2>
                <p className="text-[0.7rem] text-white/60 md:text-xs">Seamless, community-wide conversations</p>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
                <button
                  type="button"
                  onClick={() => setIsDmModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 md:px-4 md:py-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  Direct messages
                </button>
                <div className="hidden text-right text-xs text-white/50 md:block">
                  <div>
                    {isLoading ? 'Loading…' : `${messages.length} message${messages.length === 1 ? '' : 's'}`}
                  </div>
                  <div className="text-white/60">
                    {presenceCount === null
                      ? '— anglers online'
                      : `${presenceCount} angler${presenceCount === 1 ? '' : 's'} online`}
                  </div>
                </div>
                {isModerator ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearChannel}
                      className="inline-flex items-center gap-2 rounded-full border border-red-500/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-200 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60"
                      disabled={isClearingChannel}
                    >
                      <Eraser className="h-4 w-4" />
                      {isClearingChannel ? 'Clearing…' : 'Clear channel'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex h-[60vh] flex-col">
              <div
                ref={messageListRef}
                className="flex-1 overflow-y-auto space-y-3 bg-slate-950/40 px-4 py-3 md:space-y-4 md:px-6 md:py-4"
                aria-live="polite"
              >
                {moderationError ? (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                    {moderationError}
                  </div>
                ) : null}
                {error ? (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                    {error}
                  </div>
                ) : null}

                {!error && isLoading ? (
                  <div className="flex items-center gap-3 text-sm text-white/70">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting anglers…
                  </div>
                ) : null}

                {!error && !isLoading && formattedMessages.length === 0 ? (
                  <p className="text-sm text-white/60">Be the first to start the conversation!</p>
                ) : null}

                {formattedMessages.map((message) => (
                  <article key={message.id} className="flex items-start gap-2 text-sm md:gap-3">
                    <Link
                      href={`/profile/${message.uid}`}
                      prefetch={false}
                      className="group relative block h-10 w-10 flex-none overflow-hidden rounded-full border border-white/10 bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    >
                      {message.photoURL ? (
                        <Image
                          src={message.photoURL}
                          alt={message.displayName}
                          fill
                          className="object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs uppercase text-white/70">
                          {message.displayName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="sr-only">View {message.displayName}&apos;s profile</span>
                    </Link>
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-white/60">
                          <Link
                            href={`/profile/${message.uid}`}
                            prefetch={false}
                            className="rounded font-medium text-white transition hover:text-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                          >
                            {message.displayName}
                          </Link>
                          {message.isPro ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-amber-200">
                              Pro
                            </span>
                          ) : null}
                          <span>{message.timestampLabel}</span>
                          {isModerator && moderatorMutedUserSet.has(message.uid) ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-red-200">
                              Muted
                            </span>
                          ) : null}
                        </div>
                        {isModerator ? (
                          <div className="ml-auto flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.16em] text-white/60">
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(message.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 transition hover:border-red-400 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60"
                              disabled={Boolean(deletingMessageIds[message.id])}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deletingMessageIds[message.id] ? 'Removing…' : 'Delete'}
                            </button>
                            {message.uid !== user?.uid ? (
                              <button
                                type="button"
                                onClick={() => handleToggleMute(message.uid, !moderatorMutedUserSet.has(message.uid))}
                                className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 transition hover:border-brand-300 hover:text-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60"
                                disabled={Boolean(pendingMuteActions[message.uid])}
                              >
                                {moderatorMutedUserSet.has(message.uid) ? (
                                  <>
                                    <UserCheck className="h-3.5 w-3.5" />
                                    {pendingMuteActions[message.uid] ? 'Updating…' : 'Unmute'}
                                  </>
                                ) : (
                                  <>
                                    <UserX className="h-3.5 w-3.5" />
                                    {pendingMuteActions[message.uid] ? 'Updating…' : 'Mute'}
                                  </>
                                )}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">
                        {renderMessageContent(message)}
                      </p>
                    </div>
                  </article>
                ))}
                <div ref={endRef} />
              </div>

              <div className="border-t border-white/10 bg-slate-950/60 p-3 md:p-4">
                {!user ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70 md:gap-3 md:p-4">
                    <p>Sign in to join the conversation and sync your messages across devices.</p>
                    <div>
                      <LoginButton className="btn-primary inline-flex items-center justify-center px-4 py-2 text-sm">
                        Log in to chat
                      </LoginButton>
                    </div>
                  </div>
                ) : null}

                <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 md:mt-3 md:gap-3">
                  <label htmlFor="chat-input" className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50 md:text-xs">
                    Message
                  </label>
                  <div className="relative">
                    <textarea
                      id="chat-input"
                      name="message"
                      ref={textareaRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleTextareaKeyDown}
                      onSelect={handleTextareaSelect}
                      onKeyUp={(event) => {
                        const textarea = event.currentTarget;
                        detectMentionContext(textarea.value, textarea.selectionStart ?? textarea.value.length);
                      }}
                      placeholder={user ? 'Share a fishing report, plan a meetup, or drop a quick hello…' : 'Sign in to share a message.'}
                      className="min-h-[88px] w-full resize-y rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-300/40 disabled:cursor-not-allowed disabled:opacity-60 md:px-4 md:py-3"
                      disabled={!user || isSending}
                      maxLength={2000}
                      required
                      aria-autocomplete="list"
                      aria-controls={isMentionPopoverVisible ? mentionListId : undefined}
                      aria-activedescendant={activeMentionId}
                    />
                    {isMentionPopoverVisible ? (
                      <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-xl shadow-slate-950/40 backdrop-blur">
                        {isMentionLoading ? (
                          <div className="flex items-center gap-2 px-3 py-2 text-sm text-white/70">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Searching anglers…
                          </div>
                        ) : null}
                        {!isMentionLoading && mentionResults.length > 0 ? (
                          <ul
                            id={mentionListId}
                            role="listbox"
                            aria-label="Mention suggestions"
                            className="space-y-1"
                          >
                            {mentionResults.map((option, index) => {
                              const isActive = index === mentionHighlightIndex;
                              const optionId = `${mentionListId}-option-${index}`;
                              return (
                                <li key={option.uid}>
                                  <button
                                    type="button"
                                    id={optionId}
                                    role="option"
                                    aria-selected={isActive}
                                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${isActive ? 'bg-brand-400/20 text-white' : 'text-white/90 hover:bg-white/10'}`}
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      handleMentionSelect(option);
                                    }}
                                  >
                                    <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800">
                                      {option.photoURL ? (
                                        <Image
                                          src={option.photoURL}
                                          alt={option.displayName ? `${option.displayName}'s avatar` : `${option.username}'s avatar`}
                                          fill
                                          sizes="32px"
                                          className="object-cover"
                                        />
                                      ) : (
                                        <span className="text-xs uppercase text-white/70">
                                          {option.username.slice(0, 2).toUpperCase()}
                                        </span>
                                      )}
                                    </span>
                                    <span className="flex flex-col">
                                      <span className="font-medium text-white">@{option.username}</span>
                                      {option.displayName ? (
                                        <span className="text-xs text-white/60">{option.displayName}</span>
                                      ) : null}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        {!isMentionLoading && mentionResults.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-white/60">No anglers found.</div>
                        ) : null}
                      </div>
                      ) : null}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[0.7rem] text-white/40 md:text-xs">Messages update instantly for everyone online.</span>
                    <button
                      type="submit"
                      className="btn-primary inline-flex items-center justify-center px-5 py-2 text-sm disabled:opacity-60"
                      disabled={!user || isSending || isChatMuted || isCheckingMute}
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        'Send message'
                      )}
                    </button>
                  </div>
                  {isCheckingMute ? (
                    <p className="text-xs text-white/50">Checking your chat permissions…</p>
                  ) : null}
                  {isChatMuted ? (
                    <p className="text-xs text-red-300">You are currently muted from chat.</p>
                  ) : null}
                  {sendError ? (
                    <p className="text-xs text-red-300">{sendError}</p>
                  ) : null}
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
      <Modal
        open={isDmModalOpen}
        onClose={() => setIsDmModalOpen(false)}
        labelledBy="direct-messages-modal-title"
        contentClassName="max-w-2xl"
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="direct-messages-modal-title" className="text-xl font-semibold text-white">
                Direct Messages
              </h2>
              <p className="text-sm text-white/60">Check private conversations without leaving chat.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsDmModalOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              aria-label="Close direct messages"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            {user ? (
              <DirectMessageThreadsList
                currentUserId={user.uid}
                className="space-y-4"
                onThreadNavigate={() => setIsDmModalOpen(false)}
              />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
                <p className="mb-3">Sign in to view and send private messages.</p>
                <LoginButton className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm">
                  <MessageSquarePlus className="h-4 w-4" />
                  Log in to message anglers
                </LoginButton>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
