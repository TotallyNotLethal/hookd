'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { tabs } from './NavBar';

export default function MobileTabBar() {
  const pathname = usePathname();

  const navigationTabs = tabs.filter((tab) => tab.type === 'link');
  const actionTab = tabs.find((tab) => tab.type === 'action');
  const ActionIcon = actionTab?.icon;

  return (
    <nav
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      aria-label="Primary navigation"
    >
      <div className="mx-auto max-w-md pt-3">
        <div className="relative">
          <div
            className="pointer-events-none absolute -top-6 left-0 right-0 z-0 h-6 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent"
            aria-hidden="true"
          />
          <div className="relative z-10 flex items-center justify-between rounded-3xl border border-white/10 bg-slate-950/90 px-6 py-3 shadow-lg shadow-slate-950/40 backdrop-blur">
            {navigationTabs.map((tab) => {
              const baseHref = tab.href.split('?')[0];
              const isActive = baseHref === '/' ? pathname === '/' : pathname.startsWith(baseHref);
              const Icon = tab.icon;

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex flex-col items-center gap-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 ${
                    isActive
                      ? 'text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </div>

          {actionTab && ActionIcon ? (
            <Link
              href={actionTab.href}
              className="absolute -top-6 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-brand-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-xl shadow-brand-500/40 transition hover:bg-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-200"
              aria-label={actionTab.label}
            >
              <ActionIcon className="h-5 w-5" />
              <span>{actionTab.label}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
