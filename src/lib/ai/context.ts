import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { daysUntil, expiryBucket, itemValue, stockStatus } from "@/lib/inventory-logic";
import { forecastItem } from "@/lib/forecast";

export type Topic = "stock" | "expiry" | "consumption" | "spend" | "suppliers";

/** Picks which data sections a question needs, so only relevant, summarized data leaves our servers. */
export function topicsFor(question: string): Topic[] {
  const q = question.toLowerCase();
  const t = new Set<Topic>();
  if (/(run out|stock ?out|low|reorder|order|shortage|out of stock|replenish|days of|forecast)/.test(q)) t.add("stock");
  if (/(expir|shelf|waste|wastage|date)/.test(q)) t.add("expiry");
  if (/(consum|usage|used|demand|trend|high|unusual|change)/.test(q)) t.add("consumption");
  if (/(value|spend|expenditure|categor|cost|worth)/.test(q)) t.add("spend");
  if (/(supplier|deliver|vendor|on.?time)/.test(q)) t.add("suppliers");
  return t.size ? [...t] : ["stock", "expiry", "consumption", "spend"];
}

type Item = { id: string; name: string; unit: string; quantity: number; min_stock: number; unit_cost: number; expiration_date: string | null };
type Stat = { item_id: string; consumed: number; consumed_first_half: number; consumed_second_half: number; first_consumption: string; events: number };

export type AiContext = { sections: Record<string, unknown>; facts: Record<string, unknown> };

export async function buildContext(supabase: SupabaseClient, orgId: string, topics: Topic[], isPro: boolean): Promise<AiContext> {
  const { data: raw } = await supabase.from("inventory_items").select("id,name,unit,quantity,min_stock,unit_cost,expiration_date").eq("organization_id", orgId).eq("is_archived", false).limit(20000);
  const items = (raw ?? []) as Item[];
  const names = new Map(items.map((i) => [i.id, i]));

  let value = 0, low = 0, out = 0, expired = 0, exp30 = 0;
  for (const i of items) {
    value += itemValue(i.quantity, i.unit_cost);
    const s = stockStatus(i.quantity, i.min_stock);
    if (s === "out") out++; else if (s === "low") low++;
    const b = expiryBucket(i.expiration_date);
    if (i.quantity > 0 && b === "expired") expired++;
    if (i.quantity > 0 && (b === "7d" || b === "30d")) exp30++;
  }
  const sections: Record<string, unknown> = {
    summary: { as_of: new Date().toISOString().slice(0, 10), active_products: items.length, total_stock_value: Math.round(value * 100) / 100, low_stock_products: low, out_of_stock_products: out, expired_products_with_stock: expired, expiring_within_30_days: exp30, note: "These are confirmed figures from recorded inventory." },
  };

  if (topics.includes("stock")) {
    sections.low_or_out_of_stock = items.filter((i) => stockStatus(i.quantity, i.min_stock) !== "ok").sort((a, b) => a.quantity - b.quantity).slice(0, 15)
      .map((i) => ({ product: i.name, on_hand: i.quantity, minimum: i.min_stock, unit: i.unit }));
  }
  if (topics.includes("expiry")) {
    sections.expiring_or_expired = items.filter((i) => i.quantity > 0 && ["expired", "7d", "30d", "90d"].includes(expiryBucket(i.expiration_date)))
      .sort((a, b) => (a.expiration_date! < b.expiration_date! ? -1 : 1)).slice(0, 15)
      .map((i) => ({ product: i.name, quantity: i.quantity, expires: i.expiration_date, days_left: daysUntil(i.expiration_date), value_at_cost: itemValue(i.quantity, i.unit_cost) }));
  }

  const needStats = topics.includes("consumption") || (topics.includes("stock") && isPro);
  if (needStats) {
    const { data: stats } = await supabase.rpc("item_consumption_stats", { p_org: orgId, p_days: 90 });
    const st = (stats as Stat[] | null) ?? [];
    if (topics.includes("consumption")) {
      sections.highest_consumption_90d = [...st].sort((a, b) => Number(b.consumed) - Number(a.consumed)).slice(0, 10)
        .map((s) => ({ product: names.get(s.item_id)?.name, units_consumed_90d: Number(s.consumed), older_45d: Number(s.consumed_first_half), newer_45d: Number(s.consumed_second_half) }));
      const now = new Date(), d = (n: number) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
      const [{ data: cur }, { data: prev }] = await Promise.all([
        supabase.rpc("report_consumption", { p_org: orgId, p_from: d(29), p_to: d(0) }),
        supabase.rpc("report_consumption", { p_org: orgId, p_from: d(59), p_to: d(30) }),
      ]);
      const sum = (r: { units: number; value: number }[] | null, k: "units" | "value") => Math.round((r ?? []).reduce((a, x) => a + Number(x[k]), 0) * 100) / 100;
      sections.consumption_change = { last_30_days_units: sum(cur, "units"), previous_30_days_units: sum(prev, "units"), last_30_days_value: sum(cur, "value"), previous_30_days_value: sum(prev, "value") };
      const { data: alerts } = await supabase.from("inventory_alerts").select("message").eq("organization_id", orgId).eq("type", "unusual_consumption").is("resolved_at", null).limit(10);
      sections.unusual_consumption_alerts = (alerts ?? []).map((a) => a.message);
    }
    if (topics.includes("stock") && isPro) {
      sections.forecast_estimates = items.map((i) => {
        const s = st.find((x) => x.item_id === i.id);
        const f = forecastItem(i.quantity, s ? { consumed: Number(s.consumed), firstHalf: Number(s.consumed_first_half), secondHalf: Number(s.consumed_second_half), firstConsumption: s.first_consumption, events: s.events } : null);
        return { product: i.name, on_hand: i.quantity, ...f };
      }).filter((f) => f.confidence !== "insufficient" && f.stockoutRisk !== "low").sort((a, b) => (a.daysRemaining ?? 1e9) - (b.daysRemaining ?? 1e9)).slice(0, 12)
        .map((f) => ({ product: f.product, on_hand: f.on_hand, estimated_days_left: f.daysRemaining, estimated_daily_use: f.avgDailyUsage, suggested_reorder_qty: f.recommendedReorder, stockout_risk: f.stockoutRisk, data_quality: f.confidence }));
      sections.forecast_note = "Forecast values are ESTIMATES from recorded usage, not confirmed figures.";
    }
  }
  if (topics.includes("spend")) {
    const { data: cats } = await supabase.rpc("report_category_stock", { p_org: orgId });
    sections.stock_value_by_category = ((cats as { category: string; items: number; value: number }[] | null) ?? []).slice(0, 10).map((c) => ({ category: c.category, products: Number(c.items), value: Number(c.value) }));
  }
  if (topics.includes("suppliers") && isPro) {
    const { data: sup } = await supabase.rpc("report_supplier_performance", { p_org: orgId });
    sections.supplier_performance = ((sup as { supplier: string; orders: number; received_orders: number; on_time_orders: number; spend: number }[] | null) ?? []).slice(0, 10)
      .map((s) => ({ supplier: s.supplier, orders: Number(s.orders), fully_received: Number(s.received_orders), received_on_time: Number(s.on_time_orders), spend: Number(s.spend) }));
  } else if (topics.includes("suppliers")) {
    sections.supplier_performance = "Supplier performance is available on the Professional plan.";
  }
  return { sections, facts: sections };
}
