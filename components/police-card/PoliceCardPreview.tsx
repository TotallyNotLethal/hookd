import { PoliceCardData, policeCardFieldOrder, policeCardLabels } from "@/lib/policeCard";

type PoliceCardPreviewProps = {
  data: PoliceCardData;
};

export default function PoliceCardPreview({ data }: PoliceCardPreviewProps) {
  return (
    <article className="mx-auto w-full max-w-4xl rounded-3xl border-4 border-blue-950 bg-slate-50 p-4 shadow-2xl sm:p-6">
      <div className="rounded-2xl border-2 border-blue-900 p-5 sm:p-8">
        <header className="mb-6 border-b-2 border-blue-900 pb-4 text-center sm:mb-8">
          <h2 className="text-2xl font-bold uppercase tracking-[0.22em] text-blue-950 sm:text-4xl">Police Information Card</h2>
        </header>

        <div className="space-y-4 text-blue-950 sm:space-y-5">
          {policeCardFieldOrder.map((field) => (
            <div key={field} className="grid grid-cols-[120px_1fr] items-start gap-2 border-b border-blue-900/40 pb-2 sm:grid-cols-[160px_1fr]">
              <span className="text-sm font-semibold uppercase tracking-wide sm:text-base">{policeCardLabels[field]}:</span>
              <span className="min-h-6 whitespace-pre-wrap break-words text-sm sm:text-base">{data[field] || "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
