"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Entrance animations: each element settles into .is-in on its own animationend.
// If animations are not running at all (reduced motion, old engines), show everything.
export function Motion() {
  const path = usePathname();
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".appear:not(.is-in), .hero-photo:not(.is-in)"));
    const done = (e: AnimationEvent) => {
      if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).classList.add("is-in");
    };
    els.forEach((el) => el.addEventListener("animationend", done as EventListener, { once: true }));
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const live = els.some((el) => el.getAnimations?.().some((a) => a.playState === "running" || a.playState === "finished"));
        if (!live) els.forEach((el) => el.classList.add("is-in"));
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      els.forEach((el) => el.removeEventListener("animationend", done as EventListener));
    };
  }, [path]);
  return null;
}
