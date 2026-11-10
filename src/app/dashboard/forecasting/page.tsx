import Link from "next/link";
import { Card } from "@/components/ui";
import { UpgradeNotice } from "@/components/app/upgrade";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/plan";
import { forecastItem, type Confidence, type Risk } from "@/lib/forecast";
import { num } from "@/lib/format";

type Stat = { item_id: string; consumed: number; consumed_first_half: number; consumed_second_half: number; first_consumption: string; events: number };

const CONF: Record<Confidence, string> = { insufficient: "bg-slate-100 text-slate-600", low: "bg-amber-100 text-amber-800", medium: "bg-sky-100 text-sky-800", high: "bg-mint text-navy" };
const RISK: Record<Risk, string> = { high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-800", low: "bg-mint text-navy", unknown: "bg-slate-100 text-slate-600" };

export default async function ForecastingPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireOrg();
  if (!isPro(ctx)) return (<div className="space-y-4"><h1 className="text-2xl font-semibold">Demand Forecasting</h1><UpgradeNotice feature="Demand forecasting" status={ctx.subscriptionStatus} /></div>);
  const lead = Math.min(120, Math.max(1, Number(sp.lead) || 14));
  const supabase = await createClient();
  const [{ data: items }, { data: stats }] = await Promise.all([
    supabase.from("inventory_items").select("id,name,sku,unit,quantity,min_stock").eq("organization_id", ctx.orgId).eq("is_archived", false).order("name").limit(5000),
    supabase.rpc("item_consumption_stats", { p_org: ctx.orgId, p_days: 90 }),
  ]);
  const sm = new Map(((stats as Stat[] | null) ?? []).map((s) => [s.item_id, s]));
  const rows = (items ?? []).map((i) => {
    const s = sm.get(i.id);
    const f = forecastItem(i.quantity, s ? { consumed: Number(s.consumed), firstHalf: Number(s.consumed_first_half), secondHalf: Number(s.consumed_second_half), firstConsumption: s.first_consumption, events: s.events } : null, { leadTimeDays: lead });
    return { ...i, f };
  });
  const order = { high: 0, medium: 1, low: 2, unknown: 3 } as const;
  rows.sort((a, b) => order[a.f.stockoutRisk] - order[b.f.stockoutRisk] || (a.f.daysRemaining ?? 1e9) - (b.f.daysRemaining ?? 1e9));
  const forecastable = rows.filter((r) => r.f.confidence !== "insufficient").length;
  const toOrder = rows.filter((r) => (r.f.recommendedReorder ?? 0) > 0);
  const orderLink = toOrder.length ? `/dashboard/procurement/new?items=${toOrder.slice(0, 25).map((r) => `${r.id}:${r.f.recommendedReorder}`).join(",")}` : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Demand Forecasting</h1>
          <p className="max-w-2xl text-sm text-slate-600">Estimates calculated from your recorded consumption over the last 90 days. Quantity on hand is a confirmed figure. Everything else on this page is an estimate.</p></div>
        <form className="flex items-end gap-2 text-sm"><label>Supplier lead time (days)<input name="lead" type="number" min="1" max="120" defaultValue={lead} className="mt-1 block h-10 w-28 rounded border border-slate-300 px-3" /></label>
          <button className="h-10 rounded border border-slate-300 bg-white px-4 font-medium">Recalculate</button></form>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-slate-500">Products with enough history</p><p className="mt-1 text-3xl font-semibold">{forecastable} <span className="text-base font-normal text-slate-400">of {rows.length}</span></p></Card>
        <Card><p className="text-sm text-slate-500">High stockout risk (estimate)</p><p className="mt-1 text-3xl font-semibold text-red-600">{rows.filter((r) => r.f.stockoutRisk === "high").length}</p></Card>
        <Card><p className="text-sm text-slate-500">Products to reorder (estimate)</p><p className="mt-1 text-3xl font-semibold">{toOrder.length}</p>
          {orderLink && <Link href={orderLink} className="mt-1 inline-block text-sm font-medium text-teal-600 hover:underline">Create a purchase order from these</Link>}</Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-soft text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Product</th><th className="text-right">On hand (confirmed)</th><th className="text-right">Avg daily use</th><th className="text-right">Trend</th><th className="text-right">Days left (est.)</th><th className="text-right">Next 30 days (est.)</th><th className="text-right">Reorder qty (est.)</th><th>Risk</th><th className="pr-4">Data quality</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Add inventory and record usage to see forecasts.</td></tr>}
            {rows.map(({ id, name, unit, quantity, f }) => (
              <tr key={id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium"><Link href={`/dashboard/inventory/${id}`} className="hover:underline">{name}</Link></td>
                <td className="text-right tabular-nums">{num(quantity)} {unit}</td>
                {f.confidence === "insufficient"
                  ? <td colSpan={5} className="px-2 text-center text-slate-500">{f.note}</td>
                  : (<>
                    <td className="text-right tabular-nums">{num(f.avgDailyUsage)}</td>
                    <td className={`text-right tabular-nums ${f.trendPct !== null && f.trendPct > 25 ? "text-amber-700" : ""}`}>{f.trendPct === null ? "n/a" : `${f.trendPct > 0 ? "+" : ""}${f.trendPct}%`}</td>
                    <td className="text-right tabular-nums">{f.daysRemaining === null ? "—" : `~${num(f.daysRemaining)}`}</td>
                    <td className="text-right tabular-nums">~{num(f.forecast30d)}</td>
                    <td className="text-right tabular-nums font-medium">{f.recommendedReorder ? `~${num(f.recommendedReorder)}` : "None"}</td>
                  </>)}
                <td><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${RISK[f.stockoutRisk]}`}>{f.stockoutRisk === "unknown" ? "Unknown" : f.stockoutRisk}</span></td>
                <td className="pr-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CONF[f.confidence]}`}>{f.confidence}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="text-sm text-slate-600">
        <h2 className="mb-1 font-semibold text-navy">How these estimates work</h2>
        <p>Average daily use is units consumed divided by days of history. When there are at least 28 days of history, the trend compares the newer half of the window with the older half, and the newer rate is used for projections. Days left is quantity on hand divided by daily use. The reorder quantity covers your lead time ({lead} days) plus 30 days of demand, minus what you already hold. Products with fewer than 14 days of history or 3 usage records are not forecast.</p>
      </Card>
    </div>
  );
}
