import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, Input, Select, Button } from "@/components/ui";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/lookups";
import { expiryBucket, itemValue, stockStatus } from "@/lib/inventory-logic";
import { dateStr, money, num } from "@/lib/format";

const PAGE = 25;
const SORTS: Record<string, string> = { name: "name", quantity: "quantity", cost: "unit_cost", expiry: "expiration_date", added: "created_at" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireOrg();
  const supabase = await createClient();
  const lk = await getLookups(ctx.orgId);
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = SORTS[sp.sort ?? ""] ?? "name";
  const dir = sp.dir === "desc";

  let q = supabase.from("inventory_items")
    .select("id,name,sku,unit,quantity,min_stock,unit_cost,expiration_date,is_archived,inventory_categories(name),locations(name),suppliers(name)", { count: "exact" })
    .eq("organization_id", ctx.orgId).eq("is_archived", sp.archived === "1");
  if (sp.q) {
    const term = sp.q.replace(/[%,()]/g, " ").trim();
    if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }
  if (sp.category) q = q.eq("category_id", sp.category);
  if (sp.location) q = q.eq("location_id", sp.location);
  if (sp.supplier) q = q.eq("supplier_id", sp.supplier);
  if (sp.status === "out") q = q.lte("quantity", 0);
  const { data: items, count } = await q.order(sort, { ascending: !dir, nullsFirst: false }).range((page - 1) * PAGE, page * PAGE - 1);

  // "low" cannot be expressed as a column comparison in the query builder; filter the current page.
  const rows = (items ?? []).filter((i) => (sp.status === "low" ? stockStatus(i.quantity, i.min_stock) === "low" : true));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v) as [string, string][]);
    return `/dashboard/inventory?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{sp.archived === "1" ? "Archived inventory" : "Inventory"}</h1>
        <div className="flex gap-2">
          <Link href={sp.archived === "1" ? "/dashboard/inventory" : "/dashboard/inventory?archived=1"} className="inline-flex h-10 items-center rounded border border-slate-300 bg-white px-4 text-sm font-medium">
            {sp.archived === "1" ? "Active items" : "Archived"}
          </Link>
          <Link href="/dashboard/inventory/new" className="inline-flex h-10 items-center gap-2 rounded bg-teal px-4 text-sm font-medium text-white hover:bg-teal-600"><Plus className="h-4 w-4" />Add item</Link>
        </div>
      </div>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" role="search">
          {sp.archived && <input type="hidden" name="archived" value={sp.archived} />}
          <Input name="q" placeholder="Search name or SKU" defaultValue={sp.q} className="lg:col-span-2" aria-label="Search" />
          <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category"><option value="">All categories</option>{lk.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select name="location" defaultValue={sp.location ?? ""} aria-label="Location"><option value="">All locations</option>{lk.locations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select name="status" defaultValue={sp.status ?? ""} aria-label="Stock status"><option value="">Any stock level</option><option value="low">Low stock</option><option value="out">Out of stock</option></Select>
          <Select name="sort" defaultValue={`${sp.sort ?? "name"}`} aria-label="Sort by">
            <option value="name">Sort: name</option><option value="quantity">Sort: quantity</option><option value="cost">Sort: unit cost</option><option value="expiry">Sort: expiry</option><option value="added">Sort: date added</option>
          </Select>
          <Select name="dir" defaultValue={sp.dir ?? "asc"} aria-label="Direction"><option value="asc">Ascending</option><option value="desc">Descending</option></Select>
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-soft text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Product</th><th>SKU</th><th>Category</th><th>Location</th><th className="text-right">Quantity</th><th className="text-right">Value</th><th>Expiry</th><th className="pr-4">Status</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                {count === 0 && !sp.q ? "No inventory items yet. Add your first item or import a spreadsheet." : "No items match your filters."}
              </td></tr>
            )}
            {rows.map((i) => {
              const st = stockStatus(i.quantity, i.min_stock);
              const eb = expiryBucket(i.expiration_date);
              const cat = (i.inventory_categories as unknown as { name: string } | null)?.name;
              const loc = (i.locations as unknown as { name: string } | null)?.name;
              return (
                <tr key={i.id} className="border-b border-slate-100 last:border-0 hover:bg-soft/60">
                  <td className="px-4 py-3 font-medium"><Link href={`/dashboard/inventory/${i.id}`} className="text-navy hover:underline">{i.name}</Link></td>
                  <td className="text-slate-600">{i.sku ?? "—"}</td><td className="text-slate-600">{cat ?? "—"}</td><td className="text-slate-600">{loc ?? "—"}</td>
                  <td className="text-right tabular-nums">{num(i.quantity)} <span className="text-slate-400">{i.unit}</span></td>
                  <td className="text-right tabular-nums">{money(itemValue(i.quantity, i.unit_cost))}</td>
                  <td className={eb === "expired" ? "text-red-600" : eb === "7d" || eb === "30d" ? "text-amber-600" : "text-slate-600"}>{dateStr(i.expiration_date)}</td>
                  <td className="pr-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st === "out" ? "bg-red-100 text-red-700" : st === "low" ? "bg-amber-100 text-amber-800" : "bg-mint text-navy"}`}>{st === "out" ? "Out of stock" : st === "low" ? "Low stock" : "In stock"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{count ?? 0} item(s)</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="rounded border border-slate-300 bg-white px-3 py-1.5" href={qs({ page: String(page - 1) })}>Previous</Link>}
          <span className="px-2 py-1.5">Page {page} of {pages}</span>
          {page < pages && <Link className="rounded border border-slate-300 bg-white px-3 py-1.5" href={qs({ page: String(page + 1) })}>Next</Link>}
        </div>
      </div>
    </div>
  );
}
