"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ id: z.string().uuid(), approve: z.enum(["yes", "no"]), note: z.string().trim().max(300).optional(), days: z.coerce.number().int().min(1).max(400).default(30) });

export async function reviewClaimAction(fd: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  if (!admin) return;
  const p = schema.safeParse(Object.fromEntries(fd));
  if (!p.success) return;
  await createAdminClient().rpc("review_payment_claim", {
    p_claim: p.data.id, p_approve: p.data.approve === "yes", p_note: p.data.note || null, p_reviewer: admin.email ?? "platform-admin", p_days: p.data.days,
  });
  revalidatePath("/admin/payments");
}

export async function endSubscriptionAction(fd: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const org = z.string().uuid().safeParse(fd.get("org"));
  if (!admin || !org.success) return;
  await createAdminClient().rpc("set_subscription_status", { p_org: org.data, p_status: "expired" });
  revalidatePath("/admin/payments");
}
