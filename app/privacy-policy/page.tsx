import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Privacy Policy | Hook'd",
  description: "Read Hook'd privacy policy.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:py-12">
      <h1 className="mb-6 text-3xl font-semibold text-slate-900">Privacy Policy</h1>
      <Script
        id="usercentrics-ppg"
        privacy-policy-id="ba6e18fa-1cb7-41f3-ac1e-483c2a217dc4"
        data-language="en"
        src="https://policygenerator.usercentrics.eu/api/privacy-policy"
        strategy="afterInteractive"
      />
      <div className="uc-privacy-policy" />
    </main>
  );
}
