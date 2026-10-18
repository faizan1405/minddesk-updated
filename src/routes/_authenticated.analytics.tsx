import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Flame,
  Repeat,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertCircle,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  useAnalyticsQuery,
  type AnalyticsRange,
  type ProductivityAnalyticsResult,
} from "@/lib/analytics";
import { useSettings } from "@/hooks/use-settings";
import { LoadingState, ErrorState } from "@/components/app/PageStates";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Productivity Analytics — MindDesk" },
      {
        name: "description",
        content: "Real-time task velocity, focus hours, habit consistency, and trends.",
      },
      { property: "og:title", content: "Productivity Analytics — MindDesk" },
      {
        property: "og:description",
        content: "Real-time task velocity, focus hours, habit consistency, and trends.",
      },
    ],
  }),
  component: ProductivityAnalyticsPage,
});

function formatMinutes(min: number): string {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function ProductivityAnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const prefs = useSettings();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data, isPending, error, refetch } = useAnalyticsQuery(range, prefs.time_zone);

  if (isPending) return <LoadingState />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Couldn't load productivity analytics"}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8 space-y-8">
      {/* Page Header with Time Range Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Productivity Analytics
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Calculated from your real task completions, focus timer sessions, and habit consistency.
          </p>
        </div>

        {/* Period Selector & Timezone Info */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border bg-card p-1 text-xs shadow-sm">
            {(["7d", "30d", "90d"] as const).map((r) => {
              const label =
                r === "7d" ? "Last 7 Days" : r === "30d" ? "Last 30 Days" : "Last 90 Days";
              const active = range === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 font-medium transition-all duration-150",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div
            className="hidden items-center gap-1.5 rounded-xl border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground lg:inline-flex"
            title={`Timezone: ${data.dateRange.timeZone}`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>{data.dateRange.timeZone}</span>
          </div>
        </div>
      </div>

      {/* Top 5 Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Metric 1: Tasks Completed */}
        <MetricCard
          title="Tasks Completed"
          icon={CheckCircle2}
          value={String(data.metrics.tasksCompleted.current)}
          unit="tasks"
          comparison={data.metrics.tasksCompleted}
          subtext={`vs ${data.metrics.tasksCompleted.previous} in prev ${range}`}
          accentColor="emerald"
        />

        {/* Metric 2: Remaining & Overdue */}
        <div className="flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-sm transition-all hover:border-primary/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Remaining & Overdue
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {data.metrics.tasksRemaining}
              </span>
              <span className="text-xs text-muted-foreground">active</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {data.metrics.tasksOverdue > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-500">
                  <AlertCircle className="h-3 w-3" />
                  {data.metrics.tasksOverdue} overdue
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" />0 overdue
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {data.metrics.completionRatio}% period velocity ratio
          </p>
        </div>

        {/* Metric 3: Focus Time */}
        <MetricCard
          title="Recorded Focus"
          icon={Clock}
          value={formatMinutes(data.metrics.focusTimeMinutes.current)}
          comparison={data.metrics.focusTimeMinutes}
          subtext={`${data.metrics.focusSessionsCount.current} sessions recorded`}
          accentColor="amber"
        />

        {/* Metric 4: Habit Completion Rate */}
        <div className="flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-sm transition-all hover:border-primary/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Habit Completion
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500">
              <Repeat className="h-4 w-4" />
            </div>
          </div>
          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {data.metrics.habitCompletionRate.current !== null
                  ? `${data.metrics.habitCompletionRate.current}%`
                  : "—"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {data.metrics.habitCompletionRate.percentageChange !== null ? (
                <TrendBadge
                  direction={data.metrics.habitCompletionRate.direction}
                  change={data.metrics.habitCompletionRate.percentageChange}
                />
              ) : (
                <span className="text-xs text-muted-foreground">No prior history</span>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {data.metrics.habitCompletionRate.completedDays} of{" "}
            {data.metrics.habitCompletionRate.scheduledDays} scheduled days
          </p>
        </div>

        {/* Metric 5: Current Habit Streaks */}
        <div className="flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-sm transition-all hover:border-primary/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Best Active Streak
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
              <Flame className="h-4 w-4" />
            </div>
          </div>
          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {data.metrics.habitStreaks.maxCurrentStreak}
              </span>
              <span className="text-xs text-muted-foreground">days streak</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                <Sparkles className="h-3 w-3" />
                {data.metrics.habitStreaks.habitsWithActiveStreak} active habits
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Across {data.metrics.habitStreaks.activeHabitsCount} tracked habits
          </p>
        </div>
      </div>

      {/* Main Charts Row 1: Task Completion Bar Chart & Focus Time Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Task Completion Bar Chart */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Task Completion Velocity</h2>
              <p className="text-xs text-muted-foreground">Daily tasks completed within {range}</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
              {data.metrics.tasksCompleted.current} Total Completed
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            {!mounted ? (
              <ChartSkeleton />
            ) : data.metrics.tasksCompleted.current === 0 ? (
              <EmptyChartState
                icon={CheckCircle2}
                title="No completed tasks in this period"
                description="When you complete tasks in My Tasks, your daily completion velocity will plot here."
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.charts.dailyTimeline}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <XAxis
                    dataKey="label"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval={range === "7d" ? 0 : range === "30d" ? 4 : 10}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--accent) / 0.15)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0]?.payload;
                      if (!pt) return null;
                      return (
                        <div className="rounded-xl border bg-card p-3 shadow-md text-xs space-y-1">
                          <p className="font-semibold text-foreground">
                            {pt.dayOfWeek}, {pt.label}
                          </p>
                          <p className="text-emerald-500 font-medium">
                            {pt.tasksCompleted} task{pt.tasksCompleted === 1 ? "" : "s"} completed
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="tasksCompleted"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={range === "7d" ? 36 : 14}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Focus Time Trend Chart */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Focus Time Trend</h2>
              <p className="text-xs text-muted-foreground">Recorded deep work minutes over time</p>
            </div>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500">
              {formatMinutes(data.metrics.focusTimeMinutes.current)} Total
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            {!mounted ? (
              <ChartSkeleton />
            ) : data.metrics.focusTimeMinutes.current === 0 ? (
              <EmptyChartState
                icon={Clock}
                title="No focus time recorded in this period"
                description="Start a focus timer in Plan Your Day to automatically record deep work sessions."
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.charts.dailyTimeline}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="focusGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval={range === "7d" ? 0 : range === "30d" ? 4 : 10}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0]?.payload;
                      if (!pt) return null;
                      return (
                        <div className="rounded-xl border bg-card p-3 shadow-md text-xs space-y-1">
                          <p className="font-semibold text-foreground">
                            {pt.dayOfWeek}, {pt.label}
                          </p>
                          <p className="text-amber-500 font-medium">
                            {formatMinutes(pt.focusMinutes)} focus recorded
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="focusMinutes"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#focusGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Main Charts Row 2: Completed vs Remaining & Habit Consistency Across Week */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Completed vs Remaining Tasks Donut */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Task Status Distribution</h2>
              <p className="text-xs text-muted-foreground">
                Period completions compared to backlog & overdue tasks
              </p>
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {!mounted ? (
              <ChartSkeleton />
            ) : data.metrics.totalTasks === 0 ? (
              <EmptyChartState
                icon={Layers}
                title="No tasks in your workspace"
                description="Add tasks and task lists to see your completion and backlog breakdown."
              />
            ) : (
              <div className="flex h-full w-full flex-col sm:flex-row items-center justify-around gap-4">
                <div className="relative h-48 w-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          {
                            name: "Completed in Period",
                            value: data.charts.taskStatusDistribution.completed,
                            color: "#10b981",
                          },
                          {
                            name: "Remaining On Track",
                            value: data.charts.taskStatusDistribution.remaining,
                            color: "#6366f1",
                          },
                          {
                            name: "Overdue Backlog",
                            value: data.charts.taskStatusDistribution.overdue,
                            color: "#ef4444",
                          },
                        ].filter((d) => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {[
                          { name: "Completed in Period", color: "#10b981" },
                          { name: "Remaining On Track", color: "#6366f1" },
                          { name: "Overdue Backlog", color: "#ef4444" },
                        ].map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0];
                          if (!d) return null;
                          return (
                            <div className="rounded-xl border bg-card p-2.5 shadow-md text-xs">
                              <span className="font-medium text-foreground">{d.name}: </span>
                              <span className="font-bold">{d.value}</span>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold">
                      {data.metrics.tasksCompleted.current}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Done
                    </span>
                  </div>
                </div>

                {/* Legend list */}
                <div className="space-y-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-muted-foreground">Completed in period:</span>
                    <span className="font-semibold text-foreground">
                      {data.charts.taskStatusDistribution.completed}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-indigo-500 shrink-0" />
                    <span className="text-muted-foreground">Remaining on track:</span>
                    <span className="font-semibold text-foreground">
                      {data.charts.taskStatusDistribution.remaining}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-rose-500 shrink-0" />
                    <span className="text-muted-foreground">Overdue backlog:</span>
                    <span className="font-semibold text-foreground">
                      {data.charts.taskStatusDistribution.overdue}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Habit Consistency Across the Week */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Habit Consistency Across the Week
              </h2>
              <p className="text-xs text-muted-foreground">
                Completion percentage by weekday (Monday – Sunday)
              </p>
            </div>
            <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-xs font-medium text-teal-500">
              {data.metrics.habitCompletionRate.current ?? 0}% Avg
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            {!mounted ? (
              <ChartSkeleton />
            ) : data.metrics.habitStreaks.activeHabitsCount === 0 ? (
              <EmptyChartState
                icon={Repeat}
                title="No habits configured"
                description="Create habits in Habits & Routines to view day-of-week consistency patterns."
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.charts.weekdayConsistency}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <XAxis
                    dataKey="dayName"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--accent) / 0.15)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0]?.payload;
                      if (!pt) return null;
                      return (
                        <div className="rounded-xl border bg-card p-3 shadow-md text-xs space-y-1">
                          <p className="font-semibold text-foreground">{pt.dayName}</p>
                          <p className="text-teal-500 font-medium">
                            {pt.rate}% consistency ({pt.completed} of {pt.scheduled} scheduled)
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="rate" fill="#14b8a6" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Habit Consistency Heatmap & Streak Leaderboard */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Habit Consistency Heatmap</h2>
            <p className="text-xs text-muted-foreground">
              Daily habit completion intensity across your selected {range} window
            </p>
          </div>
          {/* Heatmap Legend */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Low</span>
            <span className="h-3 w-3 rounded-sm bg-muted/60" title="0% or Off" />
            <span className="h-3 w-3 rounded-sm bg-teal-500/25" title="1-49%" />
            <span className="h-3 w-3 rounded-sm bg-teal-500/50" title="50-79%" />
            <span className="h-3 w-3 rounded-sm bg-teal-500/80" title="80-99%" />
            <span className="h-3 w-3 rounded-sm bg-teal-500" title="100%" />
            <span>High</span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="overflow-x-auto pb-2">
          <div className="inline-grid grid-flow-col grid-rows-7 gap-1.5">
            {data.charts.dailyTimeline.map((pt) => {
              let tileCls = "bg-muted/40 text-muted-foreground";
              if (pt.habitsScheduled === 0) {
                tileCls = "bg-muted/30 border border-border/40";
              } else if (pt.habitRate === 100) {
                tileCls = "bg-teal-500 text-white font-medium";
              } else if (pt.habitRate && pt.habitRate >= 80) {
                tileCls = "bg-teal-500/80 text-white";
              } else if (pt.habitRate && pt.habitRate >= 50) {
                tileCls = "bg-teal-500/50 text-foreground";
              } else if (pt.habitRate && pt.habitRate > 0) {
                tileCls = "bg-teal-500/25 text-foreground";
              } else {
                tileCls = "bg-muted/60 text-muted-foreground";
              }

              return (
                <div
                  key={pt.date}
                  className={cn(
                    "group relative flex h-7 w-7 items-center justify-center rounded-md text-[10px] transition-transform duration-150 hover:scale-110 hover:z-10 cursor-default",
                    tileCls,
                  )}
                  title={`${pt.dayOfWeek}, ${pt.label}: ${
                    pt.habitsScheduled > 0
                      ? `${pt.habitsCompleted}/${pt.habitsScheduled} completed (${pt.habitRate}%)`
                      : "No scheduled habits"
                  }`}
                >
                  {pt.date.slice(-2)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Streak Leaderboard */}
        {data.metrics.habitStreaks.streakList.length > 0 && (
          <div className="pt-2 border-t">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Habit Streak Leaderboard
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.metrics.habitStreaks.streakList.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded-xl border bg-background/50 px-3.5 py-2.5 text-xs shadow-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          h.color === "teal"
                            ? "#14b8a6"
                            : h.color === "green"
                              ? "#10b981"
                              : h.color === "blue"
                                ? "#3b82f6"
                                : h.color === "amber"
                                  ? "#f59e0b"
                                  : h.color === "red"
                                    ? "#ef4444"
                                    : "#8b5cf6",
                      }}
                    />
                    <span className="font-medium text-foreground truncate">{h.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 font-semibold text-orange-500">
                      <Flame className="h-3.5 w-3.5" />
                      {h.currentStreak}d
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      (Best: {h.bestStreak}d)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Weekly Productivity Summary */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Weekly Productivity Summary</h2>
          <p className="text-xs text-muted-foreground">
            Aggregated weekly review across tasks, focus hours, and habits
          </p>
        </div>

        <div className="divide-y divide-border/60">
          {data.charts.weeklySummary.map((w, idx) => (
            <div
              key={w.weekKey || idx}
              className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between text-xs"
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-foreground">{w.label}</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-muted-foreground">
                <div>
                  Tasks: <span className="font-semibold text-foreground">{w.tasksCompleted}</span>
                </div>
                <div>
                  Focus: <span className="font-semibold text-foreground">{w.focusHours}h</span>
                </div>
                <div>
                  Habit Rate:{" "}
                  <span className="font-semibold text-foreground">
                    {w.habitRate !== null ? `${w.habitRate}%` : "—"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Subcomponents
function MetricCard({
  title,
  icon: Icon,
  value,
  unit,
  comparison,
  subtext,
  accentColor,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  unit?: string;
  comparison: { percentageChange: number; direction: "up" | "down" | "neutral" };
  subtext: string;
  accentColor: "emerald" | "amber" | "blue" | "teal" | "violet";
}) {
  const iconColor =
    accentColor === "emerald"
      ? "bg-emerald-500/10 text-emerald-500"
      : accentColor === "amber"
        ? "bg-amber-500/10 text-amber-500"
        : accentColor === "teal"
          ? "bg-teal-500/10 text-teal-500"
          : "bg-blue-500/10 text-blue-500";

  return (
    <div className="flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-sm transition-all hover:border-primary/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl", iconColor)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="my-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-foreground">{value}</span>
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <TrendBadge direction={comparison.direction} change={comparison.percentageChange} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{subtext}</p>
    </div>
  );
}

function TrendBadge({
  direction,
  change,
}: {
  direction: "up" | "down" | "neutral";
  change: number;
}) {
  if (direction === "up") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500">
        <TrendingUp className="h-3 w-3" />+{change}%
      </span>
    );
  }
  if (direction === "down") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-500">
        <TrendingDown className="h-3 w-3" />-{change}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
      <Minus className="h-3 w-3" />
      0%
    </span>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function EmptyChartState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-center p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground mb-2">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground max-w-xs mt-1">{description}</p>
    </div>
  );
}
