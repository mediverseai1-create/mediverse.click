import { Card, Field, Input, Select } from "@/components/ui";
import { ActionForm } from "@/components/app/action-form";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { canManage, isPro } from "@/lib/plan";
import { money } from "@/lib/format";
import { archiveLocationAction, saveLocationAction } from "./actions";

export default async function LocationsPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const [{ data: locs }, { data: items }] = await Promise.all([
    supabase.from("locations").select("*").eq("organization_id", ctx.orgId).order("is_archived").order("name"),
    supabase.from("inventory_items").select("location_id,quantity,unit_cost").eq("organization_id", ctx.orgId).eq("is_archived", false).limit(10000),
  ]);
  const stats = new Map<string, { n: number; v: number }>();
  (items ?? []).forEach((i) => { if (!i.location_id) return; const s = stats.get(i.location_id) ?? { n: 0, v: 0 }; s.n++; s.v += i.quantity * i.unit_cost; stats.set(i.location_id, s); });
  const active = (locs ?? []).filter((l) => !l.is_archived).length;
  const manage = canManage(ctx);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Locations</h1>
      {!isPro(ctx) && (
        <Card className="border-teal/40 bg-mint">
          <p className="text-sm">Your plan includes <strong>one location</strong>. Multi-location management is part of the Professional plan.{" "}
            <a href="/dashboard/billing" className="font-medium underline">Upgrade</a></p>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(locs ?? []).length === 0 && <Card className="sm:col-span-3 text-slate-500">No locations yet.</Card>}
        {(locs ?? []).map((l) => (
          <Card key={l.id} className={l.is_archived ? "opacity-60" : ""}>
            <div className="flex items-start justify-between gap-2">
              <div><h2 className="font-semibold">{l.name}</h2><p className="text-xs capitalize text-slate-500">{l.kind}{l.is_archived ? " · archived" : ""}</p></div>
              {manage && <form action={archiveLocationAction.bind(null, l.id, !l.is_archived)}><button className="text-xs text-teal-600 hover:underline">{l.is_archived ? "Restore" : "Archive"}</button></form>}
            </div>
            {l.address && <p className="mt-2 text-sm text-slate-600">{l.address}</p>}
            <p className="mt-3 text-sm text-slate-600">{stats.get(l.id)?.n ?? 0} products · {money(stats.get(l.id)?.v ?? 0)} stock value</p>
          </Card>
        ))}
      </div>
      {manage ? (
        <Card className="max-w-2xl">
          <h2 className="mb-3 text-lg font-semibold">Add a location</h2>
          <p className="mb-3 text-xs text-slate-500">{active} active location(s).</p>
          <ActionForm action={saveLocationAction.bind(null, null)} submit="Add location">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><Input name="name" required /></Field>
              <Field label="Type"><Select name="kind" defaultValue="facility"><option value="facility">Facility</option><option value="branch">Branch</option><option value="warehouse">Warehouse</option><option value="department">Department</option></Select></Field>
            </div>
            <Field label="Address (optional)"><Input name="address" /></Field>
          </ActionForm>
        </Card>
      ) : <p className="text-sm text-slate-500">Only owners and administrators can add or change locations.</p>}
    </div>
  );
}
