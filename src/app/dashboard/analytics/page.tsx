import Link from "next/link";
import { Download } from "lucide-react";
import { Card, Input, Button } from "@/components/ui";
import { BarsChart, TrendChart } from "@/components/app/charts";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/plan";
import { expiryBucket, itemValue, onTimeRate, stockStatus } from "@/lib/inventory-logic";
import { money, num } from "@/lib/format";

type Cat = { category: string; items: number; units: number; value: number };
type Sup = { supplier: string; orders: number; received_orders: number; on_time_orders: number; spend: number };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireOrg();
  const pro = isPro(ctx);
  const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const to = ok(sp.to) ?? new Date().toISOString().slice(0, 10);
  const from = ok(sp.from) ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const supabase = await createClient();

  const [{ data: items }, { data: cons }, { data: cats }, { data: moves }] = await Promise.all([
    supabase.from("inventory_items").select("quantity,min_stock,unit_cost,expiration_date").eq("organization_id", ctx.orgId).eq("is_archived", false).limit(50000),
    supabase.rpc("report_consumption", { p_org: ctx.orgId, p_from: from, p_to: to }),
    supabase.rpc("report_category_stock", { p_org: ctx.orgId }),
    supabase.from("inventory_movements").select("type,quantity_change,inventory_items(unit_cost)").eq("organization_id", ctx.orgId).gte("created_at", from).lte("created_at", to + "T23:59:59Z").limit(50000),
  ]);
  const it = items ?? [];
  const value = it.reduce((s, i) => s + itemValue(i.quantity, i.unit_cost), 0);
  const lowCount = it.filter((i) => stockStatus(i.quantity, i.min_stock) !== "ok").length;
  const wasted = (moves ?? []).filter((m) => m.type === "expired_writeoff").reduce((s, m) => s + Math.abs(m.quantity_change) * ((m.inventory_items as unknown as { unit_cost: number } | null)?.unit_cost ?? 0), 0);
  const expiredValue = it.filter((i) => i.quantity > 0 && expiryBucket(i.expiration_date) === "expired").reduce((s, i) => s + itemValue(i.quantity, i.unit_cost), 0);
  const consumption = (cons as { day: string; units: number; value: number }[] | null) ?? [];
  const consumedValue = consumption.reduce((s, c) => s + Number(c.value), 0);
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const turnover = value > 0 ? (consumedValue / value) * (365 / days) : null;
  const catRows = (cats as Cat[] | null) ?? [];

  let sup: Sup[] = [];
  let spend = 0;
  if (pro) {
    const [{ data: s }, { data: po }] = await Promise.all([
      supabase.rpc("report_supplier_performance", { p_org: ctx.orgId }),
      supabase.from("purchase_orders").select("status,purchase_order_items(quantity_ordered,unit_cost)").eq("organization_id", ctx.orgId).gte("created_at", from).lte("created_at", to + "T23:59:59Z").in("status", ["approved", "ordered", "partially_received", "received"]).limit(50000),
    ]);
    sup = (s as Sup[] | null) ?? [];
    spend = (po ?? []).reduce((a, o) => a + (o.purchase_order_items as { quantity_ordered: number; unit_cost: number }[]).reduce((x, l) => x + l.quantity_ordered * l.unit_cost, 0), 0);
  }
  const exp = (r: string, label: string, proOnly = false) => (proOnly && !pro) ? null : (
    <a key={r} href={`/dashboard/analytics/export?report=${r}&from=${from}&to=${to}`} className="inline-flex h-9 items-center gap-2 rounded border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50"><Download className="h-4 w-4" />{label}</a>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Analytics &amp; Reports</h1>
      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-sm">From<Input name="from" type="date" defaultValue={from} className="mt-1" /></label>
          <label className="text-sm">To<Input name="to" type="date" defaultValue={to} className="mt-1" /></label>
          <Button type="submit" variant="secondary">Apply range</Button>
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-sm text-slate-500">Inventory valuation</p><p className="mt-1 text-2xl font-semibold">{money(value)}</p></Card>
        <Card><p className="text-sm text-slate-500">Products at or below minimum</p><p className="mt-1 text-2xl font-semibold">{lowCount}</p></Card>
        <Card><p className="text-sm text-slate-500">Expired stock still on hand</p><p className="mt-1 text-2xl font-semibold">{money(expiredValue)}</p><p className="text-xs text-slate-500">Written off in range: {money(wasted)}</p></Card>
        <Card><p className="text-sm text-slate-500">Inventory turnover (annualised estimate)</p><p className="mt-1 text-2xl font-semibold">{turnover === null ? "No data" : `${turnover.toFixed(1)}×`}</p></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><h2 className="mb-2 font-semibold">Consumption trend (units per day)</h2><TrendChart label="Units consumed" data={consumption.map((c) => ({ x: c.day.slice(5), y: Number(c.units) }))} /></Card>
        <Card><h2 className="mb-2 font-semibold">Stock value by category</h2><BarsChart label="Stock value" data={catRows.slice(0, 8).map((c) => ({ x: c.category.slice(0, 12), y: Number(c.value) }))} /></Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 font-semibold">Product category analysis</h2>
        <table className="mt-3 w-full min-w-[480px] text-left text-sm">
          <thead className="border-y border-slate-200 bg-soft text-xs uppercase text-slate-500"><tr><th className="px-5 py-2">Category</th><th className="text-right">Products</th><th className="text-right">Units</th><th className="pr-5 text-right">Value</th></tr></thead>
          <tbody>{catRows.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No data yet.</td></tr>}
            {catRows.map((c) => <tr key={c.category} className="border-b border-slate-100 last:border-0"><td className="px-5 py-2.5">{c.category}</td><td className="text-right">{c.items}</td><td className="text-right">{num(c.units)}</td><td className="pr-5 text-right">{money(c.value)}</td></tr>)}</tbody>
        </table>
      </Card>

      {pro ? (
        <Card className="overflow-x-auto p-0">
          <div className="flex items-center justify-between px-5 pt-5"><h2 className="font-semibold">Supplier performance</h2><p className="text-sm text-slate-500">Procurement spend in range: <strong>{money(spend)}</strong></p></div>
          <table className="mt-3 w-full min-w-[520px] text-left text-sm">
            <thead className="border-y border-slate-200 bg-soft text-xs uppercase text-slate-500"><tr><th className="px-5 py-2">Supplier</th><th className="text-right">Orders</th><th className="text-right">Received</th><th className="text-right">On time</th><th className="pr-5 text-right">Spend</th></tr></thead>
            <tbody>{sup.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-500">No suppliers yet.</td></tr>}
              {sup.map((s) => { const r = onTimeRate(s.received_orders, s.on_time_orders); return <tr key={s.supplier} className="border-b border-slate-100 last:border-0"><td className="px-5 py-2.5">{s.supplier}</td><td className="text-right">{s.orders}</td><td className="text-right">{s.received_orders}</td><td className="text-right">{r === null ? "No data" : `${r}%`}</td><td className="pr-5 text-right">{money(s.spend)}</td></tr>; })}</tbody>
          </table>
        </Card>
      ) : (
        <Card className="bg-mint"><p className="text-sm">Supplier performance, procurement spend and advanced exports are included in the Professional plan. <Link href="/dashboard/billing" className="font-medium underline">View plans</Link></p></Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">Export CSV</h2>
        <div className="flex flex-wrap gap-2">
          {exp("valuation", "Inventory valuation")}{exp("movements", "Stock movements")}{exp("consumption", "Consumption")}
          {exp("low_stock", "Low stock")}{exp("expiry", "Expiry & wastage")}{exp("suppliers", "Supplier performance", true)}{exp("spend", "Procurement spend", true)}
        </div>
        <p className="mt-2 text-xs text-slate-500">Date range applies to movements, consumption and procurement spend.</p>
      </Card>
    </div>
  );
}
