import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hook'd – Fishing Social",
  description: "Connect with anglers, share catches, explore fishing spots.",
  icons: [{ rel: "icon", url: "/logo.svg" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
