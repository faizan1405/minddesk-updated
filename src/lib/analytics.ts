import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AnalyticsRange, ProductivityAnalyticsResult } from "@/lib/server/analytics-calc";

export type {
  AnalyticsRange,
  TrendDirection,
  MetricComparison,
  DailyProductivityPoint,
  WeeklyProductivityPoint,
  WeekdayConsistency,
  HabitStreakSummary,
  ProductivityAnalyticsResult,
} from "@/lib/server/analytics-calc";

export const analyticsKey = (range: AnalyticsRange, timeZone?: string) =>
  ["analytics", range, timeZone ?? "default"] as const;

export function useAnalyticsQuery(range: AnalyticsRange = "30d", timeZone?: string) {
  return useQuery({
    queryKey: analyticsKey(range, timeZone),
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set("range", range);
      if (timeZone) sp.set("tz", timeZone);
      return api<ProductivityAnalyticsResult>(`/api/analytics?${sp.toString()}`);
    },
    staleTime: 60 * 1000,
  });
}
