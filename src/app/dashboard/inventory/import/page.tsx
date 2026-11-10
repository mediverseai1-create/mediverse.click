import Link from "next/link";
import { requireOrg } from "@/lib/org";
import { ImportWizard } from "./wizard";

export default async function ImportPage() {
  await requireOrg();
  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/dashboard/inventory" className="text-sm text-teal-600 hover:underline">← Inventory</Link>
      <h1 className="text-2xl font-semibold">Import inventory from a spreadsheet</h1>
      <ImportWizard />
    </div>
  );
}
