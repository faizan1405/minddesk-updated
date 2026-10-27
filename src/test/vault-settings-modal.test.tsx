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

    expect(toast.error).toHaveBeenCalledWith("New passwords do not match.");
    expect(mockChangeMasterPassword).not.toHaveBeenCalled();
  });

  it("ambiguous network error rejects and keeps settings dialog open without clearing inputs or closing modal", async () => {
    const onOpenChangeMock = vi.fn();
    mockChangeMasterPassword.mockRejectedValueOnce(
      new Error(
        "Network connection was interrupted and the server update could not be verified. Your master password has NOT been changed. Please check your connection and try again.",
      ),
    );

    render(<VaultSettingsModal open={true} onOpenChange={onOpenChangeMock} />);

    const currentInput = screen.getByLabelText(/Current Master Password/i) as HTMLInputElement;
    const newInput = screen.getByLabelText(/^New Master Password/i) as HTMLInputElement;
    const confirmInput = screen.getByLabelText(/Confirm New Password/i) as HTMLInputElement;
    const accountInput = screen.getByLabelText(/MindDesk Account Password/i) as HTMLInputElement;

    fireEvent.change(currentInput, { target: { value: "OldMaster123!" } });
    fireEvent.change(newInput, { target: { value: "NewMaster123!" } });
    fireEvent.change(confirmInput, { target: { value: "NewMaster123!" } });
    fireEvent.change(accountInput, { target: { value: "AccountSecret123!" } });

    const submitBtn = screen.getByRole("button", { name: /Update Master Password/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      // Must NOT close the dialog
      expect(onOpenChangeMock).not.toHaveBeenCalledWith(false);
      // Must display inline error alert
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByRole("alert").textContent).toContain("could not be verified");
      // Must preserve user's typed values
      expect(currentInput.value).toBe("OldMaster123!");
      expect(newInput.value).toBe("NewMaster123!");
    });
  });
});
