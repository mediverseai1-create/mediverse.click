"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org";
import { alertSettingsSchema, locationSchema, orgSchema, zodFieldErrors, type ActionState } from "@/lib/validation";
import { z } from "zod";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createOrgAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = orgSchema.safeParse({ name: str(fd, "name"), type: str(fd, "type"), country: str(fd, "country") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name, p_type: parsed.data.type, p_country: parsed.data.country ?? "",
  });
  if (error) return { error: error.message.includes("already belong") ? "You already belong to an organization." : "Could not create the organization. Please try again." };
  redirect("/onboarding?step=location");
}

export async function addLocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  const parsed = locationSchema.safeParse({ name: str(fd, "name"), kind: str(fd, "kind") || "facility", address: str(fd, "address") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("locations").insert({
    organization_id: ctx.orgId, name: parsed.data.name, kind: parsed.data.kind,
    address: parsed.data.address || null, created_by: ctx.userId, updated_by: ctx.userId,
  });
  if (error) return { error: error.message.includes("allows") ? error.message : "Could not add the location. Only owners and administrators can do this." };
  redirect("/onboarding?step=items");
}

const itemSchema = z.object({
  name: z.string().trim().min(1, "Enter a product name").max(200),
  sku: z.string().trim().max(60).optional(),
  unit: z.string().trim().min(1).max(30).default("unit"),
  quantity: z.coerce.number().min(0, "Quantity cannot be negative").max(100000000),
  minStock: z.coerce.number().min(0).max(100000000),
  unitCost: z.coerce.number().min(0).max(100000000),
  expirationDate: z.string().optional(),
});

export async function addFirstItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  const parsed = itemSchema.safeParse({
    name: str(fd, "name"), sku: str(fd, "sku"), unit: str(fd, "unit") || "unit",
    quantity: str(fd, "quantity") || "0", minStock: str(fd, "minStock") || "0", unitCost: str(fd, "unitCost") || "0",
    expirationDate: str(fd, "expirationDate"),
  });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  const supabase = await createClient();
  const { data: loc } = await supabase.from("locations").select("id").eq("organization_id", ctx.orgId).limit(1).maybeSingle();
  const { data: item, error } = await supabase.from("inventory_items").insert({
    organization_id: ctx.orgId, name: d.name, sku: d.sku || null, unit: d.unit, min_stock: d.minStock,
    unit_cost: d.unitCost, expiration_date: d.expirationDate || null, location_id: loc?.id ?? null,
    created_by: ctx.userId, updated_by: ctx.userId,
  }).select("id").single();
  if (error || !item) return { error: "Could not add the item. Please check the details." };
  if (d.quantity > 0) {
    const { error: mErr } = await supabase.rpc("apply_stock_movement", { p_item: item.id, p_type: "initial", p_quantity: d.quantity, p_reason: "Opening stock" });
    if (mErr) return { error: "The item was created but opening stock could not be recorded." };
  }
  redirect("/onboarding?step=alerts");
}

export async function finishOnboardingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  const parsed = alertSettingsSchema.safeParse({ expiryWarningDays: str(fd, "expiryWarningDays"), unusualFactor: str(fd, "unusualFactor") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("notification_preferences").upsert({
    organization_id: ctx.orgId, user_id: ctx.userId,
    expiry_warning_days: parsed.data.expiryWarningDays, unusual_consumption_factor: parsed.data.unusualFactor,
  }, { onConflict: "organization_id,user_id" });
  if (error) return { error: "Could not save alert settings." };
  const { error: e2 } = await supabase.rpc("complete_onboarding", { p_org: ctx.orgId });
  if (e2) return { error: "Could not finish setup. Only an owner or administrator can complete onboarding." };
  redirect("/dashboard");
}
