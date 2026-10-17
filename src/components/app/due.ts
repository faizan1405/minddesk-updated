import { format, isPast, isThisYear, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";

export function dueLabel(d: string) {
  const date = parseISO(d);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";
  return format(date, isThisYear(date) ? "EEE, MMM d" : "MMM d, yyyy");
}

export function isOverdue(d: string) {
  const date = parseISO(d);
  return !isToday(date) && isPast(date);
}
