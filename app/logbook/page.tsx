"use client";

import NavBar from "@/components/NavBar";
import LogbookContent from "@/components/logbook/LogbookContent";

export default function LogbookPage() {
  return (
    <main>
      <NavBar />
      <section className="container pt-nav pb-16">
        <LogbookContent />
      </section>
    </main>
  );
}
