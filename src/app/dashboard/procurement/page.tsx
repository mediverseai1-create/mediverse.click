import Link from "next/link";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui";
import { UpgradeNotice } from "@/components/app/upgrade";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/plan";
import { dateStr, label, money } from "@/lib/format";

export default async function ProcurementPage() {
  const ctx = await requireOrg();
  if (!isPro(ctx)) return (<div className="space-y-4"><h1 className="text-2xl font-semibold">Procurement</h1><UpgradeNotice feature="Procurement" status={ctx.subscriptionStatus} /></div>);
  const supabase = await createClient();
  const { data: orders } = await supabase.from("purchase_orders")
    .select("id,po_number,status,is_request,expected_delivery,created_at,suppliers(name),purchase_order_items(quantity_ordered,unit_cost)")
    .eq("organization_id", ctx.orgId).order("created_at", { ascending: false }).limit(200);
  const open = (orders ?? []).filter((o) => ["pending_approval", "approved", "ordered", "partially_received"].includes(o.status)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Procurement</h1><p className="text-sm text-slate-500">{open} open order(s). Stock increases only when you confirm receipt.</p></div>
        <Link href="/dashboard/procurement/new" className="inline-flex h-10 items-center gap-2 rounded bg-teal px-4 text-sm font-medium text-white hover:bg-teal-600"><Plus className="h-4 w-4" />New order</Link>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-soft text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Number</th><th>Supplier</th><th>Status</th><th>Expected</th><th className="pr-5 text-right">Total</th></tr></thead>
          <tbody>
            {(orders ?? []).length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No purchase orders yet.</td></tr>}
            {(orders ?? []).map((o) => {
              const total = (o.purchase_order_items as { quantity_ordered: number; unit_cost: number }[]).reduce((s, l) => s + l.quantity_ordered * l.unit_cost, 0);
              return (
                <tr key={o.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 font-medium"><Link href={`/dashboard/procurement/${o.id}`} className="hover:underline">{o.po_number}</Link>{o.is_request && <span className="ml-2 text-xs text-slate-500">request</span>}</td>
                  <td>{(o.suppliers as unknown as { name: string } | null)?.name ?? "—"}</td>
                  <td><span className="rounded-full bg-soft px-2.5 py-1 text-xs font-medium">{label(o.status)}</span></td>
                  <td>{dateStr(o.expected_delivery)}</td><td className="pr-5 text-right tabular-nums">{money(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
