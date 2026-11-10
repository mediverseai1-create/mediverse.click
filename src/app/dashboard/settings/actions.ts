"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed, friendly, parse } from "@/lib/action";
import { canManage } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { ORG_TYPES, passwordSchema, orgSchema, type ActionState } from "@/lib/validation";

const roleValues = ["admin", "staff"] as const;

export async function saveProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, supabase } = await authed({ allowUnpaid: true });
  const p = parse(z.object({ full_name: z.string().trim().min(2, "Enter your name").max(120), phone: z.string().trim().max(30).optional(), country: z.string().trim().max(80).optional() }), fd);
  if (!p.data) return { fieldErrors: p.fieldErrors };
  const { error } = await supabase.from("profiles").update({ full_name: p.data.full_name, phone: p.data.phone || null, country: p.data.country || null }).eq("id", ctx.userId);
  if (error) return { error: "Could not save your profile." };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function saveOrgAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, supabase } = await authed({ allowUnpaid: true });
  if (!canManage(ctx)) return { error: "Only owners and administrators can edit the organization." };
  const p = parse(orgSchema, fd);
  if (!p.data) return { fieldErrors: p.fieldErrors };
  if (!ORG_TYPES.some((t) => t[0] === p.data.type)) return { error: "Invalid organization type." };
  const { error } = await supabase.from("organizations").update({ name: p.data.name, type: p.data.type, country: p.data.country || null }).eq("id", ctx.orgId);
  if (error) return { error: "Could not save the organization." };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function invitePersonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, supabase } = await authed({ allowUnpaid: true });
  if (!canManage(ctx)) return { error: "Only owners and administrators can invite people." };
  const p = parse(z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email"), role: z.enum(roleValues) }), fd);
  if (!p.data) return { fieldErrors: p.fieldErrors };
  if (p.data.role === "admin" && ctx.role !== "owner") return { error: "Only the owner can invite administrators." };
  const { error } = await supabase.from("organization_invitations").insert({ organization_id: ctx.orgId, email: p.data.email, role: p.data.role, invited_by: ctx.userId });
  if (error) return { error: friendly(error.message, "Could not create the invitation.") };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function revokeInviteAction(id: string): Promise<void> {
  const { ctx, supabase } = await authed({ allowUnpaid: true });
  if (!canManage(ctx)) return;
  await supabase.from("organization_invitations").delete().eq("id", id).eq("organization_id", ctx.orgId);
  revalidatePath("/dashboard/settings");
}

export async function changeRoleAction(userId: string, fd: FormData): Promise<void> {
  const { ctx, supabase } = await authed({ allowUnpaid: true });
  const role = z.enum(["owner", "admin", "staff"]).safeParse(fd.get("role"));
  if (!role.success) return;
  await supabase.rpc("set_member_role", { p_org: ctx.orgId, p_user: userId, p_role: role.data });
  revalidatePath("/dashboard/settings");
}

export async function removeMemberAction(userId: string): Promise<void> {
  const { ctx, supabase } = await authed({ allowUnpaid: true });
  await supabase.rpc("remove_member", { p_org: ctx.orgId, p_user: userId });
  revalidatePath("/dashboard/settings");
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await authed({ allowUnpaid: true });
  const pw = passwordSchema.safeParse(String(fd.get("password") ?? ""));
  if (!pw.success) return { fieldErrors: { password: pw.error.issues[0].message } };
  if (fd.get("password") !== fd.get("confirm")) return { fieldErrors: { confirm: "Passwords do not match" } };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return { error: "Could not change your password. Please sign in again and retry." };
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true };
}
