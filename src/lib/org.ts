import "server-only";
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
  plan: "starter" | "professional" | null;
  subscriptionStatus: string;
};

/** Returns the signed-in user's organization context, or null if they have no organization yet. */
export async function getOrgContext(): Promise<OrgContext | null> {
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
    supabase.from("subscriptions").select("plan, status, current_period_end").eq("organization_id", m.organization_id).maybeSingle(),
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
    subscriptionStatus: sub?.status ?? "inactive",
  };
}

/** For pages inside the app: requires an organization with finished onboarding. */
export async function requireOrg(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx || !ctx.onboardingCompleted) redirect("/onboarding");
  return ctx;
}
