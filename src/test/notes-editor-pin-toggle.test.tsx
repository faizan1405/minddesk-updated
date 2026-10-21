import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { PageEditor } from "@/components/notes/PageEditor";
import { pageKey, pagesKey, type PageFull, type PageMeta } from "@/lib/pages";
import * as apiClient from "@/lib/api-client";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

let mockPageData: PageFull;

describe("Notes Editor Header Pin/Unpin Toggle & Cache Synchronization", () => {
  let queryClient: QueryClient;
  let apiSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mockPageData = {
      id: "page-pin-test-1",
      project_id: null,
      parent_id: null,
      title: "Quarterly Strategy",
      position: 1000,
      is_pinned: false,
      version: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      content: {
        blocks: [{ id: "b1", type: "p", text: "Initial draft text" }],
      },
    };

    // Pre-populate pages list cache as if AppSidebar had loaded
    queryClient.setQueryData<PageMeta[]>(pagesKey, [
      {
        id: mockPageData.id,
        project_id: mockPageData.project_id,
        parent_id: mockPageData.parent_id,
        title: mockPageData.title,
        position: mockPageData.position,
        is_pinned: mockPageData.is_pinned,
        version: mockPageData.version,
        created_at: mockPageData.created_at,
        updated_at: mockPageData.updated_at,
      },
    ]);

    apiSpy = vi
      .spyOn(apiClient, "api")
      .mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
        if (path === `/api/pages/${mockPageData.id}`) {
          if (!options || options.method === "GET") {
            return mockPageData;
          }
          if (options.method === "PATCH") {
            const body = options.body as Record<string, unknown> | undefined;
            if (body?.["is_pinned"] !== undefined) {
              mockPageData = { ...mockPageData, is_pinned: Boolean(body["is_pinned"]) };
            }
            if (body?.["title"] !== undefined) {
              mockPageData = { ...mockPageData, title: String(body["title"]) };
            }
            if (body?.["content"] !== undefined) {
              mockPageData = {
                ...mockPageData,
                content: body["content"] as PageFull["content"],
                version: mockPageData.version + 1,
              };
            }
            return {
              id: mockPageData.id,
              project_id: mockPageData.project_id,
              parent_id: mockPageData.parent_id,
              title: mockPageData.title,
              position: mockPageData.position,
              is_pinned: mockPageData.is_pinned,
              version: mockPageData.version,
              created_at: mockPageData.created_at,
              updated_at: mockPageData.updated_at,
            } as PageMeta;
          }
        }
        if (path === "/api/pages") {
          return [
            {
              id: mockPageData.id,
              project_id: mockPageData.project_id,
              parent_id: mockPageData.parent_id,
              title: mockPageData.title,
              position: mockPageData.position,
              is_pinned: mockPageData.is_pinned,
              version: mockPageData.version,
              created_at: mockPageData.created_at,
              updated_at: mockPageData.updated_at,
            },
          ] as PageMeta[];
        }
        return {};
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("toggles Pin -> Pinned -> Pin immediately without refresh and synchronizes individual cache", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PageEditor pageId="page-pin-test-1" />
      </QueryClientProvider>,
    );

    // Wait for page to load
    const pinBtn = await screen.findByRole("button", { name: "Pin note" });
    expect(pinBtn).toBeDefined();
    expect(pinBtn.textContent).toBe("Pin");

    // 1. First Click: Pin the note
    await act(async () => {
      fireEvent.click(pinBtn);
    });

    // Verify immediate UI update to "Pinned"
    expect(screen.getByRole("button", { name: "Unpin note" })).toBeDefined();
    expect(screen.getByText("Pinned")).toBeDefined();

    // Verify API was called with { is_pinned: true }
    expect(apiSpy).toHaveBeenCalledWith(`/api/pages/${mockPageData.id}`, {
      method: "PATCH",
      body: { is_pinned: true },
    });

    // Verify cache synchronization: both pagesKey and pageKey are updated
    const cachedSingleNote = queryClient.getQueryData<PageFull>(pageKey(mockPageData.id));
    expect(cachedSingleNote?.is_pinned).toBe(true);

    const cachedPageList = queryClient.getQueryData<PageMeta[]>(pagesKey);
    const listed = cachedPageList?.find((p) => p.id === mockPageData.id);
    expect(listed?.is_pinned).toBe(true);

    // 2. Second Click: Unpin the note without any page reload
    const unpinBtn = screen.getByRole("button", { name: "Unpin note" });
    await act(async () => {
      fireEvent.click(unpinBtn);
    });

    // Verify immediate UI update back to "Pin"
    expect(screen.getByRole("button", { name: "Pin note" })).toBeDefined();
    expect(screen.getByText("Pin")).toBeDefined();

    // Verify API was called with { is_pinned: false }
    expect(apiSpy).toHaveBeenCalledWith(`/api/pages/${mockPageData.id}`, {
      method: "PATCH",
      body: { is_pinned: false },
    });

    // Verify both caches are updated to false
    const unpinnedSingleNote = queryClient.getQueryData<PageFull>(pageKey(mockPageData.id));
    expect(unpinnedSingleNote?.is_pinned).toBe(false);

    const unpinnedPageList = queryClient.getQueryData<PageMeta[]>(pagesKey);
    const unpinnedListed = unpinnedPageList?.find((p) => p.id === mockPageData.id);
    expect(unpinnedListed?.is_pinned).toBe(false);
  });

  it("verifies pin state persists after reload", async () => {
    // Note starts as pinned
    mockPageData.is_pinned = true;

    render(
      <QueryClientProvider client={queryClient}>
        <PageEditor pageId="page-pin-test-1" />
      </QueryClientProvider>,
    );

    const pinnedBtn = await screen.findByRole("button", { name: "Unpin note" });
    expect(pinnedBtn).toBeDefined();
    expect(pinnedBtn.textContent).toBe("Pinned");

    // Simulate reloading the query
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: pageKey(mockPageData.id) });
    });

    expect(screen.getByRole("button", { name: "Unpin note" })).toBeDefined();
    expect(screen.getByText("Pinned")).toBeDefined();
    expect(mockPageData.is_pinned).toBe(true);
  });

  it("confirms pinning does not overwrite unsaved note content or disrupt undo history", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PageEditor pageId="page-pin-test-1" />
      </QueryClientProvider>,
    );

    const textarea = (await screen.findByDisplayValue("Initial draft text")) as HTMLTextAreaElement;
    expect(textarea).toBeDefined();

    // 1. User types unsaved content into the note
    act(() => {
      fireEvent.change(textarea, {
        target: { value: "Unsaved live modifications in progress..." },
      });
    });
    expect(textarea.value).toBe("Unsaved live modifications in progress...");

    // 2. User clicks Pin in the header while edits are unsaved / dirty
    const pinBtn = screen.getByRole("button", { name: "Pin note" });
    await act(async () => {
      fireEvent.click(pinBtn);
    });

    // Button updates to Pinned
    expect(screen.getByRole("button", { name: "Unpin note" })).toBeDefined();

    // CRITICAL: Unsaved note edits MUST NOT be lost or reset to server state
    expect(textarea.value).toBe("Unsaved live modifications in progress...");

    // 3. Undo shortcut still works on the unsaved content
    act(() => {
      textarea.focus();
      fireEvent.keyDown(textarea, { key: "z", ctrlKey: true });
    });

    expect(textarea.value).toBe("Initial draft text");
  });
});
