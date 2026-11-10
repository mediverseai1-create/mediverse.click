import Link from "next/link";
import { Card } from "@/components/ui";
import { UpgradeNotice } from "@/components/app/upgrade";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/lookups";
import { isPro } from "@/lib/plan";
import { OrderForm } from "../order-form";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ items?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireOrg();
  if (!isPro(ctx)) return <UpgradeNotice feature="Procurement" status={ctx.subscriptionStatus} />;
  const supabase = await createClient();
  const lk = await getLookups(ctx.orgId);
  const { data: items } = await supabase.from("inventory_items").select("id,name,unit_cost").eq("organization_id", ctx.orgId).eq("is_archived", false).order("name").limit(2000);
  const suggested = (sp.items ?? "").split(",").map((p) => p.split(":")).filter((p) => p[0] && Number(p[1]) > 0).map((p) => ({ id: p[0], qty: Number(p[1]) }));
  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/dashboard/procurement" className="text-sm text-teal-600 hover:underline">← Procurement</Link>
      <h1 className="text-2xl font-semibold">New purchase order</h1>
      <p className="text-sm text-slate-500">Creating an order does not change your stock. Stock increases only when you confirm receipt.</p>
      <Card><OrderForm items={items ?? []} suppliers={lk.suppliers} locations={lk.locations} suggested={suggested} /></Card>
    </div>
  );
}
