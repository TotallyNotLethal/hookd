'use client';
import NavBar from "@/components/NavBar";
import PostCard from "@/components/PostCard";
import {
  subscribeToFeedCatches,
  subscribeToFollowingFeedCatches,
  subscribeToLocalFeedCatches,
  subscribeToUser,
} from "@/lib/firestore";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import PostDetailModal from "./PostDetailModal";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebaseClient";

const AddCatchModal = dynamic(() => import("@/components/AddCatchModal"), {
  ssr: false,
  loading: () => <div className="p-6 text-white/60">Loading map…</div>,
});


type FeedFilter = "all" | "following" | "local";

const EMPTY_FOLLOWING_IDS: string[] = [];

const FILTERS: { key: FeedFilter; label: string }[] = [
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
  const sp = useSearchParams();
  const router = useRouter();
  const [user] = useAuthState(auth);

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

  useEffect(() => {
    if (!user?.uid) {
      return;
    }
    const unsubscribe = subscribeToUser(user.uid, (data) => {
      if (!data) {
        defer(() => setFollowingIds([]));
        return;
      }
      const following = Array.isArray(data.following)
        ? data.following.filter((id: unknown): id is string => typeof id === "string")
        : [];
      defer(() => setFollowingIds(following));
    });
    return () => unsubscribe();
  }, [defer, user?.uid]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (filter === "all") {
      unsubscribe = subscribeToFeedCatches(setItems);
    } else if (filter === "following") {
      if (!user?.uid || effectiveFollowingIds.length === 0) {
        defer(() => setItems([]));
      } else {
        unsubscribe = subscribeToFollowingFeedCatches(effectiveFollowingIds, setItems);
      }
    } else if (filter === "local") {
      if (!location) {
        defer(() => setItems([]));
      } else {
        unsubscribe = subscribeToLocalFeedCatches(location, 50, setItems);
      }
    }

    return () => {
      unsubscribe?.();
    };
  }, [defer, effectiveFollowingIds, filter, location, user?.uid]);

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
    if (items.length === 0) {
      return "No catches yet. Be the first to share!";
    }
    return null;
  }, [effectiveFollowingIds.length, filter, geoLoading, items.length, location, user]);

  const openDetail = (post: any) => {
    setActive(post);
  };

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
          {FILTERS.map((item) => (
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
      {active && <PostDetailModal post={active} onClose={() => setActive(null)} />}
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
