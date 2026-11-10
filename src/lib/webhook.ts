import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Verifies "HMAC-SHA256 of the raw body, hex encoded" (optionally prefixed "sha256="). Constant-time comparison. */
export function verifySignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!secret || !header) return false;
  const given = header.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(given)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

export function sign(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** Provider-neutral event format. A small adapter (or an automation tool) maps a provider's payload to this. */
export const paymentEvent = z.object({
  event_id: z.string().min(3).max(200),
  type: z.enum(["payment_succeeded", "payment_failed", "subscription_cancelled", "subscription_expired"]),
  email: z.string().email(),
  plan: z.enum(["starter", "professional"]).optional(),
  period_days: z.number().int().min(1).max(400).default(30),
  provider: z.string().min(2).max(40).default("webhook"),
  reference: z.string().max(200).optional(),
  timestamp: z.number().int().optional(),
});
export type PaymentEvent = z.infer<typeof paymentEvent>;

/** Rejects events older than 10 minutes (replay protection) when the sender includes a timestamp (unix seconds). */
export function freshEnough(ts: number | undefined, nowMs = Date.now()): boolean {
  if (ts === undefined) return true;
  return Math.abs(nowMs / 1000 - ts) <= 600;
}
