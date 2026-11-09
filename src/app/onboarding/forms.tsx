"use client";

import { useActionState } from "react";
import { addFirstItemAction, addLocationAction, createOrgAction, finishOnboardingAction } from "./actions";
import { Button, Field, FormMessage, Input, Select } from "@/components/ui";
import { ORG_TYPES, type ActionState } from "@/lib/validation";

type A = (s: ActionState, fd: FormData) => Promise<ActionState>;
function useForm(a: A) {
  const [state, action, pending] = useActionState(a, undefined);
  return { state, action, pending, e: state?.fieldErrors ?? {} };
}

export function OrgForm({ defaults }: { defaults: { name: string; type: string; country: string } }) {
  const { state, action, pending, e } = useForm(createOrgAction);
  return (
    <form action={action} className="space-y-4">
      <FormMessage error={state?.error} />
      <Field label="Organization name" error={e.name}><Input name="name" defaultValue={defaults.name} required /></Field>
      <Field label="Organization type" error={e.type}>
        <Select name="type" defaultValue={defaults.type || "other"}>
          {ORG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Country" error={e.country}><Input name="country" defaultValue={defaults.country} /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create organization"}</Button>
    </form>
  );
}

export function LocationForm() {
  const { state, action, pending, e } = useForm(addLocationAction);
  return (
    <form action={action} className="space-y-4">
      <FormMessage error={state?.error} />
      <Field label="Location name" error={e.name} hint="For example: Main Pharmacy, Central Warehouse, Ward 3 Store.">
        <Input name="name" required />
      </Field>
      <Field label="Type" error={e.kind}>
        <Select name="kind" defaultValue="facility">
          <option value="facility">Facility</option><option value="branch">Branch</option>
          <option value="warehouse">Warehouse</option><option value="department">Department</option>
        </Select>
      </Field>
      <Field label="Address (optional)" error={e.address}><Input name="address" /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add location"}</Button>
    </form>
  );
}

export function ItemForm() {
  const { state, action, pending, e } = useForm(addFirstItemAction);
  return (
    <form action={action} className="space-y-4">
      <FormMessage error={state?.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" error={e.name}><Input name="name" required /></Field>
        <Field label="SKU / product code" error={e.sku}><Input name="sku" /></Field>
        <Field label="Unit of measure" error={e.unit}><Input name="unit" defaultValue="box" /></Field>
        <Field label="Quantity on hand" error={e.quantity}><Input name="quantity" type="number" min="0" step="any" defaultValue="0" /></Field>
        <Field label="Minimum stock level" error={e.minStock}><Input name="minStock" type="number" min="0" step="any" defaultValue="0" /></Field>
        <Field label="Unit cost" error={e.unitCost}><Input name="unitCost" type="number" min="0" step="any" defaultValue="0" /></Field>
        <Field label="Expiration date (optional)" error={e.expirationDate}><Input name="expirationDate" type="date" /></Field>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add item"}</Button>
    </form>
  );
}

export function AlertsForm() {
  const { state, action, pending, e } = useForm(finishOnboardingAction);
  return (
    <form action={action} className="space-y-4">
      <FormMessage error={state?.error} />
      <Field label="Warn me about expiry this many days ahead" error={e.expiryWarningDays}>
        <Input name="expiryWarningDays" type="number" min="1" max="365" defaultValue="30" />
      </Field>
      <Field label="Flag consumption above this multiple of normal usage" error={e.unusualFactor} hint="2 means twice the usual daily usage.">
        <Input name="unusualFactor" type="number" min="1" max="10" step="0.1" defaultValue="2" />
      </Field>
      <p className="text-sm text-slate-600">Low-stock alerts use each product's minimum stock level. You can change all of this later in Settings.</p>
      <Button type="submit" disabled={pending}>{pending ? "Finishing…" : "Finish and open dashboard"}</Button>
    </form>
  );
}
