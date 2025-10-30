'use client';
import NavBar from "@/components/NavBar";
import PostCard from "@/components/PostCard";
import {
  getCatchById,
  subscribeToFeedCatches,
  subscribeToFollowingFeedCatches,
  subscribeToLocalFeedCatches,
  subscribeToTeam,
  subscribeToTeamFeedCatches,
  subscribeToTeamMembership,
  subscribeToUser,
  type HookdUser,
  type Team,
  type TeamMembership,
} from "@/lib/firestore";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import PostDetailModal from "./PostDetailModal";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebaseClient";

const AddCatchModal = dynamic(() => import("@/components/AddCatchModal"), {
  ssr: false,
  loading: () => <div className="p-6 text-white/60">Loading map…</div>,
});


type FeedFilter = "all" | "following" | "local" | "team";

const EMPTY_FOLLOWING_IDS: string[] = [];
const EMPTY_TEAM_MEMBERS: string[] = [];

const BASE_FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "following", label: "Following" },
  { key: "local", label: "Local (50 mi)" },
];

function FeedContent() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<any | null>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [teamMembership, setTeamMembership] = useState<TeamMembership | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [viewerProfile, setViewerProfile] = useState<HookdUser | null>(null);
  const sp = useSearchParams();
  const router = useRouter();
  const [user] = useAuthState(auth);
  const [isLoadingCatch, setIsLoadingCatch] = useState(false);
  const [catchLoadError, setCatchLoadError] = useState<string | null>(null);

  const searchParamsString = sp?.toString() ?? "";
  const catchIdParam = sp?.get("catchId");

  const defer = useCallback((fn: () => void) => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(fn);
    } else {
      Promise.resolve().then(fn);
    }
  }, []);

  const effectiveFollowingIds = useMemo(
    () => (user?.uid ? followingIds : EMPTY_FOLLOWING_IDS),
    [followingIds, user?.uid],
  );
  const teamMemberUids = team?.memberUids ?? EMPTY_TEAM_MEMBERS;
  const filters = useMemo(() => {
    const entries = [...BASE_FILTERS];
    if (team) {
      entries.push({ key: "team" as const, label: team.name ? `Team (${team.name})` : "Team" });
    }
    return entries;
  }, [team]);

  const blockedSet = useMemo(() => {
    const ids = new Set<string>();
    const blocked = Array.isArray(viewerProfile?.blockedUserIds) ? viewerProfile.blockedUserIds : [];
    const blockedBy = Array.isArray(viewerProfile?.blockedByUserIds) ? viewerProfile.blockedByUserIds : [];

    for (const value of blocked) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) ids.add(trimmed);
      }
    }

    for (const value of blockedBy) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) ids.add(trimmed);
      }
    }

    return ids;
  }, [viewerProfile]);

  const filterPosts = useCallback(
    (posts: any[]) => {
      if (!Array.isArray(posts) || posts.length === 0 || blockedSet.size === 0) {
        return posts;
      }

      return posts.filter((post) => {
        const ownerUid = typeof post?.uid === "string"
          ? post.uid
          : typeof post?.userId === "string"
            ? post.userId
            : null;
        if (!ownerUid) return true;
        return !blockedSet.has(ownerUid);
      });
    },
    [blockedSet],
  );

  useEffect(() => {
    if (!user?.uid) {
      defer(() => {
        setViewerProfile(null);
        setFollowingIds([]);
      });
      return;
    }
    const unsubscribe = subscribeToUser(user.uid, (data) => {
      defer(() => {
        setViewerProfile(data);
        if (!data) {
          setFollowingIds([]);
          return;
        }
        const following = Array.isArray(data.following)
          ? data.following.filter((id: unknown): id is string => typeof id === "string")
          : [];
        setFollowingIds(following);
      });
    });
    return () => unsubscribe();
  }, [defer, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      defer(() => {
        setTeamMembership(null);
        setTeam(null);
      });
      return;
    }

    const unsubscribe = subscribeToTeamMembership(user.uid, (membership) => {
      defer(() => setTeamMembership(membership));
    });

    return () => unsubscribe();
  }, [defer, user?.uid]);

  useEffect(() => {
    const teamId = teamMembership?.teamId;
    if (!teamId) {
      defer(() => setTeam(null));
      return;
    }

    const unsubscribe = subscribeToTeam(teamId, (next) => {
      defer(() => setTeam(next));
    });

    return () => unsubscribe();
  }, [defer, teamMembership?.teamId]);

  useEffect(() => {
    if (filter === "team" && !team) {
      defer(() => setFilter("all"));
    }
  }, [defer, filter, team]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (filter === "all") {
      unsubscribe = subscribeToFeedCatches((posts) => {
        setItems(filterPosts(posts));
      });
    } else if (filter === "following") {
      if (!user?.uid || effectiveFollowingIds.length === 0) {
        defer(() => setItems([]));
      } else {
        unsubscribe = subscribeToFollowingFeedCatches(effectiveFollowingIds, (posts) => {
          setItems(filterPosts(posts));
        });
      }
    } else if (filter === "local") {
      if (!location) {
        defer(() => setItems([]));
      } else {
        unsubscribe = subscribeToLocalFeedCatches(location, 50, (posts) => {
          setItems(filterPosts(posts));
        });
      }
    } else if (filter === "team") {
      if (!user?.uid || !team) {
        defer(() => setItems([]));
      } else if (teamMemberUids.length === 0) {
        defer(() => setItems([]));
      } else {
        unsubscribe = subscribeToTeamFeedCatches(teamMemberUids, (posts) => {
          setItems(filterPosts(posts));
        });
      }
    }

    return () => {
      unsubscribe?.();
    };
  }, [defer, effectiveFollowingIds, filter, filterPosts, location, team, teamMemberUids, user?.uid]);

  useEffect(() => {
    if (sp.get("compose") === "1") {
      defer(() => setOpen(true));
    }
  }, [defer, sp]);

  const handleFilterSelect = useCallback(
    (next: FeedFilter) => {
      if (next === "local") {
        setFilter("local");
        if (!location) {
          if (!navigator.geolocation) {
            setGeoError("Location is not supported in this browser. Showing all catches instead.");
            setFilter("all");
            return;
          }
          setGeoLoading(true);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              setGeoLoading(false);
              setGeoError(null);
            },
            () => {
              setGeoLoading(false);
              setGeoError("We couldn't access your location. Showing all catches instead.");
              setFilter("all");
            },
            { enableHighAccuracy: false, timeout: 10000 },
          );
        }
        return;
      }

      setFilter(next);
    },
    [location],
  );

  const statusMessage = useMemo(() => {
    if (filter === "following" && !user) {
      return "Sign in to see catches from anglers you follow.";
    }
    if (filter === "following" && effectiveFollowingIds.length === 0) {
      return "Follow anglers to see their latest catches here.";
    }
    if (filter === "local" && geoLoading) {
      return "Locating you…";
    }
    if (filter === "local" && !location) {
      return "Share your location to find catches near you.";
    }
    if (filter === "team" && !user) {
      return "Sign in to see catches from your crew.";
    }
    if (filter === "team" && !team) {
      return "Join a team to unlock crew catches.";
    }
    if (filter === "team" && teamMemberUids.length === 0) {
      return "Invite anglers to your crew to start sharing catches.";
    }
    if (items.length === 0) {
      if (filter === "team") {
        return "Your crew hasn’t logged any catches yet.";
      }
      return "No catches yet. Be the first to share!";
    }
    return null;
  }, [effectiveFollowingIds.length, filter, geoLoading, items.length, location, team, teamMemberUids.length, user]);

  const openDetail = useCallback((post: any) => {
    setActive(post);
    setCatchLoadError(null);
    setIsLoadingCatch(false);
    const params = new URLSearchParams(searchParamsString);
    params.set("catchId", post.id);
    router.replace(params.toString() ? `/feed?${params}` : "/feed", { scroll: false });
  }, [router, searchParamsString]);

  const closeDetail = useCallback(() => {
    setActive(null);
    const params = new URLSearchParams(searchParamsString);
    params.delete("catchId");
    router.replace(params.toString() ? `/feed?${params}` : "/feed", { scroll: false });
  }, [router, searchParamsString]);

  const activeIndex = useMemo(
    () => (active ? items.findIndex((item) => item.id === active.id) : -1),
    [active, items],
  );

  const previousPost = useMemo(
    () => (activeIndex > 0 ? items[activeIndex - 1] : null),
    [activeIndex, items],
  );

  const nextPost = useMemo(
    () => (activeIndex >= 0 && activeIndex < items.length - 1 ? items[activeIndex + 1] : null),
    [activeIndex, items],
  );

  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = active?.id ?? null;
  }, [active?.id]);

  useEffect(() => {
    if (!catchIdParam) {
      defer(() => {
        setIsLoadingCatch(false);
        setCatchLoadError(null);
      });
      return;
    }

    const activeId = activeIdRef.current;

    if (activeId === catchIdParam) {
      return;
    }

    const matching = items.find((item) => item.id === catchIdParam);
    if (matching) {
      defer(() => {
        setActive(matching);
        setCatchLoadError(null);
        setIsLoadingCatch(false);
      });
      return;
    }

    let isCancelled = false;
    defer(() => {
      setIsLoadingCatch(true);
      setCatchLoadError(null);
    });

    void getCatchById(catchIdParam)
      .then((result) => {
        if (isCancelled) return;
        if (result) {
          setActive(result);
          setCatchLoadError(null);
        } else {
          setCatchLoadError("We couldn't find that catch.");
          defer(() => setActive(null));
          const params = new URLSearchParams(searchParamsString);
          params.delete("catchId");
          router.replace(params.toString() ? `/feed?${params}` : "/feed", { scroll: false });
        }
      })
      .catch((error) => {
        console.error("Failed to open catch from notification", error);
        if (isCancelled) return;
        setCatchLoadError("We couldn't load that catch. Please try again.");
        defer(() => setActive(null));
        const params = new URLSearchParams(searchParamsString);
        params.delete("catchId");
        router.replace(params.toString() ? `/feed?${params}` : "/feed", { scroll: false });
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingCatch(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [catchIdParam, defer, items, router, searchParamsString]);

  useEffect(() => {
    if (!catchIdParam) {
      defer(() => setActive(null));
      return;
    }

    const matching = items.find((item) => item.id === catchIdParam);
    const activeId = activeIdRef.current;
    if (matching && activeId !== matching.id) {
      defer(() => setActive(matching));
    }
  }, [catchIdParam, defer, items]);

  return (
    <main>
      <NavBar />
      <section className="container pt-28 pb-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Latest Catches</h2>
          <button className="btn-primary" onClick={() => setOpen(true)}>
            + Add Catch
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          {filters.map((item) => (
            <button
              key={item.key}
              onClick={() => handleFilterSelect(item.key)}
              className={`rounded-full px-4 py-1.5 text-sm transition border ${
                filter === item.key
                  ? "border-brand-300 bg-brand-400/20 text-white"
                  : "border-white/20 text-white/70 hover:text-white hover:border-white/40"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {geoError && (
          <div className="mb-4 text-sm text-amber-300/80">
            {geoError}
          </div>
        )}
        {catchLoadError && (
          <div className="mb-4 text-sm text-amber-300/80">
            {catchLoadError}
          </div>
        )}
        {isLoadingCatch && !catchLoadError && (
          <div className="mb-4 text-sm text-white/60">Loading catch…</div>
        )}
        {statusMessage && (
          <p className="text-white/60 mb-4">{statusMessage}</p>
        )}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((p) => (
            <PostCard key={p.id} post={p} onOpen={openDetail} />
          ))}
        </div>
      </section>

      {open && (
        <AddCatchModal
          onClose={() => {
            setOpen(false);
            router.replace("/feed");
          }}
        />
      )}
      {active && (
        <PostDetailModal
          post={active}
          onClose={closeDetail}
          size="wide"
          onNavigatePrevious={previousPost ? () => openDetail(previousPost) : undefined}
          onNavigateNext={nextPost ? () => openDetail(nextPost) : undefined}
        />
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="text-center p-8">Loading feed...</div>}>
      <FeedContent />
    </Suspense>
  );
}
