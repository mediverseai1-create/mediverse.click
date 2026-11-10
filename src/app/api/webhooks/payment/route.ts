import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freshEnough, paymentEvent, verifySignature } from "@/lib/webhook";

export const runtime = "nodejs";

// Generic, signed payment webhook. Access is only ever changed after the signature is verified.
export async function POST(req: NextRequest) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const raw = await req.text();
  if (raw.length > 50_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const sig = req.headers.get("x-mediverse-signature") ?? req.headers.get("x-signature");
  if (!verifySignature(secret, raw, sig)) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let json: unknown;
  try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = paymentEvent.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  const ev = parsed.data;
  if (!freshEnough(ev.timestamp)) return NextResponse.json({ error: "Event too old" }, { status: 400 });

  const admin = createAdminClient();
  // Idempotency: the same event id is processed at most once.
  const { data: org } = await admin.rpc("find_org_for_email", { p_email: ev.email });
  const { error: dup } = await admin.from("payment_events").insert({
    provider: ev.provider, event_id: ev.event_id, event_type: ev.type, organization_id: org ?? null, payload: ev,
  });
  if (dup) return NextResponse.json({ ok: true, duplicate: true });
  if (!org) return NextResponse.json({ ok: true, matched: false });

  if (ev.type === "payment_succeeded") {
    if (!ev.plan) return NextResponse.json({ error: "plan is required for payment events" }, { status: 400 });
    const { error } = await admin.rpc("activate_subscription", { p_org: org, p_plan: ev.plan, p_days: ev.period_days, p_provider: ev.provider, p_reference: ev.reference ?? ev.event_id });
    if (error) return NextResponse.json({ error: "Could not activate" }, { status: 500 });
  } else if (ev.type === "payment_failed") {
    await admin.rpc("set_subscription_status", { p_org: org, p_status: "past_due" });
  } else if (ev.type === "subscription_cancelled") {
    await admin.rpc("set_subscription_status", { p_org: org, p_status: "active", p_cancel_at_end: true });
  } else if (ev.type === "subscription_expired") {
    await admin.rpc("set_subscription_status", { p_org: org, p_status: "expired" });
  }
  await admin.from("payment_events").update({ processed: true }).eq("provider", ev.provider).eq("event_id", ev.event_id);
  return NextResponse.json({ ok: true });
}
