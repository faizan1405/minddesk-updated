import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { PageEditor } from "@/components/notes/PageEditor";
import { PageTree } from "@/components/notes/PageTree";
import type { PageFull, PageMeta } from "@/lib/pages";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, onClick, ...props }: any) => (
    <a onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api-client", () => ({
  api: vi.fn().mockResolvedValue({ id: "p1", title: "Note To Delete", version: 1 }),
  ApiRequestError: class ApiRequestError extends Error {},
}));

const mockDeleteMutate = vi.fn();
const mockTogglePin = vi.fn();

const samplePage: PageFull = {
  id: "p1",
  project_id: null,
  parent_id: null,
  title: "Note To Delete",
  position: 0,
  is_pinned: false,
  version: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  content: {
    blocks: [{ id: "b1", type: "p", text: "Some notes content" }],
  },
};

const samplePages: PageMeta[] = [
  {
    id: "p1",
    project_id: null,
    parent_id: null,
    title: "Note To Delete",
    position: 0,
    is_pinned: false,
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "sub-1",
    project_id: null,
    parent_id: "p1",
    title: "Subpage 1",
    position: 1,
    is_pinned: false,
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

vi.mock("@/lib/pages", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pages")>("@/lib/pages");
  return {
    ...actual,
    usePage: () => ({
      isPending: false,
      error: null,
      data: samplePage,
      refetch: vi.fn(),
    }),
    usePages: () => ({
      data: samplePages,
    }),
    usePageActions: () => ({
      togglePinPage: { mutate: mockTogglePin },
      deletePage: { mutate: mockDeleteMutate, isPending: false },
      renamePage: { mutateAsync: vi.fn() },
    }),
    setPageTitleInCache: vi.fn(),
  };
});

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("Note Delete Feature Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Delete button in Note editor toolbar and triggers confirmation dialog", () => {
    render(<PageEditor pageId="p1" />, { wrapper: createWrapper() });

    // The Delete button should be visible in the toolbar
    const deleteButton = screen.getByRole("button", { name: /delete note/i });
    expect(deleteButton).toBeDefined();

    // Clicking Delete button opens ConfirmDialog
    fireEvent.click(deleteButton);

    // Confirm dialog title and description should appear
    expect(screen.getByText(/Delete "Note To Delete"\?/i)).toBeDefined();
    expect(screen.getByText(/moved to the Recycle Bin/i)).toBeDefined();

    // Confirm action triggers mutation
    const confirmButton = screen.getByRole("button", { name: /move to recycle bin/i });
    fireEvent.click(confirmButton);

    expect(mockDeleteMutate).toHaveBeenCalledWith("p1", expect.any(Object));
  });

  it("renders page tree with accessible page actions and visible menu trigger for active note", () => {
    const onDeleted = vi.fn();
    const onCreate = vi.fn();

    render(
      <PageTree
        scope={{ kind: "notes" }}
        pages={samplePages}
        activeId="p1"
        onCreate={onCreate}
        onDeleted={onDeleted}
      />,
      { wrapper: createWrapper() },
    );

    // The active item should have actions button available
    const actionButtons = screen.getAllByRole("button", { name: /page actions/i });
    expect(actionButtons.length).toBeGreaterThan(0);
    expect(actionButtons[0].getAttribute("aria-haspopup")).toBe("menu");
  });
});
