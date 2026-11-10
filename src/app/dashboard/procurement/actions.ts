"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed, friendly, redirect } from "@/lib/action";
import { planError } from "@/lib/plan";
import type { ActionState } from "@/lib/validation";

const lineSchema = z.array(z.object({
  item_id: z.string().uuid(),
  quantity: z.number().positive("Quantities must be greater than zero").max(1e9),
  unit_cost: z.number().min(0).max(1e9),
})).min(1, "Add at least one product").max(200);

export async function createOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, supabase } = await authed();
  const gate = planError(ctx, "Procurement");
  if (gate) return { error: gate };

  const ids = fd.getAll("item_id").map(String);
  const qtys = fd.getAll("quantity").map(Number);
  const costs = fd.getAll("unit_cost").map(Number);
  const lines = ids.map((item_id, i) => ({ item_id, quantity: qtys[i], unit_cost: costs[i] || 0 }))
    .filter((l) => l.item_id && l.quantity > 0);
  const parsed = lineSchema.safeParse(lines);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await supabase.rpc("create_purchase_order", {
    p_org: ctx.orgId,
    p_supplier: String(fd.get("supplier_id") || "") || null,
    p_location: String(fd.get("location_id") || "") || null,
    p_expected: String(fd.get("expected_delivery") || "") || null,
    p_notes: String(fd.get("notes") || "").slice(0, 1000) || null,
    p_is_request: fd.get("kind") === "request",
    p_lines: parsed.data,
  });
  if (error || !data) return { error: friendly(error?.message, "Could not create the order.") };
  revalidatePath("/dashboard/procurement");
  redirect(`/dashboard/procurement/${data}`);
}

export async function setStatusAction(id: string, status: string): Promise<void> {
  const { supabase } = await authed();
  const { error } = await supabase.rpc("set_po_status", { p_po: id, p_status: status });
  if (error) redirect(`/dashboard/procurement/${id}?error=${encodeURIComponent(friendly(error.message))}`);
  revalidatePath("/dashboard/procurement", "layout");
  redirect(`/dashboard/procurement/${id}`);
}

export async function receiveAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await authed();
  const lines: { line_id: string; quantity: number }[] = [];
  fd.forEach((v, k) => {
    if (k.startsWith("recv_") && typeof v === "string" && Number(v) > 0) lines.push({ line_id: k.slice(5), quantity: Number(v) });
  });
  const { error } = await supabase.rpc("receive_purchase_order", { p_po: id, p_lines: lines });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
