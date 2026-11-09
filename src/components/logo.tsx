import Link from "next/link";
import { cn } from "@/lib/utils";

/** Mediverse mark: a stacked-crate cube with a medical cross cut-out. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#101D32" />
      <path d="M16 5.5 25.5 11v10L16 26.5 6.5 21V11z" fill="none" stroke="#12A99A" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14.6 11.5h2.8v3.1h3.1v2.8h-3.1v3.1h-2.8v-3.1h-3.1v-2.8h3.1z" fill="#DDF6F0" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5", className)} aria-label="Mediverse home">
      <LogoMark />
      <span className={cn("text-lg font-semibold tracking-tight", light ? "text-white" : "text-navy")}>
        Mediverse
      </span>
    </Link>
  );
}
