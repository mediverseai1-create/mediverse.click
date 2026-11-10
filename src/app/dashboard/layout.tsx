import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui";
import { Sidebar } from "@/components/app/sidebar";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/(auth)/actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg({ allowUnpaid: true });
  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("inventory_alerts").select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.orgId).eq("is_read", false).is("resolved_at", null);

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar isPro={ctx.plan === "professional"} />
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <form action="/dashboard/inventory" role="search" className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input name="q" type="search" placeholder="Search products or SKU" aria-label="Search inventory"
              className="h-10 w-full rounded border border-slate-300 pl-9 pr-3 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal" />
          </form>
          <Link href="/dashboard/alerts" className="relative rounded p-2 hover:bg-slate-100" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
            <Bell className="h-5 w-5" />
            {!!unread && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-5 text-white">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <div className="text-right text-sm leading-tight">
            <p className="font-medium">{ctx.orgName}</p>
            <p className="text-xs capitalize text-slate-500">{ctx.fullName || ctx.email} · {ctx.role}{ctx.plan ? ` · ${ctx.plan}` : ""}</p>
          </div>
          <form action={logoutAction}><Button variant="secondary" type="submit">Sign out</Button></form>
        </header>
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
