export const money = (n: number | null | undefined, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n ?? 0);

export const num = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n ?? 0);

export const dateStr = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? d + "T00:00:00Z" : d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

export const dateTimeStr = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
