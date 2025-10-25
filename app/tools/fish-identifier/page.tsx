"use client";

import { FormEvent, useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import Image from "next/image";

interface Prediction {
  species: string;
  confidence: number;
  tips: string;
}

export default function FishIdentifierPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setIsLoading(true);
    setPrediction(null);

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

      setPrediction(data as Prediction);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error identifying fish.");
    } finally {
      setIsLoading(false);
    }
  };

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
                setPrediction(null);
                if (nextFile) {
                  const url = URL.createObjectURL(nextFile);
                  setPreviewUrl(url);
                } else {
                  setPreviewUrl(null);
                }
              }}
              className="mt-2 w-full rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm text-white/70 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <p className="mt-2 text-xs text-white/50">Supported formats: JPG, PNG. Photos never leave your device in this demo.</p>
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
          {prediction && (
            <div className="rounded-3xl border border-brand-500/40 bg-brand-500/10 p-5 space-y-2">
              <p className="text-sm uppercase tracking-[0.3em] text-brand-100">Prediction</p>
              <h2 className="text-2xl font-semibold text-white">{prediction.species}</h2>
              <p className="text-sm text-white/70">Confidence: {(prediction.confidence * 100).toFixed(0)}%</p>
              <p className="text-sm text-brand-100">Tip: {prediction.tips}</p>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
