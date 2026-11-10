// Pure business rules (unit-tested). Dates are handled as UTC calendar days.

export type StockStatus = "out" | "low" | "ok";
export type ExpiryBucket = "expired" | "7d" | "30d" | "90d" | "later" | "none";

const DAY = 86_400_000;

export function toDay(d: string | Date): number {
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00Z" : d) : d;
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY);
}

export function daysUntil(expiry: string | null | undefined, now: Date = new Date()): number | null {
  if (!expiry) return null;
  return toDay(expiry) - toDay(now);
}

export function expiryBucket(expiry: string | null | undefined, now: Date = new Date()): ExpiryBucket {
  const d = daysUntil(expiry, now);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= 7) return "7d";
  if (d <= 30) return "30d";
  if (d <= 90) return "90d";
  return "later";
}

export function stockStatus(quantity: number, minStock: number): StockStatus {
  if (quantity <= 0) return "out";
  if (minStock > 0 && quantity <= minStock) return "low";
  return "ok";
}

export function itemValue(quantity: number, unitCost: number): number {
  return Math.round(quantity * unitCost * 100) / 100;
}

/** Validates a stock operation the same way the database does, for friendly UI errors. */
export function validateMovement(current: number, type: string, quantity: number, reason?: string): string | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return "Quantity must be greater than zero";
  const outgoing = ["consumption", "adjustment_out", "transfer_out", "expired_writeoff"].includes(type);
  const needsReason = ["adjustment_in", "adjustment_out", "expired_writeoff"].includes(type);
  if (needsReason && !reason?.trim()) return "A reason is required for adjustments and write-offs";
  if (outgoing && quantity > current) return `Insufficient stock: ${current} available, ${quantity} requested`;
  return null;
}

export function onTimeRate(received: number, onTime: number): number | null {
  return received > 0 ? Math.round((onTime / received) * 100) : null;
}

export function inventoryHealth(total: number, low: number, out: number, expiring: number, expired: number): number | null {
  if (total === 0) return null;
  const bad = new Set<number>();
  // Each product counts once as "needing attention" at most; this is a simple share-based score.
  const attention = Math.min(total, low + out + expiring + expired);
  bad.add(attention);
  return Math.round(((total - attention) / total) * 100);
}
