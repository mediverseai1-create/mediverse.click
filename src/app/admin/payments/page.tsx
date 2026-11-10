import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { requirePlatformAdmin } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateStr, dateTimeStr } from "@/lib/format";
import { endSubscriptionAction, reviewClaimAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPayments() {
  const admin = await requirePlatformAdmin();
  if (!admin) notFound();
  const db = createAdminClient();
  const [{ data: claims }, { data: subs }] = await Promise.all([
    db.from("payment_claims").select("id,plan,reference,payer_email,status,created_at,organizations(name),user_id").order("created_at", { ascending: false }).limit(100),
    db.from("subscriptions").select("organization_id,plan,status,current_period_end,organizations(name)").in("status", ["active", "past_due", "pending"]).order("current_period_end"),
  ]);
  const pending = (claims ?? []).filter((c) => c.status === "pending");

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <Logo />
      <div><h1 className="text-2xl font-semibold">Payment verification</h1>
        <p className="text-sm text-slate-600">Compare each claim with the sale in your Selar dashboard (reference, buyer email, amount and plan) before approving. Approving activates the plan for the number of days shown.</p></div>

      <section>
        <h2 className="mb-2 font-semibold">Pending claims ({pending.length})</h2>
        <div className="space-y-3">
          {pending.length === 0 && <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-500">Nothing waiting for review.</p>}
          {pending.map((c) => (
            <form key={c.id} action={reviewClaimAction} className="grid items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm md:grid-cols-6">
              <input type="hidden" name="id" value={c.id} />
              <div className="md:col-span-2"><p className="font-semibold">{(c.organizations as unknown as { name: string } | null)?.name}</p><p className="text-slate-500">{dateTimeStr(c.created_at)}</p></div>
              <div><p className="text-xs text-slate-500">Plan</p><p className="font-medium capitalize">{c.plan} (${c.plan === "starter" ? 47 : 97})</p></div>
              <div><p className="text-xs text-slate-500">Reference</p><p className="break-all font-medium">{c.reference}</p></div>
              <div><p className="text-xs text-slate-500">Payer email</p><p className="break-all font-medium">{c.payer_email}</p></div>
              <label className="text-xs">Days<input name="days" type="number" defaultValue={30} min={1} max={400} className="mt-1 block h-9 w-20 rounded border border-slate-300 px-2 text-sm" /></label>
              <input name="note" placeholder="Note (optional)" className="h-9 rounded border border-slate-300 px-2 md:col-span-3" />
              <div className="flex gap-2 md:col-span-3">
                <button name="approve" value="yes" className="h-9 rounded bg-teal px-4 font-medium text-white hover:bg-teal-600">Verified: activate</button>
                <button name="approve" value="no" className="h-9 rounded border border-red-300 px-4 text-red-700 hover:bg-red-50">Reject</button>
              </div>
            </form>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Current subscriptions</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-slate-200 bg-soft text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Organization</th><th>Plan</th><th>Status</th><th>Period ends</th><th /></tr></thead>
            <tbody>{(subs ?? []).map((s) => (
              <tr key={s.organization_id} className="border-b border-slate-100 last:border-0"><td className="px-4 py-2.5">{(s.organizations as unknown as { name: string } | null)?.name}</td><td className="capitalize">{s.plan ?? "—"}</td><td className="capitalize">{s.status}</td><td>{dateStr(s.current_period_end)}</td>
                <td className="pr-4 text-right"><form action={endSubscriptionAction}><input type="hidden" name="org" value={s.organization_id} /><button className="text-xs text-red-700 hover:underline">End access now</button></form></td></tr>))}
              {(subs ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No subscriptions yet.</td></tr>}</tbody></table>
        </div>
      </section>
    </main>
  );
}
