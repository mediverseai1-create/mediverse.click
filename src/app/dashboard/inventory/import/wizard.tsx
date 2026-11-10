"use client";

import { useState } from "react";
import Papa from "papaparse";
import { Button, Card, Select } from "@/components/ui";
import { CHUNK, IMPORT_FIELDS, MAX_BYTES, MAX_ROWS, applyMapping, guessMapping, validateAll, type FieldKey, type ImportRow, type Mapping, type RowIssue } from "@/lib/import";
import { finishImportAction, importChunkAction, startImportAction } from "./actions";

type Raw = Record<string, unknown>;
type Step = "upload" | "map" | "review" | "importing" | "done";

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function parseFile(file: File, buf: ArrayBuffer): Promise<{ columns: string[]; rows: Raw[] }> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    const text = new TextDecoder().decode(buf).replace(/^﻿/, "");
    const r = Papa.parse<Raw>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
    return { columns: (r.meta.fields ?? []).filter(Boolean), rows: r.data };
  }
  const { readSheet } = await import("read-excel-file/browser");
  const sheet = await readSheet(new File([buf], file.name));
  const [head, ...body] = sheet;
  const columns = head.map((h) => String(h ?? "").trim());
  const rows = body.filter((r) => r.some((c) => c !== null && c !== "")).map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
  return { columns: columns.filter(Boolean), rows };
}

