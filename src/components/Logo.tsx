import Link from "next/link";

// Mark: a block with one clean diagonal cut through it — the kerf.
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 3h9.4l-3 18H3z" />
      <path d="M14.6 3H21v18h-9.4z" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="logo" aria-label="Kerf — home">
      <Mark />
      <span>
        Kerf<span className="logo-suffix">.world</span>
      </span>
    </Link>
  );
}
