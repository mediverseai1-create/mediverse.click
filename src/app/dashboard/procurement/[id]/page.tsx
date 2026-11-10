import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Input } from "@/components/ui";
import { ActionForm } from "@/components/app/action-form";
import { UpgradeNotice } from "@/components/app/upgrade";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { canManage, isPro } from "@/lib/plan";
import { dateStr, dateTimeStr, label, money, num } from "@/lib/format";
import { receiveAction, setStatusAction } from "../actions";

type Line = { id: string; quantity_ordered: number; quantity_received: number; unit_cost: number; inventory_items: { name: string; unit: string } | null };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await requireOrg();
  if (!isPro(ctx)) return <UpgradeNotice feature="Procurement" status={ctx.subscriptionStatus} />;
  const supabase = await createClient();
  const { data: po } = await supabase.from("purchase_orders")
    .select("*, suppliers(name), locations(name), purchase_order_items(id,quantity_ordered,quantity_received,unit_cost,inventory_items(name,unit))")
    .eq("id", id).eq("organization_id", ctx.orgId).maybeSingle();
  if (!po) notFound();
  const lines = po.purchase_order_items as unknown as Line[];
  const total = lines.reduce((s, l) => s + l.quantity_ordered * l.unit_cost, 0);
  const admin = canManage(ctx);

  const next: { to: string; text: string; need?: boolean }[] = {
    draft: [{ to: "pending_approval", text: "Submit for approval" }, { to: "cancelled", text: "Cancel" }],
    pending_approval: [{ to: "approved", text: "Approve", need: true }, { to: "draft", text: "Return to draft" }, { to: "cancelled", text: "Cancel" }],
    approved: [{ to: "ordered", text: "Mark as ordered" }, { to: "cancelled", text: "Cancel" }],
    ordered: [{ to: "cancelled", text: "Cancel order" }],
  }[po.status as string] ?? [];
  const canReceive = po.status === "ordered" || po.status === "partially_received";

  return (
    <div className="space-y-5">
      <Link href="/dashboard/procurement" className="text-sm text-teal-600 hover:underline">← Procurement</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{po.po_number}</h1>
          <p className="text-sm text-slate-500">{(po.suppliers as unknown as { name: string } | null)?.name ?? "No supplier"} · created {dateTimeStr(po.created_at)}</p></div>
        <span className="rounded-full bg-mint px-3 py-1.5 text-sm font-medium">{label(po.status)}</span>
      </div>
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {next.filter((n) => !n.need || admin).map((n) => (
          <form key={n.to} action={setStatusAction.bind(null, id, n.to)}>
            <button className={`h-10 rounded px-4 text-sm font-medium ${n.to === "cancelled" ? "border border-red-300 text-red-700 hover:bg-red-50" : "bg-navy text-white hover:bg-navy-700"}`}>{n.text}</button>
          </form>
        ))}
        {po.status === "pending_approval" && !admin && <p className="self-center text-sm text-slate-500">Waiting for an owner or administrator to approve.</p>}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-soft text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Product</th><th className="text-right">Ordered</th><th className="text-right">Received</th><th className="text-right">Unit cost</th><th className="pr-5 text-right">Line total</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-3">{l.inventory_items?.name}</td><td className="text-right tabular-nums">{num(l.quantity_ordered)} {l.inventory_items?.unit}</td>
                <td className="text-right tabular-nums">{num(l.quantity_received)}</td><td className="text-right tabular-nums">{money(l.unit_cost)}</td>
                <td className="pr-5 text-right tabular-nums">{money(l.quantity_ordered * l.unit_cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={4} className="px-5 py-3 text-right font-medium">Total</td><td className="pr-5 text-right font-semibold tabular-nums">{money(total)}</td></tr></tfoot>
        </table>
      </Card>
      <p className="text-sm text-slate-500">Expected delivery: {dateStr(po.expected_delivery)}{po.received_at ? ` · Fully received ${dateTimeStr(po.received_at)}` : ""}{po.notes ? ` · ${po.notes}` : ""}</p>

      {canReceive && (
        <Card>
          <h2 className="text-lg font-semibold">Confirm received goods</h2>
          <p className="mb-3 text-sm text-slate-500">Enter the quantity physically received. Only confirmed quantities are added to stock.</p>
          <ActionForm action={receiveAction.bind(null, id)} submit="Confirm receipt">
            <div className="space-y-2">
              {lines.filter((l) => l.quantity_received < l.quantity_ordered).map((l) => (
                <label key={l.id} className="grid grid-cols-[1fr_130px] items-center gap-3 text-sm">
                  <span>{l.inventory_items?.name} <span className="text-slate-500">(outstanding {num(l.quantity_ordered - l.quantity_received)})</span></span>
                  <Input name={`recv_${l.id}`} type="number" min="0" max={l.quantity_ordered - l.quantity_received} step="any" defaultValue="0" />
                </label>
              ))}
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
