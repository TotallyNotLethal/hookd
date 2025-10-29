import type { Metadata } from "next";
import "./globals.css";

import MobileTabBar from "@/components/MobileTabBar";

export const metadata: Metadata = {
  title: "Hook'd – Fishing Social",
  description: "Connect with anglers, share catches, explore fishing spots.",
  icons: [{ rel: "icon", url: "/logo.svg" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen pb-[calc(env(safe-area-inset-bottom)+6.5rem)] sm:pb-0">
          {children}
        </div>
        <MobileTabBar />
      </body>
    </html>
  );
}
