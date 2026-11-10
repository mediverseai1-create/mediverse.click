import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { daysUntil } from "@/lib/inventory-logic";

const dateOk = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const PRO_REPORTS = ["suppliers", "spend"];

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx || !ctx.onboardingCompleted) return new NextResponse("Unauthorized", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const report = sp.get("report") ?? "";
  const to = dateOk(sp.get("to")) ?? new Date().toISOString().slice(0, 10);
  const from = dateOk(sp.get("from")) ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  if (PRO_REPORTS.includes(report) && ctx.plan !== "professional") return new NextResponse("This report requires the Professional plan", { status: 403 });

  const supabase = await createClient();
  let headers: string[] = [], rows: unknown[][] = [];

  if (report === "valuation") {
    const { data } = await supabase.from("inventory_items").select("name,sku,unit,quantity,unit_cost,inventory_categories(name),locations(name)").eq("organization_id", ctx.orgId).eq("is_archived", false).order("name").limit(50000);
    headers = ["Product", "SKU", "Category", "Location", "Unit", "Quantity", "Unit cost", "Stock value"];
    rows = (data ?? []).map((i) => [i.name, i.sku, (i.inventory_categories as unknown as { name: string } | null)?.name, (i.locations as unknown as { name: string } | null)?.name, i.unit, i.quantity, i.unit_cost, +(i.quantity * i.unit_cost).toFixed(2)]);
  } else if (report === "low_stock") {
    const { data } = await supabase.from("inventory_items").select("name,sku,unit,quantity,min_stock,locations(name)").eq("organization_id", ctx.orgId).eq("is_archived", false).gt("min_stock", 0).order("name").limit(50000);
    headers = ["Product", "SKU", "Location", "Unit", "Quantity", "Minimum", "Shortfall"];
    rows = (data ?? []).filter((i) => i.quantity <= i.min_stock).map((i) => [i.name, i.sku, (i.locations as unknown as { name: string } | null)?.name, i.unit, i.quantity, i.min_stock, i.min_stock - i.quantity]);
  } else if (report === "expiry") {
    const { data } = await supabase.from("inventory_items").select("name,sku,quantity,unit_cost,expiration_date,batch_number,locations(name)").eq("organization_id", ctx.orgId).eq("is_archived", false).not("expiration_date", "is", null).order("expiration_date").limit(50000);
    headers = ["Product", "SKU", "Batch", "Location", "Quantity", "Expiration date", "Days until expiry", "Value at risk"];
    rows = (data ?? []).filter((i) => (daysUntil(i.expiration_date) ?? 9999) <= 90).map((i) => [i.name, i.sku, i.batch_number, (i.locations as unknown as { name: string } | null)?.name, i.quantity, i.expiration_date, daysUntil(i.expiration_date), +(i.quantity * i.unit_cost).toFixed(2)]);
  } else if (report === "movements") {
    const { data } = await supabase.from("inventory_movements").select("created_at,type,quantity_change,quantity_after,reason,inventory_items(name,sku)").eq("organization_id", ctx.orgId).gte("created_at", from).lte("created_at", to + "T23:59:59Z").order("created_at", { ascending: false }).limit(50000);
    headers = ["Date", "Product", "SKU", "Type", "Change", "Quantity after", "Reason"];
    rows = (data ?? []).map((m) => { const it = m.inventory_items as unknown as { name: string; sku: string } | null; return [m.created_at, it?.name, it?.sku, m.type, m.quantity_change, m.quantity_after, m.reason]; });
  } else if (report === "consumption") {
    const { data } = await supabase.rpc("report_consumption", { p_org: ctx.orgId, p_from: from, p_to: to });
    headers = ["Day", "Units consumed", "Value at cost"];
    rows = ((data as { day: string; units: number; value: number }[] | null) ?? []).map((r) => [r.day, r.units, r.value]);
  } else if (report === "suppliers") {
    const { data } = await supabase.rpc("report_supplier_performance", { p_org: ctx.orgId });
    headers = ["Supplier", "Orders placed", "Fully received", "Received on time", "Spend"];
    rows = ((data as { supplier: string; orders: number; received_orders: number; on_time_orders: number; spend: number }[] | null) ?? []).map((r) => [r.supplier, r.orders, r.received_orders, r.on_time_orders, r.spend]);
  } else if (report === "spend") {
    const { data } = await supabase.from("purchase_orders").select("po_number,status,created_at,suppliers(name),purchase_order_items(quantity_ordered,quantity_received,unit_cost)").eq("organization_id", ctx.orgId).gte("created_at", from).lte("created_at", to + "T23:59:59Z").order("created_at", { ascending: false }).limit(50000);
    headers = ["Order", "Supplier", "Status", "Created", "Ordered value", "Received value"];
    rows = (data ?? []).map((o) => { const l = o.purchase_order_items as { quantity_ordered: number; quantity_received: number; unit_cost: number }[]; return [o.po_number, (o.suppliers as unknown as { name: string } | null)?.name, o.status, o.created_at, +l.reduce((s, x) => s + x.quantity_ordered * x.unit_cost, 0).toFixed(2), +l.reduce((s, x) => s + x.quantity_received * x.unit_cost, 0).toFixed(2)]; });
  } else {
    return new NextResponse("Unknown report", { status: 400 });
  }

  await supabase.from("audit_logs").insert({ organization_id: ctx.orgId, user_id: ctx.userId, action: "report.exported", entity_type: "report", details: { report, from, to } });
  return new NextResponse(toCsv(headers, rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="mediverse-${report}-${to}.csv"`, "Cache-Control": "no-store" },
  });
}
