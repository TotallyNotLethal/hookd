'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { tabs } from './NavBar';

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="sm:hidden fixed inset-x-0 bottom-0 z-[1200] overflow-hidden border-t border-white/10 bg-slate-950/90 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] backdrop-blur"
      aria-label="Primary navigation"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-around gap-1 px-6 py-2">
        {tabs.map((tab) => {
          if (tab.type !== 'link') {
            return null;
          }

          const baseHref = tab.href.split('?')[0];
          const isActive = baseHref === '/' ? pathname === '/' : pathname.startsWith(baseHref);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-1 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300 ${
                isActive ? 'text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
