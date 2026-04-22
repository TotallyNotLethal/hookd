import { Suspense } from "react";

import PoliceCardViewClient from "./PoliceCardViewClient";

function LoadingState() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-white/60">Police Card QR View</p>
          <h1 className="text-2xl font-semibold sm:text-3xl">Loading police card...</h1>
        </header>
      </section>
    </main>
  );
}

export default function PoliceCardViewPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PoliceCardViewClient />
    </Suspense>
  );
}
