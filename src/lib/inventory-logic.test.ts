import { describe, expect, it } from "vitest";
import { daysUntil, expiryBucket, inventoryHealth, itemValue, onTimeRate, stockStatus, validateMovement } from "./inventory-logic";

const now = new Date("2026-06-15T10:00:00Z");

describe("expiry", () => {
  it("counts calendar days", () => {
    expect(daysUntil("2026-06-15", now)).toBe(0);
    expect(daysUntil("2026-06-22", now)).toBe(7);
    expect(daysUntil(null, now)).toBeNull();
  });
  it("buckets by period", () => {
    expect(expiryBucket("2026-06-14", now)).toBe("expired");
    expect(expiryBucket("2026-06-15", now)).toBe("7d");
    expect(expiryBucket("2026-06-22", now)).toBe("7d");
    expect(expiryBucket("2026-06-23", now)).toBe("30d");
    expect(expiryBucket("2026-07-15", now)).toBe("30d");
    expect(expiryBucket("2026-07-16", now)).toBe("90d");
    expect(expiryBucket("2026-09-13", now)).toBe("90d");
    expect(expiryBucket("2026-09-14", now)).toBe("later");
    expect(expiryBucket(undefined, now)).toBe("none");
  });
});

describe("stock", () => {
  it("classifies status", () => {
    expect(stockStatus(0, 5)).toBe("out");
    expect(stockStatus(5, 5)).toBe("low");
    expect(stockStatus(6, 5)).toBe("ok");
    expect(stockStatus(3, 0)).toBe("ok");
  });
  it("values stock", () => {
    expect(itemValue(3, 1.25)).toBe(3.75);
  });
  it("rejects invalid movements", () => {
    expect(validateMovement(10, "consumption", 0)).toMatch(/greater than zero/);
    expect(validateMovement(10, "consumption", 11)).toMatch(/Insufficient/);
    expect(validateMovement(10, "adjustment_out", 1)).toMatch(/reason/);
    expect(validateMovement(10, "adjustment_out", 1, "damaged")).toBeNull();
    expect(validateMovement(0, "purchase_receipt", 5)).toBeNull();
  });
});

describe("supplier and health metrics", () => {
  it("computes on-time rate", () => {
    expect(onTimeRate(0, 0)).toBeNull();
    expect(onTimeRate(4, 3)).toBe(75);
  });
  it("computes health", () => {
    expect(inventoryHealth(0, 0, 0, 0, 0)).toBeNull();
    expect(inventoryHealth(10, 2, 1, 1, 0)).toBe(60);
    expect(inventoryHealth(2, 5, 5, 5, 5)).toBe(0);
  });
});
