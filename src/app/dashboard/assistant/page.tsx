import Link from "next/link";
import { Card } from "@/components/ui";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { Chat } from "./chat";

export default async function AssistantPage() {
  const ctx = await requireOrg();
  if (!ctx.plan) {
    return (
      <div className="space-y-4"><h1 className="text-2xl font-semibold">AI Inventory Assistant</h1>
        <Card className="max-w-xl border-teal/40 bg-mint"><p className="text-sm">The assistant is included in every paid plan. Choose a plan and complete payment to start using it. <Link href="/dashboard/billing" className="font-medium underline">View plans</Link></p></Card></div>
    );
  }
  const supabase = await createClient();
  const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
  const [{ data: lim }, { data: used }] = await Promise.all([
    supabase.from("plan_limits").select("monthly_ai_requests").eq("plan", ctx.plan).single(),
    supabase.from("usage_records").select("units").eq("organization_id", ctx.orgId).eq("kind", "ai_request").eq("period_start", month),
  ]);
  const limit = lim?.monthly_ai_requests ?? 0;
  const spent = (used ?? []).reduce((s, r) => s + r.units, 0);
  const resets = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  return (
    <div className="max-w-4xl space-y-4">
      <div><h1 className="text-2xl font-semibold">AI Inventory Assistant</h1><p className="text-sm text-slate-500">Plan: <span className="capitalize">{ctx.plan}</span> · allowance resets on {resets}{ctx.plan === "starter" && <> · <Link href="/dashboard/billing" className="text-teal-600 underline">Upgrade for a higher allowance and forecasting insights</Link></>}</p></div>
      <Chat initialRemaining={Math.max(0, limit - spent)} limit={limit} />
    </div>
  );
}
