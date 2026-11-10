// Transparent demand forecasting. Every figure is derived from recorded consumption movements
// with simple, explainable arithmetic. These are ESTIMATES, never confirmed inventory figures.

export type Confidence = "insufficient" | "low" | "medium" | "high";
export type Risk = "high" | "medium" | "low" | "unknown";

export type ConsumptionStats = {
  consumed: number;            // total units consumed in the window
  firstHalf: number;           // units consumed in the older half of the window
  secondHalf: number;          // units consumed in the newer half
  firstConsumption: string;    // date (YYYY-MM-DD) of the earliest consumption in the window
  events: number;              // number of consumption records
};

export type ForecastOptions = {
  windowDays: number;          // history window used when gathering stats (default 90)
  leadTimeDays: number;        // supplier lead time assumption
  safetyDays: number;          // safety buffer
  coverDays: number;           // how many days of demand each reorder should cover
  now?: Date;
};

export const DEFAULT_OPTIONS: ForecastOptions = { windowDays: 90, leadTimeDays: 14, safetyDays: 7, coverDays: 30 };

export type Forecast = {
  confidence: Confidence;
  historyDays: number;
  avgDailyUsage: number | null;
  recentDailyUsage: number | null;
  trendPct: number | null;
  daysRemaining: number | null;
  forecast30d: number | null;
  reorderPoint: number | null;
  recommendedReorder: number | null;
  stockoutRisk: Risk;
  note: string;
};

const DAY = 86_400_000;
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function confidenceFor(historyDays: number, events: number): Confidence {
  if (events < 3 || historyDays < 14) return "insufficient";
  if (historyDays < 30 || events < 6) return "low";
  if (historyDays < 60) return "medium";
  return "high";
}

export function forecastItem(quantity: number, stats: ConsumptionStats | null, opts: Partial<ForecastOptions> = {}): Forecast {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const now = o.now ?? new Date();
  if (!stats || stats.events === 0) {
    return { confidence: "insufficient", historyDays: 0, avgDailyUsage: null, recentDailyUsage: null, trendPct: null, daysRemaining: null, forecast30d: null, reorderPoint: null, recommendedReorder: null, stockoutRisk: "unknown", note: "No consumption recorded yet. Record usage to enable forecasting." };
  }
  const first = Date.parse(stats.firstConsumption + "T00:00:00Z");
  const historyDays = Math.min(o.windowDays, Math.max(1, Math.floor((now.getTime() - first) / DAY) + 1));
  const confidence = confidenceFor(historyDays, stats.events);
  if (confidence === "insufficient") {
    return { confidence, historyDays, avgDailyUsage: null, recentDailyUsage: null, trendPct: null, daysRemaining: null, forecast30d: null, reorderPoint: null, recommendedReorder: null, stockoutRisk: "unknown", note: "Not enough history yet (needs at least 14 days and 3 usage records)." };
  }

  const avg = stats.consumed / historyDays;
  const half = o.windowDays / 2;
  let trend: number | null = null;
  let recent = avg;
  if (historyDays >= 28) {
    const older = stats.firstHalf / half;
    recent = stats.secondHalf / half;
    trend = older > 0 ? ((recent - older) / older) * 100 : null;
  }
  const rate = recent > 0 ? recent : avg;
  const daysRemaining = rate > 0 ? quantity / rate : null;
  const reorderPoint = rate * (o.leadTimeDays + o.safetyDays);
  const recommended = Math.max(0, Math.ceil(rate * (o.leadTimeDays + o.coverDays) - quantity));
  let risk: Risk = "low";
  if (daysRemaining !== null) {
    if (daysRemaining <= o.leadTimeDays) risk = "high";
    else if (daysRemaining <= o.leadTimeDays + o.safetyDays + 7) risk = "medium";
  }
  return {
    confidence, historyDays, avgDailyUsage: round(avg), recentDailyUsage: round(recent),
    trendPct: trend === null ? null : round(trend, 1), daysRemaining: daysRemaining === null ? null : round(daysRemaining, 1),
    forecast30d: round(rate * 30, 1), reorderPoint: round(reorderPoint, 1), recommendedReorder: recommended, stockoutRisk: risk,
    note: confidence === "low" ? "Limited history: treat this estimate with caution." : "",
  };
}
