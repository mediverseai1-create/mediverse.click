import Link from "next/link";
import { Card } from "@/components/ui";
import { SharePie, TrendChart } from "@/components/app/charts";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { expiryBucket, inventoryHealth, itemValue, stockStatus } from "@/lib/inventory-logic";
import { dateTimeStr, label, money, num } from "@/lib/format";

type Item = { id: string; quantity: number; min_stock: number; unit_cost: number; expiration_date: string | null; inventory_categories: { name: string } | null };

export default async function OverviewPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);

  const [{ data: raw }, { count: pending }, { data: moves }, { data: trend }] = await Promise.all([
    supabase.from("inventory_items").select("id,quantity,min_stock,unit_cost,expiration_date,inventory_categories(name)").eq("organization_id", ctx.orgId).eq("is_archived", false).limit(20000),
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("organization_id", ctx.orgId).in("status", ["pending_approval", "approved", "ordered", "partially_received"]),
    supabase.from("inventory_movements").select("id,type,quantity_change,created_at,inventory_items(name)").eq("organization_id", ctx.orgId).order("created_at", { ascending: false }).limit(8),
    supabase.rpc("report_consumption", { p_org: ctx.orgId, p_from: from, p_to: to }),
  ]);
  const items = (raw ?? []) as unknown as Item[];
  const total = items.length;

  if (total === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <Card className="max-w-2xl">
          <h2 className="text-xl font-semibold">Welcome to Mediverse</h2>
          <p className="mt-2 text-slate-600">Your dashboard fills in as you add inventory. Everything shown here is calculated from your own records.</p>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li><Link href="/dashboard/inventory/new" className="font-medium text-teal-600 hover:underline">Add your first inventory item</Link>, or import a spreadsheet.</li>
            <li>Set a minimum stock level and expiry date so alerts can work.</li>
            <li>Record usage as stock is consumed. Forecasts and trends build from that history.</li>
          </ol>
        </Card>
      </div>
    );
  }

  let low = 0, out = 0, exp7 = 0, expired = 0, value = 0, units = 0;
  const cats = new Map<string, number>();
  for (const i of items) {
    value += itemValue(i.quantity, i.unit_cost); units += i.quantity;
    const s = stockStatus(i.quantity, i.min_stock);
    if (s === "out") out++; else if (s === "low") low++;
    const e = expiryBucket(i.expiration_date);
    if (i.quantity > 0 && e === "expired") expired++;
    if (i.quantity > 0 && (e === "7d" || e === "30d")) exp7++;
    const c = i.inventory_categories?.name ?? "Uncategorized";
    cats.set(c, (cats.get(c) ?? 0) + itemValue(i.quantity, i.unit_cost));
  }
  const health = inventoryHealth(total, low, out, exp7, expired);
  const tiles: [string, string, string?][] = [
    ["Total inventory items", String(total)], ["Total inventory value", money(value)], ["Low-stock products", String(low), low ? "text-amber-600" : undefined],
    ["Expiring within 30 days", String(exp7), exp7 ? "text-amber-600" : undefined], ["Out-of-stock products", String(out), out ? "text-red-600" : undefined],
    ["Pending purchase orders", String(pending ?? 0)],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([t, v, c]) => <Card key={t}><p className="text-sm text-slate-500">{t}</p><p className={`mt-1 text-3xl font-semibold ${c ?? ""}`}>{v}</p></Card>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><h2 className="mb-2 font-semibold">Consumption, last 30 days (units per day)</h2>
          <TrendChart label="Units consumed" data={((trend as { day: string; units: number }[] | null) ?? []).map((t) => ({ x: t.day.slice(5), y: Number(t.units) }))} /></Card>
        <Card><h2 className="mb-2 font-semibold">Stock value by category</h2>
          <SharePie label="Stock value by category" data={[...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name, v]) => ({ name: `${name} (${money(v)})`, value: v }))} /></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="font-semibold">Inventory health</h2>
          <p className="mt-2 text-4xl font-semibold">{health}%</p>
          <p className="mt-1 text-sm text-slate-600">Share of products with no stock, expiry or low-stock issue. {num(units)} units on hand.</p>
          <ul className="mt-3 space-y-1 text-sm"><li>Out of stock: {out}</li><li>Low stock: {low}</li><li>Expiring within 30 days: {exp7}</li><li>Expired with stock: {expired}</li></ul>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Recent inventory activity</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {(moves ?? []).length === 0 && <li className="py-3 text-slate-500">No movements recorded yet.</li>}
            {(moves ?? []).map((m) => (
              <li key={m.id} className="flex justify-between gap-3 py-2.5">
                <span>{(m.inventory_items as unknown as { name: string } | null)?.name} <span className="text-slate-500">· {label(m.type)}</span></span>
                <span className="whitespace-nowrap"><span className={m.quantity_change < 0 ? "text-red-600" : "text-teal-600"}>{m.quantity_change > 0 ? "+" : ""}{num(m.quantity_change)}</span> <span className="text-xs text-slate-500">{dateTimeStr(m.created_at)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
