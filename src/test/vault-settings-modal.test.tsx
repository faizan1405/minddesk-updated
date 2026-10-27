import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VaultSettingsModal } from "@/components/vault/VaultSettingsModal";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockChangeMasterPassword = vi.fn();
const mockSetTimeoutMinutes = vi.fn();

vi.mock("@/components/vault/VaultContext", () => ({
  useVault: () => ({
    timeoutMinutes: 5,
    setTimeoutMinutes: mockSetTimeoutMinutes,
    changeMasterPassword: mockChangeMasterPassword,
  }),
}));

describe("VaultSettingsModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all four required password input fields", () => {
    render(<VaultSettingsModal open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText(/Current Master Password/i)).toBeDefined();
    expect(screen.getByLabelText(/^New Master Password/i)).toBeDefined();
    expect(screen.getByLabelText(/Confirm New Password/i)).toBeDefined();
    expect(screen.getByLabelText(/MindDesk Account Password/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Update Master Password/i })).toBeDefined();
  });

  it("requires account password before submitting", async () => {
    render(<VaultSettingsModal open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Current Master Password/i), {
      target: { value: "OldMaster123!" },
    });
    fireEvent.change(screen.getByLabelText(/^New Master Password/i), {
      target: { value: "NewMaster123!" },
    });
    fireEvent.change(screen.getByLabelText(/Confirm New Password/i), {
      target: { value: "NewMaster123!" },
    });

    const submitBtn = screen.getByRole("button", { name: /Update Master Password/i });
    // Button is disabled when account password is empty
    expect(submitBtn.hasAttribute("disabled")).toBe(true);

    // If account password is provided, button becomes enabled
    fireEvent.change(screen.getByLabelText(/MindDesk Account Password/i), {
      target: { value: "AccountSecret123!" },
    });
    expect(submitBtn.hasAttribute("disabled")).toBe(false);

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockChangeMasterPassword).toHaveBeenCalledWith(
        "OldMaster123!",
        "NewMaster123!",
        "AccountSecret123!",
      );
    });
  });

  it("rejects mismatched new passwords", async () => {
    render(<VaultSettingsModal open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Current Master Password/i), {
      target: { value: "OldMaster123!" },
    });
    fireEvent.change(screen.getByLabelText(/^New Master Password/i), {
      target: { value: "NewMaster123!" },
    });
    fireEvent.change(screen.getByLabelText(/Confirm New Password/i), {
      target: { value: "DifferentNewMaster123!" },
    });
    fireEvent.change(screen.getByLabelText(/MindDesk Account Password/i), {
      target: { value: "AccountSecret123!" },
    });

    const submitBtn = screen.getByRole("button", { name: /Update Master Password/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("New passwords do not match.");
      expect(mockChangeMasterPassword).not.toHaveBeenCalled();
    });
  });
});
