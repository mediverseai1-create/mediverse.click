import Link from "next/link";
import { Card } from "@/components/ui";
import { requireOrg } from "@/lib/org";
import { getLookups } from "@/lib/lookups";
import { createItemAction } from "../actions";
import { ItemForm } from "../item-form";

export default async function NewItemPage() {
  const ctx = await requireOrg();
  const lk = await getLookups(ctx.orgId);
  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/dashboard/inventory" className="text-sm text-teal-600 hover:underline">← Inventory</Link>
      <h1 className="text-2xl font-semibold">Add inventory item</h1>
      <Card><ItemForm action={createItemAction} creating {...lk} /></Card>
    </div>
  );
}
