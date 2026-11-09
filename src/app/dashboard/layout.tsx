import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui";
import { requireOrg } from "@/lib/org";
import { logoutAction } from "@/app/(auth)/actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-slate-200 bg-navy p-4 text-white lg:min-h-screen lg:w-60 lg:border-b-0">
        <Logo light className="mb-6" />
        <nav aria-label="Main">
          <Link href="/dashboard" className="flex items-center gap-2 rounded bg-white/10 px-3 py-2 text-sm">
            <LayoutDashboard className="h-4 w-4" /> Overview
          </Link>
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <p className="text-sm font-medium">{ctx.orgName}</p>
            <p className="text-xs text-slate-500 capitalize">{ctx.role}</p>
          </div>
          <form action={logoutAction}><Button variant="secondary" type="submit">Sign out</Button></form>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
