"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

import PoliceCardPreview from "@/components/police-card/PoliceCardPreview";
import {
  formatPhoneAsText,
  fromSearchParams,
  hasCompletePoliceCardData,
  toPoliceCardQueryString,
  validatePoliceCardData,
} from "@/lib/policeCard";

function triggerDownload(url: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "police-information-card.png";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function PoliceCardViewClient() {
  const searchParams = useSearchParams();
  const autoDownloadAttemptedRef = useRef(false);

  const data = useMemo(() => {
    const parsed = fromSearchParams(searchParams);
    return {
      ...parsed,
      phone: formatPhoneAsText(parsed.phone),
    };
  }, [searchParams]);

  const errors = useMemo(() => validatePoliceCardData(data), [data]);
  const canDownload = hasCompletePoliceCardData(data);
  const downloadUrl = `/api/police-card/image?${toPoliceCardQueryString(data)}`;

  useEffect(() => {
    if (!canDownload || autoDownloadAttemptedRef.current) {
      return;
    }
    autoDownloadAttemptedRef.current = true;
    triggerDownload(downloadUrl);
  }, [canDownload, downloadUrl]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-white/60">Police Card QR View</p>
          <h1 className="text-2xl font-semibold sm:text-3xl">Police Information Card</h1>
          <p className="text-sm text-white/70 sm:text-base">
            If your download did not start automatically, tap the button below.
          </p>
        </header>

        {!canDownload ? (
          <div className="rounded-2xl border border-red-400/50 bg-red-500/10 p-4 text-red-100">
            <p className="font-semibold">Missing required card values.</p>
            <ul className="ml-5 mt-2 list-disc text-sm">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              Return to the{" "}
              <Link href="/police-card" className="text-blue-300 underline">
                generator page
              </Link>{" "}
              to fill all required fields.
            </p>
          </div>
        ) : null}

        <div className="flex justify-center">
          <a
            href={downloadUrl}
            download="police-information-card.png"
            className={`rounded-xl px-6 py-3 text-lg font-semibold transition ${
              canDownload ? "bg-blue-600 text-white hover:bg-blue-500" : "cursor-not-allowed bg-slate-700 text-white/70"
            }`}
            aria-disabled={!canDownload}
            onClick={(event) => {
              if (!canDownload) {
                event.preventDefault();
              }
            }}
          >
            Download Card
          </a>
        </div>

        <PoliceCardPreview data={data} />
      </section>
    </main>
  );
}
