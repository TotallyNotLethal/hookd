"use client";

import { useEffect } from "react";

const SCROLL_RATIO_DESKTOP = 0.22;
const SCROLL_RATIO_MOBILE = 0.14;
const MAX_OFFSET_DESKTOP = 160;
const MAX_OFFSET_MOBILE = 96;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function OceanBackground() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const body = document.body;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const prefersMobileLayout = window.matchMedia("(max-width: 768px)");

    let ticking = false;
    let listening = false;

    const calculateOffset = () => {
      const ratio = prefersMobileLayout.matches ? SCROLL_RATIO_MOBILE : SCROLL_RATIO_DESKTOP;
      const limit = prefersMobileLayout.matches ? MAX_OFFSET_MOBILE : MAX_OFFSET_DESKTOP;
      const offset = clamp(window.scrollY * ratio, 0, limit);
      body.style.setProperty("--ocean-offset", `${offset}px`);
    };

    const handleScroll = () => {
      if (prefersReducedMotion.matches) {
        return;
      }

      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(() => {
          calculateOffset();
          ticking = false;
        });
      }
    };

    const enableScrollEffect = () => {
      if (!listening) {
        calculateOffset();
        window.addEventListener("scroll", handleScroll, { passive: true });
        listening = true;
      }
    };

    const disableScrollEffect = () => {
      if (listening) {
        window.removeEventListener("scroll", handleScroll);
        listening = false;
      }
      body.style.removeProperty("--ocean-offset");
    };

    const handleMotionPreferenceChange = () => {
      if (prefersReducedMotion.matches) {
        disableScrollEffect();
      } else {
        enableScrollEffect();
      }
    };

    const handleLayoutChange = () => {
      if (!prefersReducedMotion.matches) {
        calculateOffset();
      }
    };

    if (!prefersReducedMotion.matches) {
      enableScrollEffect();
    }

    prefersReducedMotion.addEventListener("change", handleMotionPreferenceChange);
    prefersMobileLayout.addEventListener("change", handleLayoutChange);

    return () => {
      disableScrollEffect();
      prefersReducedMotion.removeEventListener("change", handleMotionPreferenceChange);
      prefersMobileLayout.removeEventListener("change", handleLayoutChange);
    };
  }, []);

  return null;
}
