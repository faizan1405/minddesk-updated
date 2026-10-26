import { describe, expect, it } from "vitest";
import { navGroupFor } from "@/components/app/MobileBottomNav";

describe("mobile bottom nav grouping", () => {
  it("task routes keep My Tasks active", () => {
    expect(navGroupFor("/tasks")).toBe("tasks");
    expect(navGroupFor("/starred")).toBe("tasks");
    expect(navGroupFor("/lists/abc")).toBe("tasks");
  });
  it("habits and notes routes map to their tabs", () => {
    expect(navGroupFor("/habits")).toBe("habits");
    expect(navGroupFor("/notes/p1")).toBe("notes");
  });
  it("everything else, including settings and profile, is More", () => {
    for (const p of [
      "/vault",
      "/projects/x/y",
      "/calendar",
      "/plan",
      "/mind-maps/m",
      "/analytics",
      "/templates",
      "/trash",
      "/settings",
      "/profile",
    ])
      expect(navGroupFor(p)).toBe("more");
  });
});
