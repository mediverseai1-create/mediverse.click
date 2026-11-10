import "server-only";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { zodFieldErrors } from "@/lib/validation";

export async function authed() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  return { ctx, supabase };
}

export function formObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  fd.forEach((v, k) => { if (typeof v === "string") o[k] = v; });
  return o;
}

export function parse<T extends z.ZodTypeAny>(schema: T, fd: FormData) {
  const r = schema.safeParse(formObject(fd));
  return r.success ? { data: r.data as z.infer<T> } : { fieldErrors: zodFieldErrors(r.error) };
}

/** Turns a Postgres error from our functions into a message that is safe to show. */
export function friendly(message: string | undefined, fallback = "Something went wrong. Please try again."): string {
  if (!message) return fallback;
  const safe = [
    "Insufficient stock", "Quantity must", "A reason is required", "requires the Professional", "Your plan allows",
    "Cannot ", "Only ", "Enter at least", "Add at least", "Invalid ", "Quantity can only", "New items start",
    "duplicate key", "Monthly AI",
  ];
  if (safe.some((s) => message.includes(s))) {
    return message.includes("duplicate key") ? "That value already exists (for example a duplicate SKU)." : message;
  }
  return fallback;
}

export { redirect };
