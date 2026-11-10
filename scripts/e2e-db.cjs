const fs = require("fs");
const path = require("path");
// Run from the project root: node scripts/e2e-db.cjs (needs .env.local; creates and deletes temporary test users)
const root = process.cwd();
const { createClient } = require(path.join(root, "node_modules/@supabase/supabase-js"));
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, extra = "") => { results.push([ok ? "PASS" : "FAIL", name, extra]); };
const stamp = Date.now();
const pw = "Test-Passw0rd-" + stamp;

async function mkUser(tag) {
  const email = `e2e-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: "E2E " + tag, org_name: "E2E Org " + tag, org_type: "pharmacy", country: "Nigeria" } });
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

    const { data: prof } = await A.c.from("profiles").select("full_name,signup_org_name,signup_org_type").eq("id", A.id).single();
    check("profile created by trigger from signup data", prof?.full_name === "E2E a" && prof?.signup_org_type === "pharmacy");

    const { data: orgA, error: eo } = await A.c.rpc("create_organization", { p_name: "E2E Org A", p_type: "pharmacy", p_country: "Nigeria" });
    check("create organization", !!orgA && !eo, eo?.message);
    const { data: orgB } = await B.c.rpc("create_organization", { p_name: "E2E Org B", p_type: "hospital", p_country: "Kenya" });
    const { error: dup } = await A.c.rpc("create_organization", { p_name: "Again", p_type: "other", p_country: "" });
    check("second organization for same user is refused", !!dup);

    const { data: loc, error: el } = await A.c.from("locations").insert({ organization_id: orgA, name: "Main Store" }).select("id").single();
    check("owner adds first location", !!loc && !el, el?.message);
    const { error: el2 } = await A.c.from("locations").insert({ organization_id: orgA, name: "Second Store" });
    check("Starter/no plan blocked from a 2nd location (backend)", !!el2 && /allows/.test(el2.message), el2?.message);

    const { data: item, error: ei } = await A.c.from("inventory_items").insert({ organization_id: orgA, name: "Paracetamol 500mg", sku: "PARA-500", unit: "box", min_stock: 10, unit_cost: 2.5, location_id: loc.id, expiration_date: new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10) }).select("id").single();
    check("create item", !!item && !ei, ei?.message);
    const { error: eq0 } = await A.c.from("inventory_items").insert({ organization_id: orgA, name: "Sneaky", quantity: 99 });
    check("cannot insert item with stock bypassing movements", !!eq0);

    const mv = async (c, type, q, reason) => c.rpc("apply_stock_movement", { p_item: item.id, p_type: type, p_quantity: q, p_reason: reason ?? null });
    check("opening stock movement", !(await mv(A.c, "initial", 50, "Opening")).error);
    const over = await mv(A.c, "consumption", 51);
    check("consuming more than available is rejected", !!over.error && /Insufficient/.test(over.error.message), over.error?.message);
    check("adjustment without reason is rejected", !!(await mv(A.c, "adjustment_out", 1)).error);
    check("zero quantity rejected", !!(await mv(A.c, "consumption", 0)).error);
    check("valid consumption", !(await mv(A.c, "consumption", 45)).error);
    const direct = await A.c.from("inventory_items").update({ quantity: 1000 }).eq("id", item.id);
    check("direct quantity edit is blocked", !!direct.error, direct.error?.message);
    const { data: it2 } = await A.c.from("inventory_items").select("quantity").eq("id", item.id).single();
    check("quantity is 5 after movements", Number(it2.quantity) === 5, String(it2.quantity));
    const { data: mvs } = await A.c.from("inventory_movements").select("id").eq("item_id", item.id);
    check("movement history recorded (2 rows)", mvs?.length === 2, String(mvs?.length));

    const { data: n } = await A.c.rpc("generate_alerts", { p_org: orgA });
    const { data: al } = await A.c.from("inventory_alerts").select("type").eq("organization_id", orgA).is("resolved_at", null);
    const types = (al ?? []).map((a) => a.type);
    check("alerts: low stock + approaching expiry generated", types.includes("low_stock") && types.includes("approaching_expiry"), types.join(","));

    // Isolation
    const { data: seen } = await B.c.from("inventory_items").select("id").eq("organization_id", orgA);
    check("org B cannot read org A items", (seen ?? []).length === 0);
    const { data: seenOrg } = await B.c.from("organizations").select("id").eq("id", orgA);
    check("org B cannot read org A organization row", (seenOrg ?? []).length === 0);
    check("org B cannot move org A stock", !!(await mv(B.c, "adjustment_in", 5, "attack")).error);
    const upd = await B.c.from("inventory_items").update({ name: "hacked" }).eq("id", item.id).select();
    check("org B cannot rename org A item", (upd.data ?? []).length === 0);
    const ins = await B.c.from("inventory_items").insert({ organization_id: orgA, name: "Injected" });
    check("org B cannot insert into org A", !!ins.error);
    const { data: ga } = await B.c.rpc("generate_alerts", { p_org: orgA });
    check("org B cannot run alerts for org A", ga === null);

    // Plan gates
    const sup = await A.c.from("suppliers").insert({ organization_id: orgA, name: "Acme Pharma" });
    check("supplier creation blocked without Professional (backend)", !!sup.error && /Professional/.test(sup.error.message), sup.error?.message);
    const ai0 = await A.c.rpc("consume_ai_request", { p_org: orgA });
    check("AI usage blocked without active subscription", !!ai0.error);
    const selfSub = await A.c.from("subscriptions").update({ plan: "professional", status: "active" }).eq("organization_id", orgA).select();
    check("user cannot self-activate a subscription", (selfSub.data ?? []).length === 0);

    // Activate Professional as the (future) webhook would, with the service role
    await admin.from("subscriptions").update({ plan: "professional", status: "active", current_period_end: new Date(Date.now() + 30 * 864e5).toISOString() }).eq("organization_id", orgA);
    const loc2 = await A.c.from("locations").insert({ organization_id: orgA, name: "Warehouse" });
    check("Professional can add a 2nd location", !loc2.error, loc2.error?.message);
    const { data: s1, error: es } = await A.c.from("suppliers").insert({ organization_id: orgA, name: "Acme Pharma" }).select("id").single();
    check("Professional can add a supplier", !!s1 && !es, es?.message);

    const { data: po, error: ep } = await A.c.rpc("create_purchase_order", { p_org: orgA, p_supplier: s1.id, p_location: loc.id, p_expected: new Date().toISOString().slice(0, 10), p_notes: "e2e", p_is_request: false, p_lines: [{ item_id: item.id, quantity: 20, unit_cost: 2.5 }] });
    check("create purchase order", !!po && !ep, ep?.message);
    const { data: q1 } = await A.c.from("inventory_items").select("quantity").eq("id", item.id).single();
    check("stock unchanged by creating an order", Number(q1.quantity) === 5);
    check("cannot receive a draft order", !!(await A.c.rpc("receive_purchase_order", { p_po: po, p_lines: [] })).error);
    check("draft -> approved is not allowed", !!(await A.c.rpc("set_po_status", { p_po: po, p_status: "approved" })).error);
    check("submit for approval", !(await A.c.rpc("set_po_status", { p_po: po, p_status: "pending_approval" })).error);
    check("owner approves", !(await A.c.rpc("set_po_status", { p_po: po, p_status: "approved" })).error);
    check("mark ordered", !(await A.c.rpc("set_po_status", { p_po: po, p_status: "ordered" })).error);
    const { data: lines } = await A.c.from("purchase_order_items").select("id").eq("purchase_order_id", po);
    check("over-receiving rejected", !!(await A.c.rpc("receive_purchase_order", { p_po: po, p_lines: [{ line_id: lines[0].id, quantity: 21 }] })).error);
    check("partial receipt", !(await A.c.rpc("receive_purchase_order", { p_po: po, p_lines: [{ line_id: lines[0].id, quantity: 8 }] })).error);
    const { data: q2 } = await A.c.from("inventory_items").select("quantity").eq("id", item.id).single();
    check("stock rose only by received quantity (5 -> 13)", Number(q2.quantity) === 13, String(q2.quantity));
    check("final receipt", !(await A.c.rpc("receive_purchase_order", { p_po: po, p_lines: [{ line_id: lines[0].id, quantity: 12 }] })).error);
    const { data: poRow } = await A.c.from("purchase_orders").select("status").eq("id", po).single();
    check("order status is received", poRow.status === "received", poRow.status);
    check("B cannot see A's purchase order", ((await B.c.from("purchase_orders").select("id").eq("id", po)).data ?? []).length === 0);
    const perf = await A.c.rpc("report_supplier_performance", { p_org: orgA });
    check("supplier performance report works", !perf.error && perf.data?.length === 1 && Number(perf.data[0].on_time_orders) === 1, perf.error?.message);
    check("B cannot read A's reports", ((await B.c.rpc("report_category_stock", { p_org: orgA })).data ?? []).length === 0);

    const ai1 = await A.c.rpc("consume_ai_request", { p_org: orgA });
    check("AI allowance decrements (500 -> 499 left)", ai1.data === 499, JSON.stringify(ai1));
    await admin.from("plan_limits").update({ monthly_ai_requests: 2 }).eq("plan", "professional");
    const ai2 = await A.c.rpc("consume_ai_request", { p_org: orgA });
    const ai3 = await A.c.rpc("consume_ai_request", { p_org: orgA });
    check("AI limit enforced at configured allowance", !ai2.error && !!ai3.error && /allowance/i.test(ai3.error.message), ai3.error?.message);
    await admin.from("plan_limits").update({ monthly_ai_requests: 500 }).eq("plan", "professional");

    const un = await createClient(URL, ANON, { auth: { persistSession: false } }).from("inventory_items").select("id");
    check("anonymous visitor sees no inventory", (un.data ?? []).length === 0);
  } catch (e) {
    results.push(["FAIL", "script error", e.message || JSON.stringify(e)]);
  } finally {
    for (const id of created) await admin.auth.admin.deleteUser(id);
    // orgs are owned by deleted users; remove leftovers
    await admin.from("organizations").delete().like("name", "E2E Org%");
  }
  for (const r of results) console.log(r.join(" | "));
  const failed = results.filter((r) => r[0] === "FAIL").length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
})();