export function ImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string>();
  const [file, setFile] = useState<{ name: string; hash: string }>();
  const [columns, setColumns] = useState<string[]>([]);
  const [raw, setRaw] = useState<Raw[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<{ imported: number; issues: RowIssue[] }>();

  async function onFile(f: File | undefined) {
    setError(undefined);
    if (!f) return;
    if (!/\.(csv|xlsx)$/i.test(f.name)) return setError("Please choose a .csv or .xlsx file.");
    if (f.size > MAX_BYTES) return setError("This file is larger than 5 MB. Split it into smaller files.");
    try {
      const buf = await f.arrayBuffer();
      const { columns, rows } = await parseFile(f, buf);
      if (columns.length === 0 || rows.length === 0) return setError("No data rows were found. The first row must contain column headings.");
      if (rows.length > MAX_ROWS) return setError(`This file has ${rows.length} rows. The limit is ${MAX_ROWS} per import.`);
      setFile({ name: f.name, hash: await sha256(buf) });
      setColumns(columns); setRaw(rows); setMapping(guessMapping(columns)); setStep("map");
    } catch {
      setError("We could not read that file. Check that it is a valid CSV or Excel (.xlsx) file.");
    }
  }

  const rows: ImportRow[] = raw.map((r, i) => applyMapping(r, mapping, i + 2));
  const { valid, issues } = step === "review" || step === "map" ? validateAll(rows) : { valid: [], issues: [] };

  async function run() {
    if (!file) return;
    setStep("importing"); setError(undefined); setProgress(0);
    const start = await startImportAction(file.name, file.hash, rows.length);
    if (!start.jobId) { setError(start.error); return setStep("review"); }
    let imported = 0;
    const all: RowIssue[] = [...issues];
    for (let i = 0; i < valid.length; i += CHUNK) {
      const res = await importChunkAction(start.jobId, valid.slice(i, i + CHUNK));
      if (res.error) all.push({ row: 0, message: res.error });
      imported += res.imported; all.push(...res.errors);
      setProgress(Math.min(100, Math.round(((i + CHUNK) / Math.max(1, valid.length)) * 100)));
    }
    await finishImportAction(start.jobId, imported, all);
    setSummary({ imported, issues: all.sort((a, b) => a.row - b.row) });
    setStep("done");
  }

  function downloadErrors() {
    const csv = ["Row,Problem", ...(summary?.issues ?? []).map((i) => `${i.row},"${i.message.replace(/"/g, '""')}"`)].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "import-errors.csv"; a.click();
  }

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {step === "upload" && (
        <Card>
          <h2 className="text-lg font-semibold">1. Upload your spreadsheet</h2>
          <p className="mb-4 mt-1 text-sm text-slate-600">CSV or Excel (.xlsx), up to {MAX_ROWS} rows and 5 MB. The first row must be column headings. <a href="/dashboard/inventory/import/template" className="font-medium text-teal-600 underline">Download the sample template</a>.</p>
          <input type="file" accept=".csv,.xlsx" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Spreadsheet file" className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-navy file:px-4 file:py-2 file:text-white" />
          <p className="mt-3 text-xs text-slate-500">Do not include patient-identifiable information. Dates must be written as YYYY-MM-DD.</p>
        </Card>
      )}

      {step === "map" && (
        <Card>
          <h2 className="text-lg font-semibold">2. Match your columns</h2>
          <p className="mb-4 mt-1 text-sm text-slate-600">{file?.name}: {raw.length} rows found. Choose which column holds each field. Only the product name is required.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map((f) => (
              <label key={f.key} className="text-sm"><span className="mb-1 block font-medium">{f.label}{"required" in f && f.required ? " *" : ""}</span>
                <Select value={mapping[f.key as FieldKey] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}>
                  <option value="">Not in my file</option>{columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select></label>
            ))}
          </div>
          <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr>{IMPORT_FIELDS.filter((f) => mapping[f.key]).map((f) => <th key={f.key} className="pr-3">{f.label}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 5).map((r) => <tr key={r._row} className="border-t border-slate-100">{IMPORT_FIELDS.filter((f) => mapping[f.key]).map((f) => <td key={f.key} className="py-1 pr-3">{r[f.key]}</td>)}</tr>)}</tbody></table></div>
          <div className="mt-5 flex gap-2"><Button variant="secondary" onClick={() => setStep("upload")}>Back</Button><Button disabled={!mapping.name} onClick={() => setStep("review")}>Validate rows</Button></div>
          {!mapping.name && <p className="mt-2 text-xs text-red-600">Choose the column that holds the product name.</p>}
        </Card>
      )}

      {step === "review" && (
        <Card>
          <h2 className="text-lg font-semibold">3. Review and confirm</h2>
          <p className="mt-1 text-sm text-slate-600"><strong className="text-teal-600">{valid.length}</strong> row(s) are ready. <strong className={issues.length ? "text-red-600" : ""}>{issues.length}</strong> problem(s) found.
            Rows with problems will not be imported, and they are listed in your summary so you can fix and re-import them.</p>
          {issues.length > 0 && (
            <ul className="mt-3 max-h-56 overflow-y-auto rounded border border-slate-200 text-sm">
              {issues.slice(0, 200).map((i, k) => <li key={k} className="border-b border-slate-100 px-3 py-1.5 last:border-0"><span className="font-medium">Row {i.row}:</span> {i.message}</li>)}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">Opening quantities are recorded as stock movements. Locations and suppliers named in the file must already exist.</p>
          <div className="mt-5 flex gap-2"><Button variant="secondary" onClick={() => setStep("map")}>Back</Button><Button disabled={valid.length === 0} onClick={run}>Import {valid.length} item(s)</Button></div>
        </Card>
      )}

      {step === "importing" && (
        <Card><h2 className="text-lg font-semibold">Importing…</h2>
          <div className="mt-3 h-2 overflow-hidden rounded bg-slate-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-teal transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 text-sm text-slate-500">Please keep this page open.</p></Card>
      )}

      {step === "done" && summary && (
        <Card>
          <h2 className="text-lg font-semibold">Import summary</h2>
          <p className="mt-2 text-sm"><strong className="text-teal-600">{summary.imported}</strong> item(s) imported. <strong className={summary.issues.length ? "text-red-600" : ""}>{summary.issues.length}</strong> problem(s).</p>
          {summary.issues.length > 0 && (<>
            <ul className="mt-3 max-h-56 overflow-y-auto rounded border border-slate-200 text-sm">{summary.issues.slice(0, 200).map((i, k) => <li key={k} className="border-b border-slate-100 px-3 py-1.5 last:border-0"><span className="font-medium">Row {i.row}:</span> {i.message}</li>)}</ul>
            <Button variant="secondary" className="mt-3" onClick={downloadErrors}>Download problems as CSV</Button></>)}
          <div className="mt-5"><a href="/dashboard/inventory" className="inline-flex h-10 items-center rounded bg-teal px-4 text-sm font-medium text-white">View inventory</a></div>
        </Card>
      )}
    </div>
  );
}
