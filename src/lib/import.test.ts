import { describe, expect, it } from "vitest";
import { applyMapping, guessMapping, normalizeForServer, validateAll, validateRow, type ImportRow } from "./import";

const row = (o: Partial<ImportRow>, n = 2): ImportRow => ({ _row: n, ...o });

describe("column mapping", () => {
  it("guesses common spreadsheet headers", () => {
    const m = guessMapping(["Item Name", "Item Code", "Qty", "Min Level", "Cost", "Expiry Date"]);
    expect(m.name).toBe("Item Name");
    expect(m.sku).toBe("Item Code");
    expect(m.quantity).toBe("Qty");
    expect(m.expiration_date).toBe("Expiry Date");
    expect(m.unit_cost).toBe("Cost");
  });
  it("does not map one column twice", () => {
    const m = guessMapping(["Product name"]);
    expect(Object.values(m).filter((v) => v === "Product name")).toHaveLength(1);
  });
  it("applies a mapping and formats dates", () => {
    const r = applyMapping({ A: "Gauze", B: 5, C: new Date("2027-01-31T00:00:00Z") }, { name: "A", quantity: "B", expiration_date: "C" }, 7);
    expect(r).toMatchObject({ _row: 7, name: "Gauze", quantity: "5", expiration_date: "2027-01-31" });
  });
});

describe("row validation", () => {
  it("accepts a good row", () => {
    expect(validateRow(row({ name: "Gauze", quantity: "10", unit_cost: "1.5", expiration_date: "2027-02-28" }))).toEqual([]);
  });
  it("flags missing names, bad numbers and negatives", () => {
    expect(validateRow(row({ name: "" }))).toContain("Product name is missing");
    expect(validateRow(row({ name: "x", quantity: "abc" }))[0]).toMatch(/not a number/);
    expect(validateRow(row({ name: "x", unit_cost: "-1" }))[0]).toMatch(/negative/);
  });
  it("flags impossible or badly formatted dates", () => {
    expect(validateRow(row({ name: "x", expiration_date: "2027-02-30" }))[0]).toMatch(/real date/);
    expect(validateRow(row({ name: "x", expiration_date: "31/03/2027" }))[0]).toMatch(/YYYY-MM-DD/);
  });
  it("accepts thousands separators", () => {
    expect(validateRow(row({ name: "x", quantity: "1,200" }))).toEqual([]);
    expect(normalizeForServer(row({ name: "x", quantity: "1,200" })).quantity).toBe(1200);
  });
});

describe("whole-file validation", () => {
  it("reports every bad row and duplicate SKUs without dropping silently", () => {
    const { valid, issues } = validateAll([
      row({ name: "A", sku: "S1" }, 2), row({ name: "", sku: "S2" }, 3), row({ name: "B", sku: "s1" }, 4),
    ]);
    expect(valid.map((r) => r._row)).toEqual([2]);
    expect(issues.map((i) => i.row)).toEqual([3, 4]);
    expect(issues[1].message).toMatch(/Duplicate SKU/);
  });
});
