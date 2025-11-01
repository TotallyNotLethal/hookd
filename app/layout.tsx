import type { Metadata } from "next";
import "./globals.css";

import MobileTabBar from "@/components/MobileTabBar";
import OfflineBanner from "@/components/OfflineBanner";

export const metadata: Metadata = {
  title: "Hook'd – Fishing Social",
  description: "Connect with anglers, share catches, explore fishing spots.",
  icons: [{ rel: "icon", url: "/logo.svg" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OfflineBanner />
        <div className="min-h-screen pt-nav pb-mobile-nav">
          {children}
        </div>
        <MobileTabBar />
      </body>
    </html>
  );
}
