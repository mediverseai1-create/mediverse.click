"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed, friendly, parse, redirect } from "@/lib/action";
import type { ActionState } from "@/lib/validation";

const opt = z.string().trim().optional().transform((v) => (v ? v : null));
const optNum = z.string().trim().optional().transform((v) => (v ? Number(v) : null)).refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Must be a positive number");
const num = (name: string) => z.coerce.number({ message: `${name} must be a number` }).min(0, `${name} cannot be negative`).max(1e9);

const itemSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(200),
  sku: opt, description: opt, categoryName: opt,
  supplierId: opt, locationId: opt,
  unit: z.string().trim().min(1).max(30).default("unit"),
  minStock: num("Minimum stock"), unitCost: num("Unit cost"), sellingPrice: optNum,
  batchNumber: opt, expirationDate: opt,
  quantity: num("Quantity").optional(),
});

async function resolveCategory(supabase: Awaited<ReturnType<typeof authed>>["supabase"], orgId: string, name: string | null) {
  if (!name) return null;
  const { data: existing } = await supabase.from("inventory_categories").select("id").eq("organization_id", orgId).ilike("name", name).maybeSingle();
  if (existing) return existing.id as string;
  const { data } = await supabase.from("inventory_categories").insert({ organization_id: orgId, name }).select("id").single();
  return (data?.id as string) ?? null;
}

export async function createItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, supabase } = await authed();
  const p = parse(itemSchema, fd);
  if (!p.data) return { fieldErrors: p.fieldErrors };
  const d = p.data;
  const categoryId = await resolveCategory(supabase, ctx.orgId, d.categoryName);
  const { data: item, error } = await supabase.from("inventory_items").insert({
    organization_id: ctx.orgId, name: d.name, sku: d.sku, description: d.description, category_id: categoryId,
    supplier_id: d.supplierId, location_id: d.locationId, unit: d.unit, min_stock: d.minStock, unit_cost: d.unitCost,
    selling_price: d.sellingPrice, batch_number: d.batchNumber, expiration_date: d.expirationDate,
    created_by: ctx.userId, updated_by: ctx.userId,
  }).select("id").single();
  if (error || !item) return { error: friendly(error?.message, "Could not save the item.") };
  if ((d.quantity ?? 0) > 0) {
    const { error: e2 } = await supabase.rpc("apply_stock_movement", { p_item: item.id, p_type: "initial", p_quantity: d.quantity, p_reason: "Opening stock" });
    if (e2) return { error: friendly(e2.message, "Item saved, but opening stock failed.") };
  }
  if (d.batchNumber) {
    await supabase.from("inventory_batches").insert({
      organization_id: ctx.orgId, item_id: item.id, batch_number: d.batchNumber, expiration_date: d.expirationDate,
      quantity: d.quantity ?? 0, created_by: ctx.userId,
    });
  }
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/inventory/${item.id}`);
}

export async function updateItemAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, supabase } = await authed();
  const p = parse(itemSchema, fd);
  if (!p.data) return { fieldErrors: p.fieldErrors };
  const d = p.data;
  const categoryId = await resolveCategory(supabase, ctx.orgId, d.categoryName);
  const { error } = await supabase.from("inventory_items").update({
    name: d.name, sku: d.sku, description: d.description, category_id: categoryId, supplier_id: d.supplierId,
    location_id: d.locationId, unit: d.unit, min_stock: d.minStock, unit_cost: d.unitCost, selling_price: d.sellingPrice,
    batch_number: d.batchNumber, expiration_date: d.expirationDate, updated_by: ctx.userId,
  }).eq("id", id).eq("organization_id", ctx.orgId);
  if (error) return { error: friendly(error.message, "Could not save the item.") };
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/inventory/${id}`);
}

const moveSchema = z.object({
  type: z.enum(["consumption", "purchase_receipt", "adjustment_in", "adjustment_out", "expired_writeoff"]),
  quantity: z.coerce.number({ message: "Enter a quantity" }).positive("Quantity must be greater than zero").max(1e9),
  reason: opt,
});

export async function stockMovementAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await authed();
  const p = parse(moveSchema, fd);
  if (!p.data) return { fieldErrors: p.fieldErrors };
  const { error } = await supabase.rpc("apply_stock_movement", {
    p_item: id, p_type: p.data.type, p_quantity: p.data.quantity, p_reason: p.data.reason,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function archiveItemAction(id: string, archive: boolean) {
  const { ctx, supabase } = await authed();
  await supabase.from("inventory_items").update({ is_archived: archive, updated_by: ctx.userId }).eq("id", id).eq("organization_id", ctx.orgId);
  revalidatePath("/dashboard", "layout");
  redirect(archive ? "/dashboard/inventory" : `/dashboard/inventory/${id}`);
}

const batchSchema = z.object({
  batchNumber: z.string().trim().min(1, "Batch number is required").max(80),
  expirationDate: opt,
  quantity: num("Quantity"),
});

export async function addBatchAction(itemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { ctx, supabase } = await authed();
  const p = parse(batchSchema, fd);
  if (!p.data) return { fieldErrors: p.fieldErrors };
  const { error } = await supabase.from("inventory_batches").insert({
    organization_id: ctx.orgId, item_id: itemId, batch_number: p.data.batchNumber,
    expiration_date: p.data.expirationDate, quantity: p.data.quantity, created_by: ctx.userId,
  });
  if (error) return { error: friendly(error.message, "Could not add the batch (is the batch number already used for this product?).") };
  revalidatePath(`/dashboard/inventory/${itemId}`);
  revalidatePath("/dashboard/expiry");
  return { ok: true };
}
