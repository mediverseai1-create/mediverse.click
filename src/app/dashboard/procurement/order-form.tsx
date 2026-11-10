"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/app/action-form";
import { Button, Field, Input, Select } from "@/components/ui";
import { createOrderAction } from "./actions";

type Opt = { id: string; name: string; unit_cost?: number };

export function OrderForm({ items, suppliers, locations, suggested }: { items: Opt[]; suppliers: Opt[]; locations: Opt[]; suggested?: { id: string; qty: number }[] }) {
  const [rows, setRows] = useState<{ id: string; qty: string; cost: string }[]>(
    suggested?.length ? suggested.map((s) => ({ id: s.id, qty: String(s.qty), cost: String(items.find((i) => i.id === s.id)?.unit_cost ?? 0) })) : [{ id: "", qty: "1", cost: "0" }]);
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <ActionForm action={createOrderAction} submit="Create as draft">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type"><Select name="kind" defaultValue="order"><option value="order">Purchase order</option><option value="request">Purchase request</option></Select></Field>
        <Field label="Supplier"><Select name="supplier_id" defaultValue=""><option value="">Select a supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Deliver to"><Select name="location_id" defaultValue=""><option value="">No specific location</option>{locations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Expected delivery date"><Input name="expected_delivery" type="date" /></Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Products</legend>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_100px_auto] items-end gap-2">
            <Select name="item_id" value={r.id} onChange={(e) => update(i, { id: e.target.value, cost: String(items.find((x) => x.id === e.target.value)?.unit_cost ?? 0) })} aria-label="Product" required>
              <option value="">Select product</option>{items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input name="quantity" type="number" min="0" step="any" value={r.qty} onChange={(e) => update(i, { qty: e.target.value })} aria-label="Quantity" />
            <Input name="unit_cost" type="number" min="0" step="any" value={r.cost} onChange={(e) => update(i, { cost: e.target.value })} aria-label="Unit cost" />
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} className="p-2 text-slate-500 hover:text-red-600 disabled:opacity-30" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={() => setRows([...rows, { id: "", qty: "1", cost: "0" }])}><Plus className="h-4 w-4" />Add product</Button>
      </fieldset>
      <Field label="Notes"><Input name="notes" /></Field>
    </ActionForm>
  );
}
