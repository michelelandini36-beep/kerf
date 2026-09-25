import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Kerf — measure the gap, cut it clean";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const poster = await readFile(join(process.cwd(), "public/media/hero-poster.jpg"));
  const bg = `data:image/jpeg;base64,${poster.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", background: "#000", color: "#fff", position: "relative" }}>
        <img src={bg} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 44, left: 56, display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600 }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="#fff">
            <path d="M3 3h9.4l-3 18H3z" />
            <path d="M14.6 3H21v18h-9.4z" />
          </svg>
          <span style={{ display: "flex" }}>
            Kerf<span style={{ color: "#9a9a9a", fontWeight: 400 }}>.world</span>
          </span>
        </div>
        <div style={{ display: "flex", padding: "10px 18px", borderRadius: 6, background: "linear-gradient(90deg, #7d7d7d, #2a2a2a 52%, #0a0a0a)", fontSize: 22, marginBottom: 26 }}>
          Tokenized-equity arbitrage · Robinhood Chain
        </div>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05 }}>Measure the gap.</div>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05, marginBottom: 70 }}>Cut it clean.</div>
      </div>
    ),
    size,
  );
}
