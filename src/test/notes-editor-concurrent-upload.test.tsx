import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { PageEditor } from "@/components/notes/PageEditor";
import type { PageFull } from "@/lib/pages";
import type { UploadedImage } from "@/lib/images-client";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/api-client", () => ({
  api: vi.fn().mockResolvedValue({ id: "page-test-1", title: "Concurrent Test", version: 2 }),
  ApiRequestError: class ApiRequestError extends Error {},
}));

let uploadPromiseResolvers: {
  resolve: (val: UploadedImage) => void;
  reject: (err: Error) => void;
} | null = null;

vi.mock("@/lib/images-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/images-client")>("@/lib/images-client");
  return {
    ...actual,
    uploadNoteImage: vi.fn(
      () =>
        new Promise<UploadedImage>((resolve, reject) => {
          uploadPromiseResolvers = { resolve, reject };
        }),
    ),
  };
});

let mockPageData: PageFull = {
  id: "page-test-1",
  project_id: null,
  parent_id: null,
  title: "Concurrent Test",
  position: 1000,
  is_pinned: false,
  version: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  content: {
    blocks: [{ id: "b1", type: "p", text: "Original paragraph text" }],
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

describe("Notes Editor Simultaneous Edits & Concurrency during Image Upload", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockPageData = {
      id: "page-test-1",
      project_id: null,
      parent_id: null,
      title: "Concurrent Test",
      position: 1000,
      is_pinned: false,
      version: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      content: {
        blocks: [{ id: "b1", type: "p", text: "Original paragraph text" }],
      },
    };
    uploadPromiseResolvers = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves all note edits made while an image upload is in flight (no stale-state race)", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PageEditor pageId="page-test-1" />
      </QueryClientProvider>,
    );

    const paragraphTextarea = screen.getByDisplayValue(
      "Original paragraph text",
    ) as HTMLTextAreaElement;
    expect(paragraphTextarea).toBeDefined();

    // 1. Trigger image upload by providing a fake PNG file to the file input
    const fileInput = screen.getByLabelText("Upload photo or screenshot") as HTMLInputElement;
    const testFile = new File(["fake-image-bytes"], "payment-receipt.png", { type: "image/png" });

    act(() => {
      fireEvent.change(fileInput, { target: { files: [testFile] } });
    });

    // The upload promise is now in-flight (pending)
    expect(uploadPromiseResolvers).not.toBeNull();

    // The image placeholder indicator should be visible
    expect(screen.getByText("Uploading image…")).toBeDefined();

    // 2. WHILE THE UPLOAD IS IN FLIGHT, the user continues modifying the note!
    act(() => {
      fireEvent.change(paragraphTextarea, {
        target: { value: "Updated paragraph typed WHILE uploading!" },
      });
    });
    expect(paragraphTextarea.value).toBe("Updated paragraph typed WHILE uploading!");

    // 3. Resolve the delayed upload response
    await act(async () => {
      uploadPromiseResolvers!.resolve({
        id: "img-uploaded-123",
        url: "/api/images/img-uploaded-123",
        fileName: "payment-receipt.png",
        fileSize: 1024,
        mimeType: "image/png",
      });
      // Allow microtasks to settle
      await Promise.resolve();
    });

    // 4. VERIFY: The uploaded image block now renders the image URL
    const uploadedImg = screen.getByRole("img") as HTMLImageElement;
    expect(uploadedImg.src).toContain("/api/images/img-uploaded-123");

    // 5. CRITICAL CONCURRENCY REGRESSION PROOF:
    // The paragraph text MUST NOT have been overwritten by the stale pre-upload state!
    expect(paragraphTextarea.value).toBe("Updated paragraph typed WHILE uploading!");
  });

  it("preserves note edits when image upload fails and shows retry/remove options", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <PageEditor pageId="page-test-1" />
      </QueryClientProvider>,
    );

    const paragraphTextarea = screen.getByDisplayValue(
      "Original paragraph text",
    ) as HTMLTextAreaElement;

    // 1. Trigger image upload
    const fileInput = screen.getByLabelText("Upload photo or screenshot") as HTMLInputElement;
    const testFile = new File(["fake-image-bytes"], "invoice.png", { type: "image/png" });

    act(() => {
      fireEvent.change(fileInput, { target: { files: [testFile] } });
    });

    expect(uploadPromiseResolvers).not.toBeNull();
    expect(screen.getByText("Uploading image…")).toBeDefined();

    // 2. Edit note while upload is in flight
    act(() => {
      fireEvent.change(paragraphTextarea, {
        target: { value: "Important note content preserved despite upload error" },
      });
    });
    expect(paragraphTextarea.value).toBe("Important note content preserved despite upload error");

    // 3. Reject upload with an error
    await act(async () => {
      uploadPromiseResolvers!.reject(new Error("Server storage unreachable (500)"));
      await Promise.resolve();
    });

    // 4. VERIFY: Error UI is displayed with Retry and Remove buttons
    expect(screen.getByText("Server storage unreachable (500)")).toBeDefined();
    expect(screen.getByText("Retry upload")).toBeDefined();
    expect(screen.getByText("Remove")).toBeDefined();

    // 5. Note edits are fully preserved
    expect(paragraphTextarea.value).toBe("Important note content preserved despite upload error");
  });
});
