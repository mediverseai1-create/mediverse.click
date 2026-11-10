"use server";

import { revalidatePath } from "next/cache";
import { authed, friendly } from "@/lib/action";
import { CHUNK, MAX_ROWS, normalizeForServer, validateAll, type ImportRow, type RowIssue } from "@/lib/import";

export async function startImportAction(fileName: string, fileHash: string, total: number): Promise<{ jobId?: string; error?: string }> {
  const { ctx, supabase } = await authed();
  if (!/^[a-f0-9]{64}$/.test(fileHash)) return { error: "Invalid file fingerprint." };
  if (!Number.isInteger(total) || total < 1 || total > MAX_ROWS) return { error: `Files must contain between 1 and ${MAX_ROWS} rows.` };
  const { data, error } = await supabase.from("import_jobs").insert({
    organization_id: ctx.orgId, file_name: fileName.slice(0, 200), file_hash: fileHash, status: "processing", total_rows: total, created_by: ctx.userId,
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return { error: "This exact file has already been imported (or is importing now). Importing it again would create duplicates." };
    return { error: friendly(error.message, "Could not start the import.") };
  }
  return { jobId: data.id };
}

export async function importChunkAction(jobId: string, rows: ImportRow[]): Promise<{ imported: number; errors: RowIssue[]; error?: string }> {
  const { ctx, supabase } = await authed();
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > CHUNK) return { imported: 0, errors: [], error: "Invalid batch." };
  const { data: job } = await supabase.from("import_jobs").select("id,status").eq("id", jobId).eq("organization_id", ctx.orgId).maybeSingle();
  if (!job || job.status !== "processing") return { imported: 0, errors: [], error: "Import job not found or already finished." };

  // The server never trusts the browser: validate again before touching the database.
  const clean = rows.map((r) => ({ ...r, _row: Number(r._row) }));
  const { valid, issues } = validateAll(clean);
  if (valid.length === 0) return { imported: 0, errors: issues };
  const { data, error } = await supabase.rpc("import_items", { p_org: ctx.orgId, p_rows: valid.map(normalizeForServer) });
  if (error) return { imported: 0, errors: issues, error: friendly(error.message, "A batch failed to import.") };
  const res = data as { imported: number; errors: RowIssue[] };
  return { imported: res.imported, errors: [...issues, ...res.errors] };
}

export async function finishImportAction(jobId: string, imported: number, errors: RowIssue[]): Promise<void> {
  const { ctx, supabase } = await authed();
  await supabase.from("import_jobs").update({
    status: imported > 0 || errors.length === 0 ? "completed" : "failed",
    imported_rows: imported, failed_rows: errors.length, errors: errors.slice(0, 1000), completed_at: new Date().toISOString(),
  }).eq("id", jobId).eq("organization_id", ctx.orgId);
  await supabase.from("audit_logs").insert({ organization_id: ctx.orgId, user_id: ctx.userId, action: "inventory.import", entity_type: "import_job", entity_id: jobId, details: { imported, failed: errors.length } });
  revalidatePath("/dashboard", "layout");
}
