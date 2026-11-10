import { Card, Field, Input } from "@/components/ui";
import { ActionForm } from "@/components/app/action-form";
import { UpgradeNotice } from "@/components/app/upgrade";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { canManage, isPro } from "@/lib/plan";
import { onTimeRate } from "@/lib/inventory-logic";
import { money } from "@/lib/format";
import { archiveSupplierAction, saveSupplierAction } from "./actions";

type Perf = { supplier_id: string; orders: number; received_orders: number; on_time_orders: number; spend: number };

function SupplierFields({ s }: { s?: { name?: string; contact_name?: string | null; email?: string | null; phone?: string | null; address?: string | null; notes?: string | null } }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier name"><Input name="name" defaultValue={s?.name} required /></Field>
        <Field label="Contact person"><Input name="contact_name" defaultValue={s?.contact_name ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={s?.email ?? ""} /></Field>
        <Field label="Phone"><Input name="phone" defaultValue={s?.phone ?? ""} /></Field>
      </div>
      <Field label="Address"><Input name="address" defaultValue={s?.address ?? ""} /></Field>
      <Field label="Notes"><Input name="notes" defaultValue={s?.notes ?? ""} /></Field>
    </>
  );
}

export default async function SuppliersPage() {
  const ctx = await requireOrg();
  if (!isPro(ctx)) return (<div className="space-y-4"><h1 className="text-2xl font-semibold">Suppliers</h1><UpgradeNotice feature="Supplier management" status={ctx.subscriptionStatus} /></div>);
  const supabase = await createClient();
  const [{ data: suppliers }, { data: perf }] = await Promise.all([
    supabase.from("suppliers").select("*").eq("organization_id", ctx.orgId).order("is_archived").order("name"),
    supabase.rpc("report_supplier_performance", { p_org: ctx.orgId }),
  ]);
  const pm = new Map((perf as Perf[] | null)?.map((p) => [p.supplier_id, p]));
  const manage = canManage(ctx);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Suppliers</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        {(suppliers ?? []).length === 0 && <Card className="text-slate-500 lg:col-span-2">No suppliers yet. Add one below.</Card>}
        {(suppliers ?? []).map((s) => {
          const p = pm.get(s.id);
          const rate = p ? onTimeRate(p.received_orders, p.on_time_orders) : null;
          return (
            <Card key={s.id} className={s.is_archived ? "opacity-60" : ""}>
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-lg font-semibold">{s.name}{s.is_archived && <span className="ml-2 text-xs font-normal text-slate-500">archived</span>}</h2>
                  <p className="text-sm text-slate-600">{[s.contact_name, s.email, s.phone].filter(Boolean).join(" · ") || "No contact details"}</p></div>
                {manage && <form action={archiveSupplierAction.bind(null, s.id, !s.is_archived)}><button className="text-xs text-teal-600 hover:underline">{s.is_archived ? "Restore" : "Archive"}</button></form>}
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-xs text-slate-500">Orders placed</dt><dd className="font-semibold">{p?.orders ?? 0}</dd></div>
                <div><dt className="text-xs text-slate-500">On-time delivery</dt><dd className="font-semibold">{rate === null ? "No data" : `${rate}%`}</dd></div>
                <div><dt className="text-xs text-slate-500">Spend</dt><dd className="font-semibold">{money(p?.spend ?? 0)}</dd></div>
              </dl>
              {manage && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-teal-600">Edit details</summary>
                  <div className="mt-3"><ActionForm action={saveSupplierAction.bind(null, s.id)}><SupplierFields s={s} /></ActionForm></div>
                </details>
              )}
            </Card>
          );
        })}
      </div>
      {manage ? (
        <Card className="max-w-3xl"><h2 className="mb-3 text-lg font-semibold">Add a supplier</h2>
          <ActionForm action={saveSupplierAction.bind(null, null)} submit="Add supplier"><SupplierFields /></ActionForm></Card>
      ) : <p className="text-sm text-slate-500">Only owners and administrators can add or edit suppliers.</p>}
    </div>
  );
}
