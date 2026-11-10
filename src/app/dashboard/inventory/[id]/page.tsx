import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Field, Input, Select } from "@/components/ui";
import { ActionForm } from "@/components/app/action-form";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, itemValue, stockStatus } from "@/lib/inventory-logic";
import { dateStr, dateTimeStr, label, money, num } from "@/lib/format";
import { addBatchAction, archiveItemAction, stockMovementAction } from "../actions";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data: item } = await supabase.from("inventory_items")
    .select("*, inventory_categories(name), locations(name), suppliers(name)")
    .eq("id", id).eq("organization_id", ctx.orgId).maybeSingle();
  if (!item) notFound();
  const [{ data: moves }, { data: batches }] = await Promise.all([
    supabase.from("inventory_movements").select("id,type,quantity_change,quantity_after,reason,created_at").eq("item_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("inventory_batches").select("id,batch_number,expiration_date,quantity").eq("item_id", id).order("expiration_date", { nullsFirst: false }),
  ]);
  const st = stockStatus(item.quantity, item.min_stock);
  const d = daysUntil(item.expiration_date);
  const rel = (k: "inventory_categories" | "locations" | "suppliers") => (item[k] as { name: string } | null)?.name ?? "—";

  return (
    <div className="space-y-6">
      <Link href="/dashboard/inventory" className="text-sm text-teal-600 hover:underline">← Inventory</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{item.name}</h1>
          <p className="text-sm text-slate-500">{item.sku ? `SKU ${item.sku} · ` : ""}{rel("inventory_categories")}{item.is_archived ? " · Archived" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/inventory/${id}/edit`} className="inline-flex h-10 items-center rounded border border-slate-300 bg-white px-4 text-sm font-medium">Edit</Link>
          <form action={archiveItemAction.bind(null, id, !item.is_archived)}>
            <button className="h-10 rounded border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">{item.is_archived ? "Restore" : "Archive"}</button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-sm text-slate-500">Quantity</p><p className="mt-1 text-3xl font-semibold">{num(item.quantity)} <span className="text-base font-normal text-slate-400">{item.unit}</span></p>
          <p className={`mt-1 text-xs ${st === "ok" ? "text-slate-500" : "font-medium text-red-600"}`}>{st === "out" ? "Out of stock" : st === "low" ? `Low (minimum ${num(item.min_stock)})` : `Minimum ${num(item.min_stock)}`}</p></Card>
        <Card><p className="text-sm text-slate-500">Stock value</p><p className="mt-1 text-3xl font-semibold">{money(itemValue(item.quantity, item.unit_cost))}</p><p className="mt-1 text-xs text-slate-500">at {money(item.unit_cost)} each</p></Card>
        <Card><p className="text-sm text-slate-500">Expiry</p><p className="mt-1 text-3xl font-semibold">{dateStr(item.expiration_date)}</p>
          <p className="mt-1 text-xs text-slate-500">{d === null ? "No expiry set" : d < 0 ? `Expired ${-d} day(s) ago` : `${d} day(s) left`}</p></Card>
        <Card><p className="text-sm text-slate-500">Where</p><p className="mt-1 font-medium">{rel("locations")}</p><p className="text-xs text-slate-500">Supplier: {rel("suppliers")}{item.batch_number ? ` · Batch ${item.batch_number}` : ""}</p></Card>
      </div>

      {!item.is_archived && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Record a stock movement</h2>
          <ActionForm action={stockMovementAction.bind(null, id)} submit="Record movement" className="grid items-end gap-4 sm:grid-cols-4">
            <Field label="Type">
              <Select name="type" defaultValue="consumption">
                <option value="consumption">Consumption / usage</option><option value="purchase_receipt">Stock received</option>
                <option value="adjustment_in">Adjustment: add</option><option value="adjustment_out">Adjustment: remove</option>
                <option value="expired_writeoff">Expired write-off</option>
              </Select>
            </Field>
            <Field label="Quantity"><Input name="quantity" type="number" min="0" step="any" required /></Field>
            <div className="sm:col-span-2"><Field label="Reason (required for adjustments)"><Input name="reason" /></Field></div>
          </ActionForm>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-x-auto p-0">
          <h2 className="px-5 pt-5 text-lg font-semibold">Movement history</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-y border-slate-200 bg-soft text-xs uppercase text-slate-500"><tr><th className="px-5 py-2">When</th><th>Type</th><th className="text-right">Change</th><th className="text-right">After</th><th className="pr-5">Reason</th></tr></thead>
            <tbody>
              {(moves ?? []).length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-500">No movements yet.</td></tr>}
              {(moves ?? []).map((m) => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-2.5 text-slate-600">{dateTimeStr(m.created_at)}</td><td>{label(m.type)}</td>
                  <td className={`text-right tabular-nums ${m.quantity_change < 0 ? "text-red-600" : "text-teal-600"}`}>{m.quantity_change > 0 ? "+" : ""}{num(m.quantity_change)}</td>
                  <td className="text-right tabular-nums">{num(m.quantity_after)}</td><td className="pr-5 text-slate-600">{m.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Batches</h2>
          <p className="mb-3 text-sm text-slate-500">Batch records track expiry by lot. They do not change the stock quantity above.</p>
          <ul className="mb-4 divide-y divide-slate-100 text-sm">
            {(batches ?? []).length === 0 && <li className="py-3 text-slate-500">No batch records.</li>}
            {(batches ?? []).map((b) => (
              <li key={b.id} className="flex justify-between py-2"><span>{b.batch_number}</span><span className="text-slate-600">{num(b.quantity)} · expires {dateStr(b.expiration_date)}</span></li>
            ))}
          </ul>
          <ActionForm action={addBatchAction.bind(null, id)} submit="Add batch" className="grid items-end gap-3 sm:grid-cols-3">
            <Field label="Batch no."><Input name="batchNumber" required /></Field>
            <Field label="Expiry"><Input name="expirationDate" type="date" /></Field>
            <Field label="Quantity"><Input name="quantity" type="number" min="0" step="any" defaultValue="0" /></Field>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
