// Run from the project root: node scripts/e2e-phase5-6.cjs
// Needs .env.local and SQL migrations 1-5 applied. Creates temporary users/orgs and deletes them at the end.
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const { createClient } = require(path.join(root, "node_modules/@supabase/supabase-js"));
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, extra = "") => results.push([ok ? "PASS" : "FAIL", name, ok ? "" : extra]);
const stamp = Date.now();
const pw = "Test-Passw0rd-" + stamp;

async function mkUser(tag) {
  const email = `e2e6-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "E2E " + tag } });
  if (error) throw error;
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password: pw });
  if (e2) throw e2;
  return { id: data.user.id, email, c };
}

(async () => {
  const created = [];
  try {
    const A = await mkUser("a"); created.push(A.id);
    const B = await mkUser("b"); created.push(B.id);
    const C = await mkUser("c"); created.push(C.id);
    const { data: orgA } = await A.c.rpc("create_organization", { p_name: "E2E6 Org A", p_type: "pharmacy", p_country: "Ghana" });
    const { data: orgB } = await B.c.rpc("create_organization", { p_name: "E2E6 Org B", p_type: "clinic", p_country: "Kenya" });
    check("organizations created", !!orgA && !!orgB);

    // ---------- Import ----------
    const rows = [
      { _row: 2, name: "Gauze", sku: "G1", quantity: 10, unit_cost: 1.5, category: "Consumables" },
      { _row: 3, name: "Syringe", sku: "S1", quantity: 0, category: "consumables" },
      { _row: 4, name: "Duplicate gauze", sku: "G1" },
      { _row: 5, name: "Bad location", location: "Nowhere" },
      { _row: 6, name: "Bad date", expiration_date: "2027-13-45" },
    ];
    const imp = await A.c.rpc("import_items", { p_org: orgA, p_rows: rows });
    check("import: valid rows imported (2)", imp.data?.imported === 2, JSON.stringify(imp));
    const errRows = (imp.data?.errors ?? []).map((e) => e.row).sort().join(",");
    check("import: every bad row reported with its row number (4,5,6)", errRows === "4,5,6", errRows);
    check("import: duplicate SKU reported, not silently dropped", (imp.data?.errors ?? []).some((e) => e.row === 4 && /Duplicate SKU/.test(e.message)));
    const { data: cats } = await A.c.from("inventory_categories").select("name").eq("organization_id", orgA);
    check("import: category matched case-insensitively (one category)", (cats ?? []).length === 1, JSON.stringify(cats));
    const { data: gauze } = await A.c.from("inventory_items").select("id,quantity").eq("organization_id", orgA).eq("sku", "G1").single();
    const { data: mv } = await A.c.from("inventory_movements").select("type,quantity_after").eq("item_id", gauze.id);
    check("import: opening stock recorded as an 'import' movement", mv?.length === 1 && mv[0].type === "import" && Number(gauze.quantity) === 10);
    const imp2 = await B.c.rpc("import_items", { p_org: orgA, p_rows: [{ name: "Attack" }] });
    check("import: another organization cannot import into mine", !!imp2.error);
    const hash = "a".repeat(64);
    const j1 = await A.c.from("import_jobs").insert({ organization_id: orgA, file_name: "x.csv", file_hash: hash, status: "processing", total_rows: 1 }).select("id").single();
    const j2 = await A.c.from("import_jobs").insert({ organization_id: orgA, file_name: "x.csv", file_hash: hash, status: "processing", total_rows: 1 });
    check("import: same file cannot be imported twice", !!j1.data && j2.error?.code === "23505", j2.error?.message);

    // ---------- Anonymous access ----------
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const an = await anon.rpc("apply_stock_movement", { p_item: gauze.id, p_type: "adjustment_in", p_quantity: 5, p_reason: "x" });
    check("anonymous visitors cannot call stock functions", !!an.error && /permission denied|not allowed|Item not found/i.test(an.error.message), an.error?.message);
    const an2 = await anon.rpc("activate_subscription", { p_org: orgA, p_plan: "professional", p_days: 30, p_provider: "x", p_reference: "x" });
    check("anonymous visitors cannot activate subscriptions", !!an2.error);

    // ---------- Payment verification ----------
    const ai0 = await A.c.rpc("consume_ai_request", { p_org: orgA });
    check("no AI before payment", ai0.error?.code === "P0002", ai0.error?.message);
    const self = await A.c.rpc("activate_subscription", { p_org: orgA, p_plan: "professional", p_days: 30, p_provider: "x", p_reference: "x" });
    check("a customer cannot call activate_subscription", !!self.error);
    const self2 = await A.c.rpc("review_payment_claim", { p_claim: "00000000-0000-0000-0000-000000000000", p_approve: true, p_note: null, p_reviewer: "me", p_days: 30 });
    check("a customer cannot approve their own claim", !!self2.error);
    const claim = await A.c.rpc("submit_payment_claim", { p_org: orgA, p_plan: "starter", p_reference: "SELAR-TEST-" + stamp, p_email: A.email });
    check("owner submits a payment claim", !!claim.data && !claim.error, claim.error?.message);
    const { data: sub1 } = await A.c.from("subscriptions").select("status,plan").eq("organization_id", orgA).single();
    check("claim shows 'pending' but grants no plan", sub1.status === "pending" && sub1.plan === null, JSON.stringify(sub1));
    const ai1 = await A.c.rpc("consume_ai_request", { p_org: orgA });
    check("still no AI while payment is unverified", !!ai1.error);
    const dupe = await A.c.rpc("submit_payment_claim", { p_org: orgA, p_plan: "starter", p_reference: ("selar-test-" + stamp).toUpperCase(), p_email: A.email });
    check("same payment reference cannot be used twice", !!dupe.error, dupe.error?.message);
    const dupeB = await B.c.rpc("submit_payment_claim", { p_org: orgB, p_plan: "professional", p_reference: "SELAR-TEST-" + stamp, p_email: B.email });
    check("another org cannot reuse someone else's payment reference", !!dupeB.error);
    check("other orgs cannot see my claims", ((await B.c.from("payment_claims").select("id").eq("organization_id", orgA)).data ?? []).length === 0);
    const tamper = await A.c.from("payment_claims").update({ status: "approved" }).eq("id", claim.data).select();
    check("customer cannot approve a claim by editing it", (tamper.data ?? []).length === 0);

    const approve = await admin.rpc("review_payment_claim", { p_claim: claim.data, p_approve: true, p_note: "e2e", p_reviewer: "test", p_days: 30 });
    check("platform approval activates the plan", !approve.error, approve.error?.message);
    const { data: sub2 } = await A.c.from("subscriptions").select("status,plan,current_period_end").eq("organization_id", orgA).single();
    const days = (new Date(sub2.current_period_end) - Date.now()) / 864e5;
    check("subscription active on Starter for ~30 days", sub2.status === "active" && sub2.plan === "starter" && days > 29 && days <= 30.01, JSON.stringify(sub2));
    const reapprove = await admin.rpc("review_payment_claim", { p_claim: claim.data, p_approve: true, p_note: null, p_reviewer: "test", p_days: 30 });
    check("a claim cannot be approved twice", !!reapprove.error);

    // ---------- AI usage ----------
    let lastErr, okCount = 0;
    for (let i = 0; i < 7; i++) { const r = await A.c.rpc("consume_ai_request", { p_org: orgA }); if (r.error) { lastErr = r.error; break; } okCount++; }
    check("AI works after payment, then rate limit stops burst at 6/minute", okCount === 6 && lastErr?.code === "P0005", `${okCount} ${lastErr?.code}`);
    const conv = await A.c.from("ai_conversations").insert({ organization_id: orgA, user_id: A.id, title: "t" }).select("id").single();
    const msg = await A.c.from("ai_messages").insert({ organization_id: orgA, conversation_id: conv.data.id, role: "user", content: "secret question" });
    check("user can save their own AI messages", !msg.error, msg.error?.message);
    const forged = await B.c.from("ai_messages").insert({ organization_id: orgA, conversation_id: conv.data.id, role: "user", content: "forged" });
    check("others cannot write into my conversation", !!forged.error);
    check("others cannot read my AI messages", ((await B.c.from("ai_messages").select("id").eq("conversation_id", conv.data.id)).data ?? []).length === 0);

    // ---------- Team ----------
    const inv = await A.c.from("organization_invitations").insert({ organization_id: orgA, email: C.email, role: "staff" }).select("token").single();
    check("owner creates an invitation", !!inv.data, inv.error?.message);
    const wrong = await B.c.rpc("accept_invitation", { p_token: inv.data.token });
    check("invitation cannot be used by a different email", !!wrong.error);
    const asOwner = await A.c.from("organization_invitations").insert({ organization_id: orgA, email: "x@example.com", role: "owner" });
    check("cannot invite someone as owner", !!asOwner.error);
    const acc = await C.c.rpc("accept_invitation", { p_token: inv.data.token });
    check("invited person joins as staff", !acc.error && acc.data === orgA, acc.error?.message);
    const reuse = await C.c.rpc("accept_invitation", { p_token: inv.data.token });
    check("invitation cannot be reused", !!reuse.error);
    const { data: team } = await A.c.rpc("list_org_members", { p_org: orgA });
    check("team list shows 2 members with emails", team?.length === 2 && team.every((m) => m.email), JSON.stringify(team?.length));
    check("outsiders cannot list my team", ((await B.c.rpc("list_org_members", { p_org: orgA })).data ?? []).length === 0);
    check("staff cannot add a location (admin-only)", !!(await C.c.from("locations").insert({ organization_id: orgA, name: "Staff loc" })).error);
    check("staff cannot create invitations", !!(await C.c.from("organization_invitations").insert({ organization_id: orgA, email: "y@example.com", role: "staff" })).error);
    check("staff cannot change roles", !!(await C.c.rpc("set_member_role", { p_org: orgA, p_user: C.id, p_role: "owner" })).error);
    check("staff cannot remove the owner", !!(await C.c.rpc("remove_member", { p_org: orgA, p_user: A.id })).error);
    check("staff cannot approve purchases (needs Professional first anyway)", !!(await C.c.rpc("set_po_status", { p_po: "00000000-0000-0000-0000-000000000000", p_status: "approved" })).error);
    check("staff can record stock", !(await C.c.rpc("apply_stock_movement", { p_item: gauze.id, p_type: "consumption", p_quantity: 1 })).error);
    check("owner promotes staff to admin", !(await A.c.rpc("set_member_role", { p_org: orgA, p_user: C.id, p_role: "admin" })).error);
    check("admin cannot change roles (owner only)", !!(await C.c.rpc("set_member_role", { p_org: orgA, p_user: C.id, p_role: "owner" })).error);
    check("admin can add a location", !(await C.c.from("locations").insert({ organization_id: orgA, name: "Admin loc" })).error);
    check("last owner cannot be demoted", !!(await A.c.rpc("set_member_role", { p_org: orgA, p_user: A.id, p_role: "staff" })).error);
    check("owner cannot be removed", !!(await A.c.rpc("remove_member", { p_org: orgA, p_user: A.id })).error);
    check("owner removes a member", !(await A.c.rpc("remove_member", { p_org: orgA, p_user: C.id })).error);
    check("removed member loses all access", ((await C.c.from("inventory_items").select("id").eq("organization_id", orgA)).data ?? []).length === 0);

    // ---------- Upgrade, expiry and webhook plumbing ----------
    const c2 = await A.c.rpc("submit_payment_claim", { p_org: orgA, p_plan: "professional", p_reference: "UPG-" + stamp, p_email: A.email });
    await admin.rpc("review_payment_claim", { p_claim: c2.data, p_approve: true, p_note: null, p_reviewer: "test", p_days: 30 });
    const { data: sub3 } = await A.c.from("subscriptions").select("plan,status").eq("organization_id", orgA).single();
    check("upgrade to Professional after verified payment", sub3.plan === "professional" && sub3.status === "active");
    check("Professional unlocks suppliers", !(await A.c.from("suppliers").insert({ organization_id: orgA, name: "Sup" })).error);
    await admin.rpc("set_subscription_status", { p_org: orgA, p_status: "expired" });
    const sup2 = await A.c.from("suppliers").insert({ organization_id: orgA, name: "Sup2" });
    check("expired subscription loses Professional features (backend)", !!sup2.error && /Professional/.test(sup2.error.message), sup2.error?.message);
    check("expired subscription loses AI", !!(await A.c.rpc("consume_ai_request", { p_org: orgA })).error);
    const found = await admin.rpc("find_org_for_email", { p_email: A.email.toUpperCase() });
    check("webhook can match a customer's org by email (service only)", found.data === orgA, JSON.stringify(found));
    check("customers cannot look up orgs by email", !!(await A.c.rpc("find_org_for_email", { p_email: A.email })).error);
    const e1 = await admin.from("payment_events").insert({ provider: "e2e", event_id: "evt-" + stamp, event_type: "payment_succeeded", payload: {} });
    const e2 = await admin.from("payment_events").insert({ provider: "e2e", event_id: "evt-" + stamp, event_type: "payment_succeeded", payload: {} });
    check("duplicate webhook events are rejected (idempotency)", !e1.error && e2.error?.code === "23505");
    check("customers cannot read payment events", ((await A.c.from("payment_events").select("id")).data ?? []).length === 0);
    await admin.from("payment_events").delete().eq("provider", "e2e");
  } catch (e) {
    results.push(["FAIL", "script error", e.message || JSON.stringify(e)]);
  } finally {
    for (const id of created) await admin.auth.admin.deleteUser(id);
    await admin.from("organizations").delete().like("name", "E2E6 Org%");
  }
  for (const r of results) console.log(r.join(" | "));
  const failed = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
})();
