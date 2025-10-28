'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';

import NavBar from '@/components/NavBar';
import ProfileView from '@/components/ProfileView';
import LogbookModal from '@/components/logbook/LogbookModal';
import { summarizeCatchMetrics } from '@/lib/catchStats';
import { app } from '@/lib/firebaseClient';
import {
  blockUser,
  followUser,
  subscribeToUser,
  subscribeToUserCatches,
  subscribeToTeamsForUser,
  submitUserReport,
  unblockUser,
  unfollowUser,
  type HookdUser,
  type Team,
} from '@/lib/firestore';
import { subscribeToUserTackleStats, type UserTackleStats } from '@/lib/tackleBox';
import PostDetailModal from '@/app/feed/PostDetailModal';

type ProfileData = {
  uid: string;
  displayName?: string;
  username?: string;
  bio?: string;
  photoURL?: string;
  header?: string;
  followers?: any[];
  following?: any[];
  isTester?: boolean;
  isPro?: boolean;
  blockedUserIds?: string[];
  blockedByUserIds?: string[];
};

type CatchData = {
  id: string;
  imageUrl?: string;
  species?: string;
  weight?: string;
  trophy?: boolean;
  caption?: string;
  location?: string;
  locationPrivate?: boolean;
  displayName?: string;
  createdAt?: any;
  uid?: string;
  user?: { name?: string };
  userPhoto?: string;
  likesCount?: number;
  commentsCount?: number;
  [key: string]: any;
};

