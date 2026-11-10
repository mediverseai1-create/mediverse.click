"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";

const LINKS = [
  ["Features", "/#features"],
  ["Who it's for", "/#customers"],
  ["AI", "/#ai"],
  ["Pricing", "/#pricing"],
  ["FAQ", "/#faq"],
] as const;

export function SiteNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
      <div className="mx-auto max-w-6xl rounded-full border border-slate-200 bg-white shadow-sm">
        <div className="flex h-14 items-center justify-between pl-5 pr-2 sm:h-16 sm:pl-7">
          <Logo />
          <nav aria-label="Primary" className="hidden items-center gap-7 text-sm md:flex">
            {LINKS.map(([l, h]) => (
              <Link key={l} href={h} className="text-navy/80 hover:text-navy">{l}</Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Link href="/login" className="rounded-full px-4 py-2 text-sm font-medium hover:bg-slate-100">Log in</Link>
            <Link href="/register" className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">Get Started</Link>
          </div>
          <button className="mr-1 flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-100 md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <div className="space-y-1 border-t border-slate-100 px-4 py-3 md:hidden">
            {LINKS.map(([l, h]) => (
              <Link key={l} href={h} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50">{l}</Link>
            ))}
            <div className="flex gap-2 pt-2">
              <Link href="/login" className="flex-1 rounded-full border border-slate-300 py-2.5 text-center text-sm font-medium">Log in</Link>
              <Link href="/register" className="flex-1 rounded-full bg-navy py-2.5 text-center text-sm font-semibold text-white">Get Started</Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
