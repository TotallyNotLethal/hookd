"use client";

import Link from "next/link";
import { ChangeEvent, useMemo, useState } from "react";

import NavBar from "@/components/NavBar";
import PoliceCardPreview from "@/components/police-card/PoliceCardPreview";
import {
  emptyPoliceCardData,
  formatPhoneAsText,
  hasCompletePoliceCardData,
  PoliceCardData,
  policeCardFieldOrder,
  policeCardLabels,
  toPoliceCardQueryString,
  validatePoliceCardData,
} from "@/lib/policeCard";

function createImageUrl(data: PoliceCardData) {
  return `/api/police-card/image?${toPoliceCardQueryString(data)}`;
}

export default function PoliceCardPage() {
  const [formData, setFormData] = useState<PoliceCardData>(emptyPoliceCardData);
  const [submitted, setSubmitted] = useState(false);

  const normalizedData = useMemo(
    () => ({
      ...formData,
      phone: formatPhoneAsText(formData.phone),
    }),
    [formData],
  );

  const errors = useMemo(() => validatePoliceCardData(normalizedData), [normalizedData]);
  const canGenerate = hasCompletePoliceCardData(normalizedData);
  const shareUrl = `/police-card/view?${toPoliceCardQueryString(normalizedData)}`;
  const imageUrl = createImageUrl(normalizedData);

  const onFieldChange = (field: keyof PoliceCardData) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <main>
      <NavBar />
      <section className="container space-y-8 pb-16 pt-nav">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.3em] text-white/60">Tools</p>
          <h1 className="text-3xl font-semibold text-white md:text-4xl">Police Information Card Generator</h1>
          <p className="max-w-3xl text-white/70">
            Enter card details, preview instantly, and generate a downloadable PNG that can be shared via QR destination URL.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <form
            className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/80 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
            }}
          >
            {policeCardFieldOrder.map((field) => {
              const commonProps = {
                id: field,
                value: formData[field],
                onChange: onFieldChange(field),
                className:
                  "w-full rounded-xl border border-white/20 bg-slate-950/60 px-3 py-2 text-white placeholder:text-white/40 focus:border-blue-400 focus:outline-none",
                placeholder: `Enter ${policeCardLabels[field].toLowerCase()}`,
                required: true,
              };

              return (
                <div key={field} className="space-y-1">
                  <label htmlFor={field} className="text-sm font-medium text-white/80">
                    {policeCardLabels[field]}
                  </label>
                  {field === "address" ? <textarea {...commonProps} rows={3} /> : <input {...commonProps} type="text" />}
                </div>
              );
            })}

            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-500"
            >
              Validate Card Data
            </button>

            {submitted && errors.length > 0 ? (
              <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
                <p className="font-semibold">Please fix the following:</p>
                <ul className="ml-4 list-disc">
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
              <p className="font-semibold">Generated routes</p>
              <p>
                QR destination: <Link className="break-all text-blue-300 underline" href={shareUrl}>{shareUrl}</Link>
              </p>
              <p>
                PNG endpoint: <Link className="break-all text-blue-300 underline" href={imageUrl}>{imageUrl}</Link>
              </p>
              <a
                href={imageUrl}
                download="police-information-card.png"
                className={`inline-flex rounded-lg px-3 py-2 font-semibold text-white ${
                  canGenerate ? "bg-blue-600 hover:bg-blue-500" : "cursor-not-allowed bg-slate-700"
                }`}
                aria-disabled={!canGenerate}
                onClick={(event) => {
                  if (!canGenerate) {
                    event.preventDefault();
                    setSubmitted(true);
                  }
                }}
              >
                Download Card PNG
              </a>
            </div>
          </form>

          <div className="space-y-3">
            <p className="text-sm text-white/60">Live card preview</p>
            <PoliceCardPreview data={normalizedData} />
          </div>
        </div>
      </section>
    </main>
  );
}
