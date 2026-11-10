import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiConfigured, chat, SYSTEM_PROMPT, type ChatMessage } from "@/lib/ai/provider";
import { buildContext, topicsFor } from "@/lib/ai/context";

export const maxDuration = 60;
const body = z.object({ message: z.string().trim().min(2, "Ask a question").max(1000, "Please keep questions under 1,000 characters"), conversationId: z.string().uuid().optional() });

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext();
  if (!ctx || !ctx.onboardingCompleted) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  if (!aiConfigured()) return NextResponse.json({ error: "The AI assistant is not configured yet. The administrator needs to add the AI provider settings." }, { status: 503 });

  const supabase = await createClient();
  // Allowance + rate limit are enforced atomically in the database.
  const { data: remaining, error: limitErr } = await supabase.rpc("consume_ai_request", { p_org: ctx.orgId });
  if (limitErr) {
    const code = (limitErr as { code?: string }).code;
    if (code === "P0003") return NextResponse.json({ error: "You have used this month's AI allowance. It resets at the start of next month.", limit: true, upgrade: ctx.plan !== "professional" }, { status: 429 });
    if (code === "P0005") return NextResponse.json({ error: "You are sending questions too quickly. Please wait a minute." }, { status: 429 });
    if (code === "P0002") return NextResponse.json({ error: "An active subscription is required to use the AI assistant.", upgrade: true }, { status: 402 });
    return NextResponse.json({ error: "Could not start the request." }, { status: 400 });
  }

  try {
    const { message, conversationId } = parsed.data;
    const topics = topicsFor(message);
    const { sections } = await buildContext(supabase, ctx.orgId, topics, ctx.plan === "professional");

    let convId = conversationId;
    if (convId) {
      const { data: c } = await supabase.from("ai_conversations").select("id").eq("id", convId).eq("user_id", ctx.userId).maybeSingle();
      if (!c) convId = undefined;
    }
    if (!convId) {
      const { data: c, error } = await supabase.from("ai_conversations").insert({ organization_id: ctx.orgId, user_id: ctx.userId, title: message.slice(0, 60) }).select("id").single();
      if (error || !c) throw new Error("conversation");
      convId = c.id as string;
    }
    const { data: hist } = await supabase.from("ai_messages").select("role,content").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(6);
    const history: ChatMessage[] = (hist ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const answer = await chat([
      { role: "system", content: `${SYSTEM_PROMPT}\n\nDATA (JSON, summarized from the user's own organization):\n${JSON.stringify(sections)}` },
      ...history, { role: "user", content: message },
    ]);

    await supabase.from("ai_messages").insert([
      { organization_id: ctx.orgId, conversation_id: convId, role: "user", content: message },
      { organization_id: ctx.orgId, conversation_id: convId, role: "assistant", content: answer, supporting_data: sections },
    ]);
    return NextResponse.json({ answer, conversationId: convId, supporting: sections, remaining });
  } catch {
    // The provider failed: do not charge the allowance for a request that produced no answer.
    try {
      const admin = createAdminClient();
      const { data: last } = await admin.from("usage_records").select("id").eq("organization_id", ctx.orgId).eq("user_id", ctx.userId).eq("kind", "ai_request").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (last) await admin.from("usage_records").delete().eq("id", last.id);
    } catch { /* best effort */ }
    return NextResponse.json({ error: "The AI service could not answer right now. Your allowance was not used. Please try again." }, { status: 502 });
  }
}
