'use client';
import NavBar from "@/components/NavBar";
import PostCard from "@/components/PostCard";
import { subscribeToFeedCatches } from "@/lib/firestore";
import { Suspense, useEffect, useState } from "react";
import AddCatchModal from "@/components/AddCatchModal";
import { useRouter, useSearchParams } from "next/navigation";
import PostDetailModal from "./PostDetailModal";

function FeedContent() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<any | null>(null);
  const sp = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const unsub = subscribeToFeedCatches(setItems);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (sp.get("compose") === "1") setOpen(true);
  }, [sp]);

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
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((p) => (
            <PostCard key={p.id} post={p} onOpen={openDetail} />
          ))}
          {items.length === 0 && (
            <p className="text-white/60">
              No catches yet. Be the first to share!
            </p>
          )}
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
