import {
  Building2,
  Folder,
  MapPin,
  Phone,
  Shield,
  User,
  Star,
} from "lucide-react";

import { PoliceCardData, policeCardFieldOrder, policeCardLabels } from "@/lib/policeCard";

type PoliceCardPreviewProps = {
  data: PoliceCardData;
};

const fieldIcons = {
  department: Building2,
  officer: User,
  unit: Shield,
  caseNumber: Folder,
  phone: Phone,
  address: MapPin,
} as const;

export default function PoliceCardPreview({ data }: PoliceCardPreviewProps) {
  return (
    <article className="mx-auto w-full max-w-5xl rounded-[2rem] border-[10px] border-slate-200 bg-[#011845] p-3 shadow-2xl">
      <div className="overflow-hidden rounded-[1.55rem] border-[3px] border-slate-300 bg-[#f3f6fb]">
        <header className="relative border-b border-white/30 bg-gradient-to-r from-[#0d2f6a] via-[#072253] to-[#03173f] px-6 pb-4 pt-6 text-white sm:px-10 sm:pb-6 sm:pt-8">
          <div className="flex items-center gap-4 sm:gap-8">
            <div className="grid h-20 w-20 place-items-center rounded-2xl border-2 border-slate-200/80 bg-[#072258] sm:h-28 sm:w-28">
              <Shield className="h-10 w-10 text-slate-100 sm:h-14 sm:w-14" />
            </div>
            <div className="flex-1">
              <div className="mb-3 border-t border-slate-200/60" />
              <h2 className="text-xl font-bold uppercase tracking-[0.12em] text-slate-50 sm:text-5xl sm:tracking-[0.15em]">
                Police Information Card
              </h2>
              <div className="mt-3 border-t border-slate-200/60" />
              <div className="mt-3 flex items-center justify-center gap-3 text-xs uppercase tracking-[0.45em] text-slate-100/90 sm:text-base">
                <Star className="h-3.5 w-3.5 fill-current" />
                <Star className="h-3.5 w-3.5 fill-current" />
                <span>Ohio</span>
                <Star className="h-3.5 w-3.5 fill-current" />
                <Star className="h-3.5 w-3.5 fill-current" />
              </div>
            </div>
          </div>
        </header>

        <section className="relative p-4 sm:p-8">
          <div className="pointer-events-none absolute inset-y-8 right-2 hidden w-[34%] rounded-full bg-slate-200/40 blur-3xl sm:block" />
          <div className="relative space-y-4 sm:space-y-5">
            {policeCardFieldOrder.map((field) => {
              const Icon = fieldIcons[field];

              return (
                <div key={field} className="grid grid-cols-[auto_1fr] items-center gap-3 sm:gap-5">
                  <div
                    className="flex h-10 w-[182px] items-center gap-2 bg-[#07295f] px-3 text-white sm:h-12 sm:w-[222px]"
                    style={{ clipPath: "polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%)" }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.13em] sm:text-sm">{policeCardLabels[field]}</span>
                  </div>

                  <div className="flex min-h-10 items-end border-b-2 border-slate-400/70 pb-1 text-[#092152] sm:min-h-12">
                    <span className="whitespace-pre-wrap break-words text-sm font-medium sm:text-base">{data[field] || " "}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="grid place-items-center border-t border-slate-200 bg-gradient-to-r from-[#0d2f6a] via-[#072253] to-[#03173f] py-2 text-white">
          <div className="rounded-full bg-slate-200/90 p-1 text-[#072258]">
            <Star className="h-5 w-5 fill-current" />
          </div>
        </footer>
      </div>
    </article>
  );
}
