import { Check } from "lucide-react";
import { Card, Field, Input, Select } from "@/components/ui";
import { ActionForm } from "@/components/app/action-form";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { canManage } from "@/lib/plan";
import { dateStr, dateTimeStr } from "@/lib/format";
import { cancelRenewalAction, checkoutAction, submitClaimAction } from "./actions";

const FEATURES = {
  starter: ["Inventory, categories and stock tracking", "Expiry monitoring and low-stock alerts", "Spreadsheet imports", "Basic analytics and standard reporting", "AI inventory insights (limited monthly allowance)", "One location · Email support"],
  professional: ["Everything in Starter", "Demand forecasting and stockout risk analysis", "Multi-location inventory", "Suppliers and procurement", "Advanced analytics, reports and exports", "Advanced AI analysis and higher allowance · Priority support"],
};
const STATUS_TEXT: Record<string, string> = {
  active: "Active", pending: "Awaiting payment verification", inactive: "No active subscription", past_due: "Payment overdue",
  cancelled: "Cancelled", expired: "Expired",
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ reason?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireOrg({ allowUnpaid: true });
  const supabase = await createClient();
  const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
  const [{ data: limits }, { data: used }, { data: claims }] = await Promise.all([
    supabase.from("plan_limits").select("plan,monthly_ai_requests"),
    supabase.from("usage_records").select("units").eq("organization_id", ctx.orgId).eq("kind", "ai_request").eq("period_start", month),
    supabase.from("payment_claims").select("id,plan,reference,status,review_note,created_at").eq("organization_id", ctx.orgId).order("created_at", { ascending: false }).limit(10),
  ]);
  const lim = (limits ?? []).find((l) => l.plan === ctx.plan)?.monthly_ai_requests ?? 0;
  const spent = (used ?? []).reduce((s, r) => s + r.units, 0);
  const manage = canManage(ctx);
  const active = !!ctx.plan;
  const resets = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const hasPending = (claims ?? []).some((c) => c.status === "pending");

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Billing &amp; Subscription</h1>
      {sp.reason === "subscribe" && <Card className="border-teal/40 bg-mint"><p className="text-sm">Choose a plan to start using Mediverse. Your organization is set up and ready; paid features unlock after your payment is verified.</p></Card>}
      {sp.error === "link" && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">The payment link for that plan has not been configured yet. Please contact support.</p>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Current plan</p>
            <p className="text-2xl font-semibold capitalize">{active ? ctx.plan : ctx.subscribedPlan && ctx.subscriptionStatus !== "pending" ? `${ctx.subscribedPlan} (not active)` : "None"}</p>
            <p className={`mt-1 text-sm font-medium ${ctx.subscriptionStatus === "active" ? "text-teal-600" : ctx.subscriptionStatus === "pending" ? "text-amber-700" : "text-red-600"}`}>{STATUS_TEXT[ctx.subscriptionStatus] ?? ctx.subscriptionStatus}</p>
            {ctx.periodEnd && <p className="mt-1 text-sm text-slate-600">{active ? (ctx.cancelAtPeriodEnd ? "Access ends on" : "Current period ends on") : "Last period ended on"} {dateStr(ctx.periodEnd)}</p>}
          </div>
          {active && (
            <div className="text-sm">
              <p className="text-slate-500">AI requests this month</p>
              <p className="text-2xl font-semibold">{Math.max(0, lim - spent)} <span className="text-base font-normal text-slate-400">left of {lim}</span></p>
              <p className="text-slate-500">Resets on {resets}</p>
            </div>
          )}
        </div>
        {active && manage && !ctx.cancelAtPeriodEnd && (
          <form action={cancelRenewalAction} className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm text-slate-600">To stop future charges, cancel on your payment provider as well. Marking it here keeps your access until the end of the paid period and shows it on your account.</p>
            <button className="h-9 rounded border border-slate-300 px-3 text-sm hover:bg-slate-50">I do not want to renew</button>
          </form>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {(["starter", "professional"] as const).map((p) => {
          const current = ctx.plan === p;
          const upgrade = p === "professional" && ctx.plan === "starter";
          return (
            <Card key={p} className={p === "professional" ? "border-navy" : ""}>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-teal">{p}</h2>
              <p className="mt-2 text-4xl font-extrabold">${p === "starter" ? 47 : 97}<span className="text-base font-normal text-slate-500"> / month</span></p>
              <p className="text-xs text-slate-500">Billed monthly in USD</p>
              <ul className="my-4 space-y-2 text-sm">{FEATURES[p].map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />{f}</li>)}</ul>
              {current ? <p className="text-sm font-medium text-teal-600">Your current plan</p>
                : manage ? (
                  <form action={checkoutAction.bind(null, p)}>
                    <button className="h-11 w-full rounded-full bg-navy px-6 text-sm font-semibold text-white hover:bg-navy-700">{upgrade ? "Upgrade to Professional" : active && p === "starter" ? "Switch to Starter" : `Pay for ${p === "starter" ? "Starter" : "Professional"}`}</button>
                  </form>
                ) : <p className="text-sm text-slate-500">Only an owner or administrator can change the plan.</p>}
            </Card>
          );
        })}
      </div>

      {manage && (
        <Card>
          <h2 className="text-lg font-semibold">Confirm your payment</h2>
          <ol className="mb-4 mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Choose a plan above and complete payment on the payment page.</li>
            <li>Come back here and enter the order reference from your payment receipt and the email you paid with.</li>
            <li>We verify the payment, then activate your plan. Being redirected back from the payment page does not activate anything on its own.</li>
          </ol>
          {hasPending && <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">You have a payment waiting for verification. This is usually done within one business day.</p>}
          <ActionForm action={submitClaimAction} submit="Submit payment details" className="grid items-end gap-4 sm:grid-cols-4">
            <Field label="Plan paid for"><Select name="plan" defaultValue={ctx.plan === "starter" ? "professional" : "starter"}><option value="starter">Starter ($47)</option><option value="professional">Professional ($97)</option></Select></Field>
            <Field label="Order / transaction reference"><Input name="reference" required /></Field>
            <Field label="Email used to pay"><Input name="payer_email" type="email" defaultValue={ctx.email} required /></Field>
          </ActionForm>
        </Card>
      )}

      {(claims ?? []).length > 0 && (
        <Card className="overflow-x-auto p-0">
          <h2 className="px-5 pt-5 text-lg font-semibold">Payment confirmations</h2>
          <table className="mt-3 w-full min-w-[520px] text-left text-sm">
            <thead className="border-y border-slate-200 bg-soft text-xs uppercase text-slate-500"><tr><th className="px-5 py-2">Submitted</th><th>Plan</th><th>Reference</th><th className="pr-5">Status</th></tr></thead>
            <tbody>{(claims ?? []).map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-2.5">{dateTimeStr(c.created_at)}</td><td className="capitalize">{c.plan}</td><td>{c.reference}</td>
                <td className="pr-5 capitalize">{c.status}{c.review_note ? ` · ${c.review_note}` : ""}</td></tr>))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
