"use server";

import { revalidatePath } from "next/cache";
import { authed, friendly, parse } from "@/lib/action";
import { canManage } from "@/lib/plan";
import { locationSchema, type ActionState } from "@/lib/validation";

export async function saveLocationAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, supabase } = await authed();
  if (!canManage(ctx)) return { error: "Only owners and administrators can manage locations." };
  const p = parse(locationSchema, fd);
  if (!p.data) return { fieldErrors: p.fieldErrors };
  const row = { name: p.data.name, kind: p.data.kind, address: p.data.address || null, updated_by: ctx.userId };
  const { error } = id
    ? await supabase.from("locations").update(row).eq("id", id).eq("organization_id", ctx.orgId)
    : await supabase.from("locations").insert({ ...row, organization_id: ctx.orgId, created_by: ctx.userId });
  if (error) return { error: friendly(error.message, "Could not save the location.") };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function archiveLocationAction(id: string, archive: boolean): Promise<void> {
  const { ctx, supabase } = await authed();
  if (!canManage(ctx)) return;
  await supabase.from("locations").update({ is_archived: archive, updated_by: ctx.userId }).eq("id", id).eq("organization_id", ctx.orgId);
  revalidatePath("/dashboard", "layout");
}
