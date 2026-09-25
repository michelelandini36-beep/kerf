"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RoutesSnapshot } from "@/lib/data/types";

const STORE = "kerf.alert";

/**
 * "Notify me": while on, the scanner polls faster and, the moment a scan has at
 * least one eligible loop, fires a browser notification, plays a short chime and
 * flags the tab title. It fires once per eligible block, not on every poll.
 */
export function useEligibleAlert(data: RoutesSnapshot | null) {
  const [on, setOn] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const audio = useRef<AudioContext | null>(null);
  const lastBlock = useRef<number | null>(null);
  const baseTitle = useRef<string>("");

  useEffect(() => {
    baseTitle.current = document.title;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    try {
      if (localStorage.getItem(STORE) === "1") setOn(true);
    } catch {}
  }, []);

  const chime = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.18);
      o.stop(t + i * 0.18 + 0.4);
    });
  }, []);

  const toggle = useCallback(async () => {
    const next = !on;
    if (next) {
      // created inside the click so browsers allow it to play later
      audio.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      await audio.current.resume().catch(() => {});
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        setPermission(await Notification.requestPermission());
      }
    }
    setOn(next);
    try {
      localStorage.setItem(STORE, next ? "1" : "0");
    } catch {}
  }, [on]);

  useEffect(() => {
    if (!data) return;
    const n = data.eligible;
    document.title = on && n > 0 ? `(${n}) Eligible · Kerf` : baseTitle.current || document.title;
    if (!on || n === 0 || lastBlock.current === data.meta.block) return;
    lastBlock.current = data.meta.block;
    chime();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const best = data.quoted.find((q) => q.verdict === "eligible");
      const path = best ? [best.settlement.symbol, ...best.hops.map((h) => h.tokenOut.symbol)].join(" → ") : "";
      const note = new Notification(`${n} eligible loop${n > 1 ? "s" : ""} on Kerf`, {
        body: best ? `${path} · est. net +${(best.netResult ?? 0).toFixed(4)} ${best.settlement.symbol} · open it and re-quote now` : "Open the scanner and re-quote now.",
        tag: "kerf-eligible",
      });
      note.onclick = () => {
        window.focus();
        note.close();
      };
    }
  }, [data, on, chime]);

  return { on, toggle, permission };
}