export default function ProfilePage() {
  const params = useParams<{ uid: string }>();
  const userId = params?.uid;
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [catches, setCatches] = useState<CatchData[]>([]);
  const [tackleStats, setTackleStats] = useState<UserTackleStats | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [followPending, setFollowPending] = useState(false);
  const [activeCatch, setActiveCatch] = useState<CatchData | null>(null);
  const [isLogbookModalOpen, setIsLogbookModalOpen] = useState(false);
  const [viewerProfile, setViewerProfile] = useState<HookdUser | null>(null);
  const [blockPending, setBlockPending] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const catchSummary = useMemo(() => summarizeCatchMetrics(catches), [catches]);
  const isProMember = useMemo(() => Boolean(profile?.isPro), [profile?.isPro]);
  const isOwner = authUser?.uid === userId;
  const viewerUid = authUser?.uid ?? null;
  const targetUid = profile?.uid ?? null;

  const viewerBlockedTarget = useMemo(() => {
    if (!viewerUid || !targetUid) return false;
    const blocked = Array.isArray(viewerProfile?.blockedUserIds) ? viewerProfile.blockedUserIds : [];
    return blocked.includes(targetUid);
  }, [viewerUid, targetUid, viewerProfile?.blockedUserIds]);

  const viewerBlockedByTarget = useMemo(() => {
    if (!viewerUid || !targetUid) return false;
    const blockedBy = Array.isArray(viewerProfile?.blockedByUserIds) ? viewerProfile.blockedByUserIds : [];
    return blockedBy.includes(targetUid);
  }, [viewerUid, targetUid, viewerProfile?.blockedByUserIds]);

  const targetBlockedViewer = useMemo(() => {
    if (!viewerUid || !targetUid) return false;
    const blocked = Array.isArray(profile?.blockedUserIds) ? profile.blockedUserIds : [];
    return blocked.includes(viewerUid);
  }, [viewerUid, targetUid, profile?.blockedUserIds]);

  const targetBlockedByViewer = useMemo(() => {
    if (!viewerUid || !targetUid) return false;
    const blockedBy = Array.isArray(profile?.blockedByUserIds) ? profile.blockedByUserIds : [];
    return blockedBy.includes(viewerUid);
  }, [viewerUid, targetUid, profile?.blockedByUserIds]);

  const isBlocked = useMemo(
    () => Boolean(viewerBlockedTarget || viewerBlockedByTarget || targetBlockedViewer || targetBlockedByViewer),
    [viewerBlockedTarget, viewerBlockedByTarget, targetBlockedViewer, targetBlockedByViewer],
  );

  const mutualBlock = viewerBlockedTarget && (viewerBlockedByTarget || targetBlockedViewer);

  const blockedNotice = useMemo(() => {
    if (!isBlocked) return null;
    if (mutualBlock) {
      return 'You and this angler have blocked each other. Unblock them to see their catches again.';
    }
    if (viewerBlockedTarget) {
      return 'You have blocked this angler. Unblock them to resume interactions.';
    }
    return 'This angler has blocked you. Interactions and messaging are disabled.';
  }, [isBlocked, mutualBlock, viewerBlockedTarget]);

  const messageHref = !isBlocked && targetUid ? `/messages/${targetUid}` : null;
  const shouldHideContent = !isOwner && isBlocked;

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (user) => setAuthUser(user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser?.uid) {
      setViewerProfile(null);
      return;
    }

    const unsubscribe = subscribeToUser(authUser.uid, (data) => {
      setViewerProfile(data);
    });

    return () => {
      unsubscribe();
    };
  }, [authUser?.uid]);

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    setProfile(null);
    setCatches([]);
    setActiveCatch(null);
    setTackleStats(null);
    setTeams([]);

    const unsubscribeProfile = subscribeToUser(userId, (data) => {
      setProfile(data);
      setLoading(false);
    });

    return () => {
      unsubscribeProfile();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    if (shouldHideContent) {
      setCatches([]);
      setActiveCatch(null);
      setTackleStats(null);
      setTeams([]);
      return () => {};
    }

    const unsubscribeCatches = subscribeToUserCatches(userId, (data) => {
      setCatches(data);
      setActiveCatch((current) => {
        if (!current) return current;
        return data.find((item) => item.id === current.id) ?? null;
      });
    });
    const unsubscribeTackle = subscribeToUserTackleStats(userId, (data) => setTackleStats(data));
    const unsubscribeTeams = subscribeToTeamsForUser(userId, (items) => setTeams(items));

    return () => {
      unsubscribeCatches();
      unsubscribeTackle();
      unsubscribeTeams();
    };
  }, [shouldHideContent, userId]);

  const canManageLogbook = useMemo(
    () => Boolean(isOwner && isProMember),
    [isOwner, isProMember],
  );
  const isFollowing = useMemo(() => {
    if (!authUser || !profile || isBlocked) return false;
    const followers = Array.isArray(profile.followers) ? profile.followers : [];
    return followers.includes(authUser.uid);
  }, [authUser, profile, isBlocked]);

  const handleToggleFollow = useCallback(async () => {
    if (!authUser || !profile?.uid || authUser.uid === profile.uid || followPending || isBlocked) return;

    setFollowPending(true);
    try {
      if (isFollowing) {
        await unfollowUser(authUser.uid, profile.uid);
      } else {
        await followUser(authUser.uid, profile.uid);
      }
    } catch (error) {
      console.error('Failed to update follow status', error);
      if (typeof window !== 'undefined') {
        window.alert('We could not update your follow status. Please try again.');
      }
    } finally {
      setFollowPending(false);
    }
  }, [authUser, profile, isFollowing, followPending, isBlocked]);

  const handleBlockToggle = useCallback(async () => {
    if (!authUser?.uid || !profile?.uid || blockPending) return;

    setBlockPending(true);
    try {
      if (viewerBlockedTarget) {
        await unblockUser(authUser.uid, profile.uid);
      } else {
        await blockUser(authUser.uid, profile.uid);
      }
    } catch (error) {
      console.error('Failed to update block status', error);
      if (typeof window !== 'undefined') {
        window.alert('We could not update your block settings. Please try again.');
      }
    } finally {
      setBlockPending(false);
    }
  }, [authUser?.uid, profile?.uid, blockPending, viewerBlockedTarget]);

  const handleReportUser = useCallback(async () => {
    if (!authUser?.uid || !profile?.uid || reportPending || authUser.uid === profile.uid) return;

    const reason = typeof window !== 'undefined'
      ? window.prompt('Why are you reporting this angler? (required)')
      : null;
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      return;
    }

    const details = typeof window !== 'undefined'
      ? window.prompt('Anything else we should know? (optional)')
      : null;

    setReportPending(true);
    try {
      await submitUserReport({
        reporterUid: authUser.uid,
        reportedUid: profile.uid,
        reason: trimmedReason,
        details: details?.trim() || undefined,
      });
      if (typeof window !== 'undefined') {
        window.alert('Thanks for letting us know. Our team will review the report shortly.');
      }
    } catch (error) {
      console.error('Failed to submit user report', error);
      if (typeof window !== 'undefined') {
        window.alert('We could not submit your report. Please try again.');
      }
    } finally {
      setReportPending(false);
    }
  }, [authUser?.uid, profile?.uid, reportPending]);

  return (
    <main>
      <NavBar />
      <section className="container pt-28 pb-10">
        {loading ? (
          <div className="card p-6">
            <p className="text-white/70">Loading profile…</p>
          </div>
        ) : profile ? (
          <ProfileView
            profile={profile}
            catches={catches}
            isOwner={isOwner}
            onOpenLogbook={canManageLogbook ? () => setIsLogbookModalOpen(true) : undefined}
            isFollowing={isFollowing}
            onToggleFollow={!isOwner && authUser ? handleToggleFollow : undefined}
            followPending={followPending}
            canFollow={!shouldHideContent}
            onCatchSelect={(catchItem) => setActiveCatch(catchItem)}
            catchSummary={catchSummary}
            tackleStats={tackleStats}
            teams={teams}
            messageHref={messageHref}
            onBlockToggle={!isOwner && authUser ? handleBlockToggle : undefined}
            blockPending={blockPending}
            isBlocked={isBlocked}
            onReport={!isOwner && authUser ? handleReportUser : undefined}
            reportPending={reportPending}
            blockedNotice={blockedNotice}
          />
        ) : (
          <div className="card p-6">
            <p className="text-white/70">Profile not found.</p>
          </div>
        )}
      </section>
      {activeCatch && (
        <PostDetailModal post={activeCatch} onClose={() => setActiveCatch(null)} />
      )}
      {canManageLogbook ? (
        <LogbookModal open={isLogbookModalOpen} onClose={() => setIsLogbookModalOpen(false)} />
      ) : null}
    </main>
  );
}
