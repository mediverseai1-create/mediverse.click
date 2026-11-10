"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed, friendly, parse } from "@/lib/action";
import type { ActionState } from "@/lib/validation";

export async function refreshAlertsAction(): Promise<void> {
  const { ctx, supabase } = await authed();
  await supabase.rpc("generate_alerts", { p_org: ctx.orgId });
  revalidatePath("/dashboard", "layout");
}

export async function markAlertAction(id: string, read: boolean): Promise<void> {
  const { ctx, supabase } = await authed();
  await supabase.from("inventory_alerts").update({ is_read: read }).eq("id", id).eq("organization_id", ctx.orgId);
  revalidatePath("/dashboard", "layout");
}

export async function markAllReadAction(): Promise<void> {
  const { ctx, supabase } = await authed();
  await supabase.from("inventory_alerts").update({ is_read: true }).eq("organization_id", ctx.orgId).eq("is_read", false);
  revalidatePath("/dashboard", "layout");
}

const bool = z.string().optional().transform((v) => v === "on");
const prefSchema = z.object({
  low_stock: bool, out_of_stock: bool, approaching_expiry: bool, expired: bool, unusual_consumption: bool, reorder_recommendation: bool,
  email_enabled: bool,
  expiry_warning_days: z.coerce.number().int().min(1, "Expiry warning must be 1 to 365 days").max(365),
  unusual_consumption_factor: z.coerce.number().min(1, "Factor must be at least 1").max(10),
});

export async function savePreferencesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, supabase } = await authed();
  const p = parse(prefSchema, fd);
  if (!p.data) return { fieldErrors: p.fieldErrors };
  const { error } = await supabase.from("notification_preferences").upsert(
    { organization_id: ctx.orgId, user_id: ctx.userId, ...p.data, updated_at: new Date().toISOString() },
    { onConflict: "organization_id,user_id" });
  if (error) return { error: friendly(error.message, "Could not save preferences.") };
  await supabase.rpc("generate_alerts", { p_org: ctx.orgId });
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
