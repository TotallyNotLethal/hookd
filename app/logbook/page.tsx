"use client";

import NavBar from "@/components/NavBar";
import LogbookContent from "@/components/logbook/LogbookContent";

export default function LogbookPage() {
  return (
    <main>
      <NavBar />
      <section className="container pt-28 pb-16">
        <LogbookContent />
      </section>
    </main>
  );
}
