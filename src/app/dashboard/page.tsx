import { Card } from "@/components/ui";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

export default async function OverviewPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { count } = await supabase
    .from("inventory_items").select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.orgId).eq("is_archived", false);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-slate-500">Inventory items</p><p className="mt-1 text-3xl font-semibold">{count ?? 0}</p></Card>
        <Card><p className="text-sm text-slate-500">Plan</p><p className="mt-1 text-3xl font-semibold capitalize">{ctx.plan ?? "None"}</p></Card>
        <Card><p className="text-sm text-slate-500">Subscription</p><p className="mt-1 text-3xl font-semibold capitalize">{ctx.subscriptionStatus}</p></Card>
      </div>
      {(count ?? 0) === 0 && (
        <Card><p className="text-slate-600">No inventory yet. The Inventory module arrives in the next build phase.</p></Card>
      )}
    </div>
  );
}
