"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Boxes, CalendarClock, Bell, ShoppingCart, Truck, MapPin, BarChart3, Menu, X, Lock, LineChart, Sparkles,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/inventory", label: "Inventory", icon: Boxes },
  { href: "/dashboard/expiry", label: "Expiry Tracking", icon: CalendarClock },
  { href: "/dashboard/forecasting", label: "Demand Forecasting", icon: LineChart, pro: true },
  { href: "/dashboard/alerts", label: "Stock Alerts", icon: Bell },
  { href: "/dashboard/procurement", label: "Procurement", icon: ShoppingCart, pro: true },
  { href: "/dashboard/suppliers", label: "Suppliers", icon: Truck, pro: true },
  { href: "/dashboard/locations", label: "Locations", icon: MapPin },
  { href: "/dashboard/analytics", label: "Analytics & Reports", icon: BarChart3 },
  { href: "/dashboard/assistant", label: "AI Inventory Assistant", icon: Sparkles },
];

export function Sidebar({ isPro }: { isPro: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = (
    <nav aria-label="Main" className="space-y-1">
      {NAV.map(({ href, label, icon: Icon, pro }) => {
        const active = href === "/dashboard" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded px-3 py-2 text-sm", active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white")}>
            <Icon className="h-4 w-4" aria-hidden /> <span className="flex-1">{label}</span>
            {pro && !isPro && <Lock className="h-3.5 w-3.5 opacity-70" aria-label="Professional plan" />}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <>
      <div className="flex items-center justify-between bg-navy px-4 py-3 lg:hidden">
        <Logo light />
        <button onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open} className="text-white">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <aside className={cn("bg-navy p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60 lg:shrink-0 lg:overflow-y-auto", open ? "block" : "hidden")}>
        <Logo light className="mb-6 hidden lg:inline-flex" />
        {items}
      </aside>
    </>
  );
}
