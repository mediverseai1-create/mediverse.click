import Link from "next/link";
import { Card, Select, Button } from "@/components/ui";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/lookups";
import { daysUntil, expiryBucket, itemValue, type ExpiryBucket } from "@/lib/inventory-logic";
import { dateStr, money, num } from "@/lib/format";

const BUCKETS: [ExpiryBucket, string, string][] = [
  ["expired", "Expired", "bg-red-50 text-red-700"],
  ["7d", "Within 7 days", "bg-orange-50 text-orange-700"],
  ["30d", "Within 30 days", "bg-amber-50 text-amber-800"],
  ["90d", "Within 90 days", "bg-mint text-navy"],
];

export default async function ExpiryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireOrg();
  const supabase = await createClient();
  const lk = await getLookups(ctx.orgId);

  let q = supabase.from("inventory_items")
    .select("id,name,sku,unit,quantity,unit_cost,expiration_date,inventory_categories(name),locations(name)")
    .eq("organization_id", ctx.orgId).eq("is_archived", false).not("expiration_date", "is", null).gt("quantity", 0);
  if (sp.category) q = q.eq("category_id", sp.category);
  if (sp.location) q = q.eq("location_id", sp.location);
  const { data: items } = await q.order("expiration_date").limit(2000);
  const rows = (items ?? []).map((i) => ({ ...i, bucket: expiryBucket(i.expiration_date), days: daysUntil(i.expiration_date) }));
  const counts = Object.fromEntries(BUCKETS.map(([b]) => [b, rows.filter((r) => r.bucket === b)]));
  const period = (sp.period as ExpiryBucket | undefined) ?? "";
  const shown = rows.filter((r) => (period ? (period === "90d" ? ["expired", "7d", "30d", "90d"] : period === "30d" ? ["expired", "7d", "30d"] : period === "7d" ? ["expired", "7d"] : ["expired"]).includes(r.bucket) : r.bucket !== "later"));

  const { data: batches } = await supabase.from("inventory_batches")
    .select("id,batch_number,expiration_date,quantity,item_id,inventory_items(name)")
    .eq("organization_id", ctx.orgId).not("expiration_date", "is", null).gt("quantity", 0).order("expiration_date").limit(200);
  const batchRows = (batches ?? []).filter((b) => expiryBucket(b.expiration_date) !== "later");
  const atRisk = shown.reduce((s, r) => s + itemValue(r.quantity, r.unit_cost), 0);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Expiry Tracking</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BUCKETS.map(([b, l, cls]) => (
          <Link key={b} href={`/dashboard/expiry?period=${b}`} className={`rounded-lg border border-slate-200 p-5 ${cls}`}>
            <p className="text-sm">{l}</p><p className="mt-1 text-3xl font-semibold">{counts[b].length}</p>
            <p className="text-xs opacity-80">{money(counts[b].reduce((s, r) => s + itemValue(r.quantity, r.unit_cost), 0))} in stock</p>
          </Link>
        ))}
      </div>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-4">
          <Select name="period" defaultValue={period} aria-label="Period"><option value="">All expiring (90 days) and expired</option><option value="expired">Expired only</option><option value="7d">Within 7 days</option><option value="30d">Within 30 days</option><option value="90d">Within 90 days</option></Select>
          <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category"><option value="">All categories</option>{lk.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select name="location" defaultValue={sp.location ?? ""} aria-label="Location"><option value="">All locations</option>{lk.locations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Button type="submit" variant="secondary">Filter</Button>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="flex items-center justify-between px-5 pt-5"><h2 className="text-lg font-semibold">Products</h2><p className="text-sm text-slate-500">Value at risk: <strong>{money(atRisk)}</strong></p></div>
        <table className="mt-3 w-full min-w-[640px] text-left text-sm">
          <thead className="border-y border-slate-200 bg-soft text-xs uppercase text-slate-500"><tr><th className="px-5 py-2">Product</th><th>Location</th><th className="text-right">Quantity</th><th className="text-right">Value</th><th>Expires</th><th className="pr-5">Status</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No products match. Items need an expiration date to appear here.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-3 font-medium"><Link href={`/dashboard/inventory/${r.id}`} className="hover:underline">{r.name}</Link></td>
                <td className="text-slate-600">{(r.locations as unknown as { name: string } | null)?.name ?? "—"}</td>
                <td className="text-right tabular-nums">{num(r.quantity)} {r.unit}</td><td className="text-right tabular-nums">{money(itemValue(r.quantity, r.unit_cost))}</td>
                <td>{dateStr(r.expiration_date)}</td>
                <td className={`pr-5 ${r.bucket === "expired" ? "font-medium text-red-600" : "text-slate-600"}`}>{r.days! < 0 ? `Expired ${-r.days!} day(s) ago` : `${r.days} day(s) left`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-5 pt-5 text-lg font-semibold">Batch-level expiry</h2>
        <table className="mt-3 w-full min-w-[520px] text-left text-sm">
          <thead className="border-y border-slate-200 bg-soft text-xs uppercase text-slate-500"><tr><th className="px-5 py-2">Product</th><th>Batch</th><th className="text-right">Quantity</th><th className="pr-5">Expires</th></tr></thead>
          <tbody>
            {batchRows.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No batches expiring within 90 days.</td></tr>}
            {batchRows.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-2.5"><Link href={`/dashboard/inventory/${b.item_id}`} className="hover:underline">{(b.inventory_items as unknown as { name: string } | null)?.name}</Link></td>
                <td>{b.batch_number}</td><td className="text-right tabular-nums">{num(b.quantity)}</td><td className="pr-5">{dateStr(b.expiration_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
