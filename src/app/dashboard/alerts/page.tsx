import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Card, Field, Input } from "@/components/ui";
import { ActionForm } from "@/components/app/action-form";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { dateTimeStr, label } from "@/lib/format";
import { markAlertAction, markAllReadAction, refreshAlertsAction, savePreferencesAction } from "./actions";

const TOGGLES: [string, string][] = [
  ["low_stock", "Low stock"], ["out_of_stock", "Out of stock"], ["approaching_expiry", "Approaching expiration"],
  ["expired", "Expired inventory"], ["unusual_consumption", "Unusual consumption"], ["reorder_recommendation", "Reorder recommendations"],
];
const SEV: Record<string, string> = { critical: "bg-red-100 text-red-700", warning: "bg-amber-100 text-amber-800", info: "bg-mint text-navy" };

export default async function AlertsPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  // Alerts are recalculated from current records each time this page opens.
  await supabase.rpc("generate_alerts", { p_org: ctx.orgId });
  const [{ data: alerts }, { data: pref }] = await Promise.all([
    supabase.from("inventory_alerts").select("id,item_id,type,message,severity,is_read,created_at").eq("organization_id", ctx.orgId).is("resolved_at", null).order("is_read").order("created_at", { ascending: false }).limit(200),
    supabase.from("notification_preferences").select("*").eq("organization_id", ctx.orgId).eq("user_id", ctx.userId).maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Stock Alerts</h1>
        <div className="flex gap-2">
          <form action={refreshAlertsAction}><button className="inline-flex h-10 items-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-medium"><RefreshCw className="h-4 w-4" />Refresh</button></form>
          <form action={markAllReadAction}><button className="h-10 rounded border border-slate-300 bg-white px-4 text-sm font-medium">Mark all read</button></form>
        </div>
      </div>

      <Card className="p-0">
        <ul className="divide-y divide-slate-100">
          {(alerts ?? []).length === 0 && <li className="px-5 py-10 text-center text-slate-500">No open alerts. Alerts appear automatically when stock is low, products are expiring, or usage looks unusual.</li>}
          {(alerts ?? []).map((a) => (
            <li key={a.id} className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${a.is_read ? "opacity-70" : ""}`}>
              {!a.is_read && <span className="h-2 w-2 rounded-full bg-teal" aria-label="Unread" />}
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SEV[a.severity] ?? SEV.info}`}>{label(a.type)}</span>
              <span className="min-w-0 flex-1 text-sm">{a.item_id ? <Link href={`/dashboard/inventory/${a.item_id}`} className="hover:underline">{a.message}</Link> : a.message}</span>
              <span className="text-xs text-slate-500">{dateTimeStr(a.created_at)}</span>
              <form action={markAlertAction.bind(null, a.id, !a.is_read)}><button className="text-xs text-teal-600 hover:underline">{a.is_read ? "Mark unread" : "Mark read"}</button></form>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Alert settings</h2>
        <p className="mb-4 text-sm text-slate-500">These apply to your account. Reorder recommendations and unusual-consumption alerts are estimates based on recorded usage.</p>
        <ActionForm action={savePreferencesAction} submit="Save settings">
          <div className="grid gap-2 sm:grid-cols-3">
            {TOGGLES.map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name={k} defaultChecked={pref ? (pref as Record<string, boolean>)[k] : true} className="h-4 w-4 accent-teal" />{l}</label>
            ))}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email_enabled" defaultChecked={pref?.email_enabled ?? true} className="h-4 w-4 accent-teal" />Email notifications</label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Warn this many days before expiry"><Input name="expiry_warning_days" type="number" min="1" max="365" defaultValue={pref?.expiry_warning_days ?? 30} /></Field>
            <Field label="Unusual consumption: multiple of normal usage"><Input name="unusual_consumption_factor" type="number" min="1" max="10" step="0.1" defaultValue={pref?.unusual_consumption_factor ?? 2} /></Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
