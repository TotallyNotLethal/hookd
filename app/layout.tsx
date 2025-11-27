import type { Metadata, Viewport } from "next";
import "./globals.css";

import MobileTabBar from "@/components/MobileTabBar";
import OceanBackground from "@/components/OceanBackground";
import OfflineBanner from "@/components/OfflineBanner";
import { LoginModalProvider } from "@/components/auth/LoginModalContext";

export const metadata: Metadata = {
  title: "Hook'd – Fishing Social",
  description: "Connect with anglers, share catches, explore fishing spots.",
  icons: [{ rel: "icon", url: "/logo.svg" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OceanBackground />
        <LoginModalProvider>
          <OfflineBanner />
          <div className="min-h-screen pt-nav pb-mobile-nav">
            {children}
          </div>
          <MobileTabBar />
        </LoginModalProvider>
      </body>
    </html>
  );
}
