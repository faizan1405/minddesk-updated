import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { PageEditor } from "@/components/notes/PageEditor";
import type { PageFull } from "@/lib/pages";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/api-client", () => ({
  api: vi.fn().mockResolvedValue({ id: "page-test-1", title: "Initial Title", version: 2 }),
  ApiRequestError: class ApiRequestError extends Error {},
}));

let mockPageData: PageFull = {
  id: "page-test-1",
  project_id: null,
  parent_id: null,
  title: "Initial Title",
  position: 1000,
  is_pinned: false,
  version: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  content: {
    blocks: [{ id: "b1", type: "p", text: "Step 0 paragraph" }],
  },
};

vi.mock("@/lib/pages", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pages")>("@/lib/pages");
  return {
    ...actual,
    usePage: () => ({
      isPending: false,
      error: null,
      data: mockPageData,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    }),
    usePageActions: () => ({
      togglePinPage: { mutate: vi.fn() },
    }),
    setPageTitleInCache: vi.fn(),
  };
});

describe("Notes Editor Component Undo/Redo & Shortcut Scoping (Regression Tests)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockPageData = {
      id: "page-test-1",
      project_id: null,
      parent_id: null,
      title: "Initial Title",
      position: 1000,
      is_pinned: false,
      version: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      content: {
        blocks: [{ id: "b1", type: "p", text: "Step 0 paragraph" }],
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("proves one Ctrl+Z undoes exactly one history step, and Ctrl+Shift+Z / Ctrl+Y redoes one step", async () => {
    vi.useFakeTimers();
    try {
      act(() => {
        render(
          <QueryClientProvider client={queryClient}>
            <div>
              <input data-testid="outside-input" placeholder="Outside editor" />
              <PageEditor pageId="page-test-1" />
            </div>
          </QueryClientProvider>,
        );
      });

      const titleInput = screen.getByPlaceholderText("Untitled") as HTMLInputElement;
      expect(titleInput.value).toBe("Initial Title");

      const blockTextarea = screen.getByDisplayValue("Step 0 paragraph") as HTMLTextAreaElement;
      expect(blockTextarea).toBeDefined();

      // 1. First edit: Type "Step 1 edit"
      act(() => {
        fireEvent.change(blockTextarea, { target: { value: "Step 1 edit" } });
      });
      expect(blockTextarea.value).toBe("Step 1 edit");

      // Advance timers beyond the 1200ms debounce window to delineate the next edit step
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      // 2. Second edit: Type "Step 2 edit"
      act(() => {
        fireEvent.change(blockTextarea, { target: { value: "Step 2 edit" } });
      });
      expect(blockTextarea.value).toBe("Step 2 edit");

      // 3. Press Ctrl+Z ONCE inside blockTextarea
      // REGRESSION PROOF: Because duplicate handlers were eliminated, exactly ONE step is undone.
      act(() => {
        blockTextarea.focus();
        fireEvent.keyDown(blockTextarea, { key: "z", ctrlKey: true });
      });

      // Must be "Step 1 edit" (NOT "Step 0 paragraph" which would happen if double-undo occurred!)
      expect(blockTextarea.value).toBe("Step 1 edit");

      // 4. Press Ctrl+Z a SECOND time
      act(() => {
        fireEvent.keyDown(blockTextarea, { key: "z", ctrlKey: true });
      });

      // Now it restores the initial "Step 0 paragraph"
      expect(blockTextarea.value).toBe("Step 0 paragraph");

      // 5. Press Ctrl+Shift+Z ONCE -> redoes exactly one step to "Step 1 edit"
      act(() => {
        fireEvent.keyDown(blockTextarea, { key: "z", ctrlKey: true, shiftKey: true });
      });
      expect(blockTextarea.value).toBe("Step 1 edit");

      // 6. Press Ctrl+Y ONCE -> redoes the second step to "Step 2 edit"
      act(() => {
        fireEvent.keyDown(blockTextarea, { key: "y", ctrlKey: true });
      });
      expect(blockTextarea.value).toBe("Step 2 edit");
    } finally {
      vi.useRealTimers();
    }
  });

  it("handles title editing and undo/redo independently of body blocks", async () => {
    act(() => {
      render(
        <QueryClientProvider client={queryClient}>
          <PageEditor pageId="page-test-1" />
        </QueryClientProvider>,
      );
    });

    const titleInput = screen.getByPlaceholderText("Untitled") as HTMLInputElement;
    expect(titleInput.value).toBe("Initial Title");

    // Edit title
    act(() => {
      fireEvent.change(titleInput, { target: { value: "Q4 Roadmap Plan" } });
    });
    expect(titleInput.value).toBe("Q4 Roadmap Plan");

    // Press Ctrl+Z while focused in titleInput
    act(() => {
      titleInput.focus();
      fireEvent.keyDown(titleInput, { key: "z", ctrlKey: true });
    });

    // Title restored to initial
    expect(titleInput.value).toBe("Initial Title");

    // Redo title
    act(() => {
      fireEvent.keyDown(titleInput, { key: "y", ctrlKey: true });
    });
    expect(titleInput.value).toBe("Q4 Roadmap Plan");
  });

  it("ensures shortcuts pressed outside the Notes editor do not trigger undo/redo", async () => {
    act(() => {
      render(
        <QueryClientProvider client={queryClient}>
          <div>
            <input data-testid="outside-input" placeholder="Outside search bar" />
            <PageEditor pageId="page-test-1" />
          </div>
        </QueryClientProvider>,
      );
    });

    const outsideInput = screen.getByTestId("outside-input") as HTMLInputElement;
    const blockTextarea = screen.getByDisplayValue("Step 0 paragraph") as HTMLTextAreaElement;

    // Edit inside note
    act(() => {
      fireEvent.change(blockTextarea, { target: { value: "Note modification" } });
    });
    expect(blockTextarea.value).toBe("Note modification");

    // Focus outside element and type in it
    act(() => {
      outsideInput.focus();
      fireEvent.change(outsideInput, { target: { value: "Search query" } });
    });

    // Press Ctrl+Z while focused on outside element
    act(() => {
      fireEvent.keyDown(outsideInput, { key: "z", ctrlKey: true });
    });

    // The note's content MUST NOT be undone because focus was outside editorContainerRef!
    expect(blockTextarea.value).toBe("Note modification");
  });
});
