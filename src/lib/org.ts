import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OrgContext = {
  userId: string;
  email: string;
  fullName: string;
  orgId: string;
  orgName: string;
  role: "owner" | "admin" | "staff";
  onboardingCompleted: boolean;
  /** Plan that is currently paid for and in date. null means no access to paid features. */
  plan: "starter" | "professional" | null;
  subscriptionStatus: string;
  subscribedPlan: "starter" | "professional" | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

/** Returns the signed-in user's organization context, or null if they have no organization yet. */
export const getOrgContext = cache(async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: m } = await supabase
    .from("organization_members")
    .select("role, organization_id, organizations(name, onboarding_completed)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!m) return null;

  const org = m.organizations as unknown as { name: string; onboarding_completed: boolean } | null;
  const [{ data: sub }, { data: profile }] = await Promise.all([
    supabase.from("subscriptions").select("plan, status, current_period_end, cancel_at_period_end").eq("organization_id", m.organization_id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const active = sub?.status === "active" && (!sub.current_period_end || new Date(sub.current_period_end) > new Date());

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? "",
    orgId: m.organization_id,
    orgName: org?.name ?? "",
    role: m.role as OrgContext["role"],
    onboardingCompleted: !!org?.onboarding_completed,
    plan: active ? (sub!.plan as OrgContext["plan"]) : null,
    subscriptionStatus: sub ? (sub.status === "active" && !active ? "expired" : sub.status) : "inactive",
    subscribedPlan: (sub?.plan as OrgContext["plan"]) ?? null,
    periodEnd: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
  };
});

/**
 * For pages inside the app. Requires an organization with finished onboarding AND an active paid plan.
 * Billing and Settings pass allowUnpaid so people can always pay or manage their account.
 */
export async function requireOrg(opts: { allowUnpaid?: boolean } = {}): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx || !ctx.onboardingCompleted) redirect("/onboarding");
  if (!ctx.plan && !opts.allowUnpaid) redirect("/dashboard/billing?reason=subscribe");
  return ctx;
}

export function platformAdmins(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Platform operators (you) who can verify payments. Configured only by environment variable. */
export async function requirePlatformAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/payments");
  if (!platformAdmins().includes((user.email ?? "").toLowerCase())) return null;
  return user;
}
