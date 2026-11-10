import { ActionForm } from "@/components/app/action-form";
import { Field, Input, Select } from "@/components/ui";
import type { ActionState } from "@/lib/validation";

type Opt = { id: string; name: string };
type Item = {
  name?: string; sku?: string | null; description?: string | null; unit?: string; min_stock?: number; unit_cost?: number;
  selling_price?: number | null; batch_number?: string | null; expiration_date?: string | null;
  supplier_id?: string | null; location_id?: string | null; categoryName?: string;
};

export function ItemForm({ action, item, suppliers, locations, categories, creating }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  item?: Item; suppliers: Opt[]; locations: Opt[]; categories: Opt[]; creating?: boolean;
}) {
  return (
    <ActionForm action={action} submit={creating ? "Create item" : "Save changes"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name"><Input name="name" defaultValue={item?.name} required /></Field>
        <Field label="SKU / product code"><Input name="sku" defaultValue={item?.sku ?? ""} /></Field>
        <Field label="Category" hint="Pick an existing category or type a new one.">
          <Input name="categoryName" list="cats" defaultValue={item?.categoryName ?? ""} />
          <datalist id="cats">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </Field>
        <Field label="Unit of measure"><Input name="unit" defaultValue={item?.unit ?? "unit"} required /></Field>
        <Field label="Supplier">
          <Select name="supplierId" defaultValue={item?.supplier_id ?? ""}>
            <option value="">None</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Storage location">
          <Select name="locationId" defaultValue={item?.location_id ?? ""}>
            <option value="">None</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        {creating && <Field label="Opening quantity" hint="Recorded as an opening stock movement."><Input name="quantity" type="number" min="0" step="any" defaultValue="0" /></Field>}
        <Field label="Minimum stock level"><Input name="minStock" type="number" min="0" step="any" defaultValue={item?.min_stock ?? 0} /></Field>
        <Field label="Unit purchase cost"><Input name="unitCost" type="number" min="0" step="any" defaultValue={item?.unit_cost ?? 0} /></Field>
        <Field label="Selling price (optional)"><Input name="sellingPrice" type="number" min="0" step="any" defaultValue={item?.selling_price ?? ""} /></Field>
        <Field label="Batch / lot number"><Input name="batchNumber" defaultValue={item?.batch_number ?? ""} /></Field>
        <Field label="Expiration date"><Input name="expirationDate" type="date" defaultValue={item?.expiration_date ?? ""} /></Field>
      </div>
      <Field label="Description"><Input name="description" defaultValue={item?.description ?? ""} /></Field>
    </ActionForm>
  );
}
