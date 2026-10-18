import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("matches mind-maps list and editor routes", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const listMatches = router.matchRoutes("/mind-maps");
    expect(listMatches.at(-1)?.routeId).not.toBe(rootRouteId);

    const editorMatches = router.matchRoutes("/mind-maps/test-map-id");
    expect(editorMatches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
