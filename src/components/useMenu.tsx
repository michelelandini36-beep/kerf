"use client";
import { useCallback, useEffect, useState } from "react";

/** Full-screen mobile menu: toggles body.menu-open, closes on Escape and on desktop resize. */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const mq = window.matchMedia("(min-width: 960px)");
    const onMq = () => mq.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", close);
    mq.addEventListener("change", onMq);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", close);
      mq.removeEventListener("change", onMq);
    };
  }, [close]);
  return { open, toggle: () => setOpen((o) => !o), close };
}

export function Burger({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" className="burger" aria-controls="mnav" aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={onClick}>
      <span aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}
