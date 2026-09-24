import Link from "next/link";
import { BRAND } from "@/lib/brand";

// Mark: a block with a single cut through it — the kerf.
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M3 3h11.5v26H3z" fill="currentColor" />
      <path d="M17.5 3H29v26H17.5z" fill="currentColor" />
      <path d="M16 0v32" stroke="var(--signal)" strokeWidth="2" />
      <path d="M11 11h3.5M11 16h3.5M11 21h3.5" stroke="var(--paper)" strokeWidth="1.5" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label={`${BRAND.name} — home`}>
      <Mark />
      <span>{BRAND.name.toLowerCase()}</span>
    </Link>
  );
}
