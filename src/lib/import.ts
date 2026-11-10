// Spreadsheet import rules shared by the browser preview and the server (the server re-validates every row).

export const IMPORT_FIELDS = [
  { key: "name", label: "Product name", required: true, hints: ["name", "product", "item", "description of goods", "product name", "item name"] },
  { key: "sku", label: "SKU / product code", hints: ["sku", "code", "product code", "item code", "barcode"] },
  { key: "category", label: "Category", hints: ["category", "type", "group"] },
  { key: "unit", label: "Unit of measure", hints: ["unit", "uom", "measure", "pack"] },
  { key: "quantity", label: "Quantity on hand", hints: ["quantity", "qty", "stock", "on hand", "balance"] },
  { key: "min_stock", label: "Minimum stock level", hints: ["min", "minimum", "reorder level", "reorder point", "par"] },
  { key: "unit_cost", label: "Unit purchase cost", hints: ["cost", "unit cost", "purchase price", "buying price", "price"] },
  { key: "selling_price", label: "Selling price", hints: ["selling", "sale price", "retail"] },
  { key: "supplier", label: "Supplier (must already exist)", hints: ["supplier", "vendor"] },
  { key: "location", label: "Location (must already exist)", hints: ["location", "branch", "warehouse", "store"] },
  { key: "batch_number", label: "Batch / lot number", hints: ["batch", "lot"] },
  { key: "expiration_date", label: "Expiration date (YYYY-MM-DD)", hints: ["expiry", "expiration", "exp date", "expire", "best before"] },
  { key: "description", label: "Description", hints: ["details", "notes", "description"] },
] as const;

export type FieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type Mapping = Partial<Record<FieldKey, string>>;
export type ImportRow = Partial<Record<FieldKey, string>> & { _row: number };

export const MAX_ROWS = 5000;
export const MAX_BYTES = 5 * 1024 * 1024;
export const CHUNK = 200;

export function guessMapping(columns: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<string>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  for (const f of IMPORT_FIELDS) {
    const exact = columns.find((c) => !used.has(c) && (norm(c) === norm(f.label) || norm(c) === f.key.replace(/_/g, " ")));
    const hint = exact ?? columns.find((c) => !used.has(c) && f.hints.some((h) => norm(c) === h)) ?? columns.find((c) => !used.has(c) && f.hints.some((h) => norm(c).includes(h)));
    if (hint) { m[f.key] = hint; used.add(hint); }
  }
  return m;
}

export function applyMapping(raw: Record<string, unknown>, mapping: Mapping, rowNumber: number): ImportRow {
  const out: ImportRow = { _row: rowNumber };
  for (const f of IMPORT_FIELDS) {
    const col = mapping[f.key];
    if (!col) continue;
    const v = raw[col];
    out[f.key] = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
  }
  return out;
}

const NUMERIC: [FieldKey, string][] = [["quantity", "Quantity"], ["min_stock", "Minimum stock"], ["unit_cost", "Unit cost"], ["selling_price", "Selling price"]];

export function validateRow(row: ImportRow): string[] {
  const errors: string[] = [];
  if (!row.name?.trim()) errors.push("Product name is missing");
  else if (row.name.length > 200) errors.push("Product name is longer than 200 characters");
  for (const [k, label] of NUMERIC) {
    const v = row[k];
    if (v === undefined || v === "") continue;
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isFinite(n)) errors.push(`${label} "${v}" is not a number`);
    else if (n < 0) errors.push(`${label} cannot be negative`);
    else if (n > 1e9) errors.push(`${label} is too large`);
  }
  const d = row.expiration_date;
  if (d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d + "T00:00:00Z")) || new Date(d + "T00:00:00Z").toISOString().slice(0, 10) !== d)
      errors.push(`Expiration date "${d}" must be a real date written as YYYY-MM-DD`);
  }
  return errors;
}

/** Cleans numbers like "1,200" so the database receives plain numerals. */
export function normalizeForServer(row: ImportRow): Record<string, string | number> {
  const o: Record<string, string | number> = { _row: row._row };
  for (const f of IMPORT_FIELDS) {
    const v = row[f.key];
    if (v === undefined) continue;
    o[f.key] = NUMERIC.some(([k]) => k === f.key) && v !== "" ? Number(v.replace(/,/g, "")) : v;
  }
  return o;
}

export type RowIssue = { row: number; message: string };

/** Validates all rows, including duplicate SKUs within the file. */
export function validateAll(rows: ImportRow[]): { valid: ImportRow[]; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const valid: ImportRow[] = [];
  const seen = new Map<string, number>();
  for (const r of rows) {
    const errs = validateRow(r);
    const sku = r.sku?.trim().toLowerCase();
    if (sku) {
      const key = `${sku}|${(r.location ?? "").trim().toLowerCase()}`;
      if (seen.has(key)) errs.push(`Duplicate SKU "${r.sku}" (first used on row ${seen.get(key)})`);
      else seen.set(key, r._row);
    }
    if (errs.length) errs.forEach((m) => issues.push({ row: r._row, message: m }));
    else valid.push(r);
  }
  return { valid, issues };
}

export const TEMPLATE_CSV = [
  "Product name,SKU,Category,Unit,Quantity,Minimum stock,Unit cost,Selling price,Supplier,Location,Batch,Expiration date,Description",
  "Paracetamol 500mg tablets,PARA-500,Analgesics,box,120,40,2.50,3.75,,Main Store,B2024-17,2027-03-31,Pack of 100",
  "Examination gloves (M),GLV-M,Consumables,box,60,20,6.10,,,Main Store,,,Powder-free nitrile",
].join("\r\n") + "\r\n";
