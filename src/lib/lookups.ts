import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getLookups(orgId: string) {
  const supabase = await createClient();
  const [s, l, c] = await Promise.all([
    supabase.from("suppliers").select("id,name").eq("organization_id", orgId).eq("is_archived", false).order("name"),
    supabase.from("locations").select("id,name").eq("organization_id", orgId).eq("is_archived", false).order("name"),
    supabase.from("inventory_categories").select("id,name").eq("organization_id", orgId).order("name"),
  ]);
  return { suppliers: s.data ?? [], locations: l.data ?? [], categories: c.data ?? [] };
}
