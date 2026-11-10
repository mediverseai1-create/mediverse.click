import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/lookups";
import { updateItemAction } from "../../actions";
import { ItemForm } from "../../item-form";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg();
  const supabase = await createClient();
  const { data: item } = await supabase.from("inventory_items").select("*, inventory_categories(name)").eq("id", id).eq("organization_id", ctx.orgId).maybeSingle();
  if (!item) notFound();
  const lk = await getLookups(ctx.orgId);
  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/dashboard/inventory/${id}`} className="text-sm text-teal-600 hover:underline">← {item.name}</Link>
      <h1 className="text-2xl font-semibold">Edit item</h1>
      <p className="text-sm text-slate-500">To change the quantity, record a stock movement on the item page so the change is tracked.</p>
      <Card>
        <ItemForm action={updateItemAction.bind(null, id)} item={{ ...item, categoryName: (item.inventory_categories as { name: string } | null)?.name }} {...lk} />
      </Card>
    </div>
  );
}
