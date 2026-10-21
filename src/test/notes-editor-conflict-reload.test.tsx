import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { PageEditor } from "@/components/notes/PageEditor";
import type { PageFull, PageMeta } from "@/lib/pages";
import * as apiClient from "@/lib/api-client";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

describe("Notes Editor 409 Conflict & Load Latest Version Regression Tests", () => {
  let queryClient: QueryClient;
  let serverDoc: PageFull;
  let apiSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // Server starts with version 1
    serverDoc = {
      id: "page-conflict-1",
      project_id: null,
      parent_id: null,
      title: "Initial Strategy Doc",
      position: 1000,
      is_pinned: false,
      version: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      content: {
        blocks: [{ id: "b1", type: "p", text: "Version 1 server content" }],
      },
    };

    apiSpy = vi
      .spyOn(apiClient, "api")
      .mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
        if (path === `/api/pages/${serverDoc.id}`) {
          if (!options || options.method === "GET") {
            return JSON.parse(JSON.stringify(serverDoc));
          }
          if (options.method === "PATCH") {
            const body = options.body as Record<string, unknown>;
            const baseVersion = body["base_version"] as number | undefined;

            // Optimistic concurrency check: if base_version does not match server version, throw 409
            if (baseVersion !== undefined && baseVersion !== serverDoc.version) {
              throw new apiClient.ApiRequestError(
                409,
                JSON.stringify({
                  error: "This page was changed elsewhere.",
                  version: serverDoc.version,
                }),
              );
            }

            // Normal update accepted: increment version
            serverDoc = {
              ...serverDoc,
              title: body["title"] !== undefined ? String(body["title"]) : serverDoc.title,
              content:
                body["content"] !== undefined
                  ? (body["content"] as PageFull["content"])
                  : serverDoc.content,
              version: serverDoc.version + 1,
            };

            return {
              id: serverDoc.id,
              project_id: serverDoc.project_id,
              parent_id: serverDoc.parent_id,
              title: serverDoc.title,
              position: serverDoc.position,
              is_pinned: serverDoc.is_pinned,
              version: serverDoc.version,
              created_at: serverDoc.created_at,
              updated_at: serverDoc.updated_at,
            } as PageMeta;
          }
        }
        return {};
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles 409 conflict, fetches latest server version on demand, and allows further edits with correct base_version", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PageEditor pageId="page-conflict-1" />
      </QueryClientProvider>,
    );

    // 1. Initial document loads
    const titleInput = (await screen.findByPlaceholderText("Untitled")) as HTMLInputElement;
    expect(titleInput.value).toBe("Initial Strategy Doc");

    const textarea = screen.getByDisplayValue("Version 1 server content") as HTMLTextAreaElement;
    expect(textarea).toBeDefined();

    // 2. Simulate ANOTHER DEVICE editing the document remotely on the server
    serverDoc = {
      ...serverDoc,
      title: "Remotely Edited by Device B",
      version: 2,
      content: {
        blocks: [{ id: "b1", type: "p", text: "Device B remote content (v2)" }],
      },
    };

    // 3. User on this device makes a local edit without knowing about the remote change
    act(() => {
      fireEvent.change(textarea, {
        target: { value: "Local edit on device A attempting to save" },
      });
    });
    expect(textarea.value).toBe("Local edit on device A attempting to save");

    // Wait for the debounced autosave (800ms) to trigger and receive 409
    const loadLatestBtn = await screen.findByRole(
      "button",
      { name: "Load latest version" },
      { timeout: 3000 },
    );
    expect(loadLatestBtn).toBeDefined();

    // 4. Autosave received 409 conflict
    expect(
      screen.getByText(
        "This page was changed on another device. Your latest edits here were not saved.",
      ),
    ).toBeDefined();

    // 5. User clicks "Load latest version"
    await act(async () => {
      fireEvent.click(loadLatestBtn);
    });

    // 6. VERIFY: The editor now displays the newly fetched version 2 content!
    const reloadedTitleInput = (await screen.findByDisplayValue(
      "Remotely Edited by Device B",
    )) as HTMLInputElement;
    expect(reloadedTitleInput).toBeDefined();

    const reloadedTextarea = screen.getByDisplayValue(
      "Device B remote content (v2)",
    ) as HTMLTextAreaElement;
    expect(reloadedTextarea).toBeDefined();

    // Conflict banner is dismissed
    expect(
      screen.queryByText(
        "This page was changed on another device. Your latest edits here were not saved.",
      ),
    ).toBeNull();

    // 7. VERIFY: User makes a new edit, and autosave sends base_version: 2 (matching the new server version!)
    act(() => {
      fireEvent.change(reloadedTextarea, {
        target: { value: "Device A edits on top of v2 successfully!" },
      });
    });

    // Wait for autosave to complete successfully
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    // Server accepted base_version: 2 and incremented to version 3!
    expect(serverDoc.version).toBe(3);
    expect(serverDoc.content.blocks[0]!.text).toBe("Device A edits on top of v2 successfully!");
  });

  it("does not discard unsaved user content if reload request fails, allows edits, and recovers on retry", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PageEditor pageId="page-conflict-1" />
      </QueryClientProvider>,
    );

    const textarea = (await screen.findByDisplayValue(
      "Version 1 server content",
    )) as HTMLTextAreaElement;

    // Simulate remote edit to version 2
    serverDoc = { ...serverDoc, version: 2 };

    // Local edit
    act(() => {
      fireEvent.change(textarea, {
        target: { value: "Critical local draft that must not be lost" },
      });
    });

    // Autosave triggers 409
    const loadLatestBtn = await screen.findByRole(
      "button",
      { name: "Load latest version" },
      { timeout: 3000 },
    );
    expect(loadLatestBtn).toBeDefined();

    // Now simulate network failure when trying to reload
    apiSpy.mockImplementationOnce(async () => {
      throw new Error("Network connection lost (offline)");
    });

    await act(async () => {
      fireEvent.click(loadLatestBtn);
    });

    // 1. VERIFY: The original textarea is STILL attached to the document
    expect(document.body.contains(textarea)).toBe(true);

    // 2. VERIFY: ErrorState was NOT rendered
    expect(screen.queryByText("Couldn't load your tasks")).toBeNull();

    // 3. VERIFY: The textarea remains accessible through the rendered UI with unsaved draft intact
    expect(screen.getByDisplayValue("Critical local draft that must not be lost")).toBe(textarea);

    // 4. VERIFY: The textarea is STILL editable despite the failed refetch
    act(() => {
      fireEvent.change(textarea, {
        target: { value: "Critical local draft plus offline modifications" },
      });
    });
    expect(textarea.value).toBe("Critical local draft plus offline modifications");
    expect(screen.getByDisplayValue("Critical local draft plus offline modifications")).toBe(
      textarea,
    );

    // 5. VERIFY: Subsequent retry succeeds and loads the correct server version
    const retryBtn = screen.getByRole("button", { name: "Load latest version" });
    expect(retryBtn).toBeDefined();

    serverDoc = {
      ...serverDoc,
      title: "Server v2 Title",
      version: 2,
      content: {
        blocks: [{ id: "b1", type: "p", text: "Server v2 content" }],
      },
    };

    await act(async () => {
      fireEvent.click(retryBtn);
    });

    // Editor remounts with server v2 content
    const reloadedTextarea = (await screen.findByDisplayValue(
      "Server v2 content",
    )) as HTMLTextAreaElement;
    expect(reloadedTextarea).toBeDefined();
    expect(screen.getByDisplayValue("Server v2 Title")).toBeDefined();
    expect(
      screen.queryByText(
        "This page was changed on another device. Your latest edits here were not saved.",
      ),
    ).toBeNull();

    // Subsequent edit saves against base_version: 2
    act(() => {
      fireEvent.change(reloadedTextarea, {
        target: { value: "Edits on server v2 after successful retry" },
      });
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });

    expect(serverDoc.version).toBe(3);
    expect(serverDoc.content.blocks[0]!.text).toBe("Edits on server v2 after successful retry");
  });

  it("keeps open editor mounted and preserves unsaved draft when background refetch fails", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PageEditor pageId="page-conflict-1" />
      </QueryClientProvider>,
    );

    const textarea = (await screen.findByDisplayValue(
      "Version 1 server content",
    )) as HTMLTextAreaElement;

    act(() => {
      fireEvent.change(textarea, {
        target: { value: "Draft in progress" },
      });
    });
    expect(textarea.value).toBe("Draft in progress");

    // Simulate background refetch failure
    apiSpy.mockImplementationOnce(async () => {
      throw new Error("Background network error");
    });

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["page", "page-conflict-1"] });
    });

    // Editor MUST still be mounted, textarea attached and editable, and draft intact
    expect(document.body.contains(textarea)).toBe(true);
    expect(screen.queryByText("Couldn't load your tasks")).toBeNull();
    expect(screen.getByDisplayValue("Draft in progress")).toBe(textarea);

    act(() => {
      fireEvent.change(textarea, {
        target: { value: "Draft in progress with more typing" },
      });
    });
    expect(textarea.value).toBe("Draft in progress with more typing");
    expect(document.body.contains(textarea)).toBe(true);
  });
});
