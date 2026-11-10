"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed, friendly, parse, redirect } from "@/lib/action";
import { canManage } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/validation";

const PLANS = ["starter", "professional"] as const;

/** Sends the user to the payment page for the chosen plan. Payment is NOT assumed: access starts only after verification. */
export async function checkoutAction(plan: string): Promise<void> {
  const { ctx, supabase } = await authed({ allowUnpaid: true });
  if (!canManage(ctx) || !PLANS.includes(plan as (typeof PLANS)[number])) redirect("/dashboard/billing");
  const link = plan === "starter" ? process.env.STARTER_PAYMENT_LINK : process.env.PROFESSIONAL_PAYMENT_LINK;
  if (!link || !/^https:\/\//.test(link)) redirect("/dashboard/billing?error=link");
  await supabase.from("audit_logs").insert({ organization_id: ctx.orgId, user_id: ctx.userId, action: "billing.checkout_started", entity_type: "subscription", details: { plan } });
  redirect(link);
}

const claimSchema = z.object({
  plan: z.enum(PLANS),
  reference: z.string().trim().min(4, "Enter the order or transaction reference from your payment receipt").max(120),
  payer_email: z.string().trim().toLowerCase().email("Enter the email address you used when paying"),
});

export async function submitClaimAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, supabase } = await authed({ allowUnpaid: true });
  const p = parse(claimSchema, fd);
  if (!p.data) return { fieldErrors: p.fieldErrors };
  const { error } = await supabase.rpc("submit_payment_claim", { p_org: ctx.orgId, p_plan: p.data.plan, p_reference: p.data.reference, p_email: p.data.payer_email });
  if (error) {
    if (error.code === "23505") return { error: "That payment reference has already been submitted." };
    if (error.message.includes("pending payment")) return { error: error.message };
    if (error.message.includes("Only an owner")) return { error: error.message };
    return { error: "Could not submit your payment details." };
  }
  revalidatePath("/dashboard/billing");
  return { ok: true };
}

/** Records that the customer intends to stop renewing. Access continues until the paid period ends. */
export async function cancelRenewalAction(): Promise<void> {
  const { ctx } = await authed({ allowUnpaid: true });
  if (!canManage(ctx) || !ctx.plan) return;
  await createAdminClient().rpc("set_subscription_status", { p_org: ctx.orgId, p_status: "active", p_cancel_at_end: true });
  revalidatePath("/dashboard/billing");
}

export { friendly };
