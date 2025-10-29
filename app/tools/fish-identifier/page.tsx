"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2 } from "lucide-react";

import NavBar from "@/components/NavBar";
import { useProAccess } from "@/hooks/useProAccess";

interface CandidatePrediction {
  species: string;
  confidence: number;
  tips?: string;
  label: string;
}

interface PredictionResponse {
  predictions: CandidatePrediction[];
  lowConfidence?: boolean;
  note?: string;
}

export default function FishIdentifierPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isPro, loading: proLoading, profile } = useProAccess();

  const hasPredictions = useMemo(() => Boolean(result?.predictions?.length), [result?.predictions?.length]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError("Upload a photo to get a prediction.");
      return;
    }
    if (!isPro) {
      setError("Fish ID is available for Hook'd Pro members only.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/fish-id", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to identify fish right now.");
      }

      setResult(data as PredictionResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error identifying fish.");
    } finally {
      setIsLoading(false);
    }
  };

  const topPrediction = result?.predictions?.[0];
  const otherPredictions = result?.predictions?.slice(1) ?? [];

  return (
    <main>
      <NavBar />
      <section className="container pt-28 pb-16 space-y-10">
        <header className="max-w-3xl space-y-4">
          <p className="text-sm uppercase tracking-[0.3em] text-white/60">Instant ID</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-white">Identify a fish with a quick photo upload</h1>
          <p className="text-white/70">
            Our lightweight identifier gives you a species guess and technique tip inspired by Fishbrain&apos;s smart assistant.
            Snap a clear side profile for the most accurate results.
          </p>
        </header>
        {proLoading ? (
          <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking your Hook&apos;d Pro access…</span>
          </div>
        ) : !isPro ? (
          <div className="space-y-4 rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6 text-amber-100">
            <h2 className="text-lg font-semibold">Fish ID is a Hook&apos;d Pro exclusive</h2>
            <p className="text-sm text-amber-100/80">
              Upgrade to Hook&apos;d Pro to unlock instant fish identification along with the AI guide, premium map layers, and team
              creation tools.
            </p>
            <div className="flex flex-wrap gap-3">
              {profile ? (
                <Link href="/profile" className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                  Manage membership
                </Link>
              ) : (
                <Link href="/login" className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                  Sign in to upgrade
                </Link>
              )}
              <Link
                href="/tools/fishing-assistant"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300/40 px-4 py-2 text-sm text-amber-100 transition hover:border-amber-200/60 hover:text-amber-50"
              >
                Meet the AI fishing guide
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass rounded-3xl border border-white/10 p-6 space-y-6">
            <div>
              <label htmlFor="photo" className="block text-sm font-medium text-white">
                Upload a catch photo
              </label>
              <input
                id="photo"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setFile(nextFile);
                  setResult(null);
                  if (nextFile) {
                    const url = URL.createObjectURL(nextFile);
                    setPreviewUrl(url);
                  } else {
                    setPreviewUrl(null);
                  }
                }}
                className="mt-2 w-full rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm text-white/70 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <p className="mt-2 text-xs text-white/50">
                Supported formats: JPG, PNG. Photos never leave your device in this demo.
              </p>
            </div>

            {previewUrl && (
              <div className="overflow-hidden rounded-3xl border border-white/10">
                <Image src={previewUrl} alt="Uploaded catch preview" width={800} height={600} className="h-64 w-full object-cover" unoptimized />
              </div>
            )}

            <button type="submit" className="btn-primary px-6 py-3 text-base disabled:opacity-60" disabled={isLoading}>
              {isLoading ? "Identifying..." : "Identify species"}
            </button>

            {error && <p className="text-sm text-red-300">{error}</p>}
            {result && hasPredictions ? (
              <div className="rounded-3xl border border-brand-500/40 bg-brand-500/10 p-5 space-y-4">
                <div className="space-y-1">
                  <p className="text-sm uppercase tracking-[0.3em] text-brand-100">Top match</p>
                  <h2 className="text-2xl font-semibold text-white">{topPrediction?.species ?? "Unknown"}</h2>
                  {topPrediction && topPrediction.label !== topPrediction.species && (
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">Model label: {topPrediction.label}</p>
                  )}
                  {topPrediction && (
                    <p className="text-sm text-white/70">Confidence: {(topPrediction.confidence * 100).toFixed(1)}%</p>
                  )}
                  {topPrediction?.tips && <p className="text-sm text-brand-100">Tip: {topPrediction.tips}</p>}
                </div>

                {result.lowConfidence && (
                  <p className="rounded-2xl border border-yellow-200/30 bg-yellow-200/10 p-3 text-sm text-yellow-100">
                    {result.note ?? "The classifier isn&apos;t confident—try sharper lighting or a closer profile view."}
                  </p>
                )}

                {otherPredictions.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-white/60">Other candidates</p>
                    <ul className="space-y-2">
                      {otherPredictions.map((candidate, index) => (
                        <li
                          key={`${candidate.label}-${index}`}
                          className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80"
                        >
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="font-medium text-white">#{index + 2} {candidate.species}</span>
                            <span>{(candidate.confidence * 100).toFixed(1)}%</span>
                          </div>
                          {candidate.label !== candidate.species && (
                            <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">Model label: {candidate.label}</p>
                          )}
                          {candidate.tips && <p className="mt-1 text-xs text-white/60">Tip: {candidate.tips}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </form>
        )}
      </section>
    </main>
  );
}
