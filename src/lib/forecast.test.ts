import { describe, expect, it } from "vitest";
import { confidenceFor, forecastItem } from "./forecast";

const now = new Date("2026-06-30T12:00:00Z");

describe("confidence", () => {
  it("grades data quality", () => {
    expect(confidenceFor(10, 20)).toBe("insufficient");
    expect(confidenceFor(40, 2)).toBe("insufficient");
    expect(confidenceFor(20, 10)).toBe("low");
    expect(confidenceFor(45, 10)).toBe("medium");
    expect(confidenceFor(90, 30)).toBe("high");
  });
});

describe("forecastItem", () => {
  it("refuses to forecast without history", () => {
    const f = forecastItem(100, null, { now });
    expect(f.confidence).toBe("insufficient");
    expect(f.daysRemaining).toBeNull();
    expect(f.recommendedReorder).toBeNull();
  });

  it("does not invent numbers for thin data", () => {
    const f = forecastItem(50, { consumed: 30, firstHalf: 0, secondHalf: 30, firstConsumption: "2026-06-25", events: 2 }, { now });
    expect(f.confidence).toBe("insufficient");
    expect(f.avgDailyUsage).toBeNull();
  });

  it("computes average daily usage and days remaining", () => {
    // 90-day history, 180 units => 2/day. Stock 40 => 20 days. Flat trend.
    const f = forecastItem(40, { consumed: 180, firstHalf: 90, secondHalf: 90, firstConsumption: "2026-04-01", events: 40 }, { now });
    expect(f.confidence).toBe("high");
    expect(f.avgDailyUsage).toBe(2);
    expect(f.daysRemaining).toBe(20);
    expect(f.trendPct).toBe(0);
    expect(f.forecast30d).toBe(60);
  });

  it("detects rising demand and uses the recent rate", () => {
    // older half 45 units (1/day), recent half 135 units (3/day) => +200%
    const f = forecastItem(60, { consumed: 180, firstHalf: 45, secondHalf: 135, firstConsumption: "2026-04-01", events: 40 }, { now });
    expect(f.trendPct).toBe(200);
    expect(f.recentDailyUsage).toBe(3);
    expect(f.daysRemaining).toBe(20);
  });

  it("recommends a reorder covering lead time plus cover period", () => {
    // 2/day * (14 + 30) = 88, minus stock 40 => 48
    const f = forecastItem(40, { consumed: 180, firstHalf: 90, secondHalf: 90, firstConsumption: "2026-04-01", events: 40 }, { now });
    expect(f.recommendedReorder).toBe(48);
    expect(f.reorderPoint).toBe(42);
  });

  it("never recommends negative quantities and flags stockout risk", () => {
    const rich = forecastItem(1000, { consumed: 180, firstHalf: 90, secondHalf: 90, firstConsumption: "2026-04-01", events: 40 }, { now });
    expect(rich.recommendedReorder).toBe(0);
    expect(rich.stockoutRisk).toBe("low");
    const poor = forecastItem(10, { consumed: 180, firstHalf: 90, secondHalf: 90, firstConsumption: "2026-04-01", events: 40 }, { now });
    expect(poor.stockoutRisk).toBe("high");
  });
});
