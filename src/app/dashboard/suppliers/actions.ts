"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed, friendly, parse } from "@/lib/action";
import { canManage, planError } from "@/lib/plan";
import type { ActionState } from "@/lib/validation";

const opt = z.string().trim().max(500).optional().transform((v) => (v ? v : null));
const schema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(160),
  contact_name: opt, email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")).transform((v) => (v ? v : null)),
  phone: opt, address: opt, notes: opt,
});

export async function saveSupplierAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, supabase } = await authed();
  const gate = planError(ctx, "Supplier management");
  if (gate) return { error: gate };
  if (!canManage(ctx)) return { error: "Only owners and administrators can manage suppliers." };
  const p = parse(schema, fd);
  if (!p.data) return { fieldErrors: p.fieldErrors };
  const row = { ...p.data, updated_by: ctx.userId };
  const { error } = id
    ? await supabase.from("suppliers").update(row).eq("id", id).eq("organization_id", ctx.orgId)
    : await supabase.from("suppliers").insert({ ...row, organization_id: ctx.orgId, created_by: ctx.userId });
  if (error) return { error: friendly(error.message, "Could not save the supplier.") };
  revalidatePath("/dashboard/suppliers");
  return { ok: true };
}

export async function archiveSupplierAction(id: string, archive: boolean): Promise<void> {
  const { ctx, supabase } = await authed();
  if (!canManage(ctx) || planError(ctx, "Supplier management")) return;
  await supabase.from("suppliers").update({ is_archived: archive, updated_by: ctx.userId }).eq("id", id).eq("organization_id", ctx.orgId);
  revalidatePath("/dashboard/suppliers");
}
