import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VaultSettingsModal } from "@/components/vault/VaultSettingsModal";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

const mockChangeMasterPassword = vi.fn();
const mockSetTimeoutMinutes = vi.fn();
const mockRefreshVaultMeta = vi.fn();
const mockVerifyDelayedPasswordChange = vi.fn();

vi.mock("@/components/vault/VaultContext", () => ({
  useVault: () => ({
    timeoutMinutes: 5,
    setTimeoutMinutes: mockSetTimeoutMinutes,
    changeMasterPassword: mockChangeMasterPassword,
    refreshVaultMeta: mockRefreshVaultMeta,
    verifyDelayedPasswordChange: mockVerifyDelayedPasswordChange,
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

  it("requires account password before submitting and enables button when all fields present", async () => {
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

  it("validates that new passwords match before submitting", async () => {
    render(<VaultSettingsModal open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Current Master Password/i), {
      target: { value: "CurrentMaster123!" },
    });
    fireEvent.change(screen.getByLabelText(/^New Master Password/i), {
      target: { value: "NewMasterPassword123!" },
    });
    fireEvent.change(screen.getByLabelText(/Confirm New Password/i), {
      target: { value: "DifferentPassword123!" },
    });
    fireEvent.change(screen.getByLabelText(/MindDesk Account Password/i), {
      target: { value: "AccountSecret123!" },
    });

    const submitBtn = screen.getByRole("button", { name: /Update Master Password/i });
    fireEvent.click(submitBtn);

    expect(toast.error).toHaveBeenCalledWith("New passwords do not match.");
    expect(mockChangeMasterPassword).not.toHaveBeenCalled();
  });

  it("ambiguous network error rejects and keeps settings dialog open without clearing inputs or claiming definite failure", async () => {
    const onOpenChangeMock = vi.fn();
    mockChangeMasterPassword.mockRejectedValueOnce(
      new Error(
        "The connection was interrupted. We couldn't confirm whether your master password changed. Reconnect and verify your Vault status before trying again.",
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
      // Must display inline error alert with accurate non-absolute language
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByRole("alert").textContent).toContain(
        "couldn't confirm whether your master password changed",
      );
      expect(screen.getByRole("alert").textContent).not.toContain("has NOT been changed");
      // Must preserve user's typed values
      expect(currentInput.value).toBe("OldMaster123!");
      expect(newInput.value).toBe("NewMaster123!");
      // Must surface the Verify Vault Status button
      expect(screen.getByRole("button", { name: /Verify Vault Status/i })).toBeDefined();
    });
  });

  it("allows user to safely verify Vault status and recovers when delayed server commit succeeded", async () => {
    const onOpenChangeMock = vi.fn();
    mockChangeMasterPassword.mockRejectedValueOnce(
      new Error(
        "The connection was interrupted. We couldn't confirm whether your master password changed. Reconnect and verify your Vault status before trying again.",
      ),
    );
    mockVerifyDelayedPasswordChange.mockResolvedValueOnce({
      status: "confirmed",
      version: 2,
      message:
        "Master password change confirmed on server (version 2). The new password is active.",
    });

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
      expect(screen.getByRole("button", { name: /Verify Vault Status/i })).toBeDefined();
    });

    // Click "Verify Vault Status"
    const verifyBtn = screen.getByRole("button", { name: /Verify Vault Status/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(mockVerifyDelayedPasswordChange).toHaveBeenCalledWith("NewMaster123!");
      expect(toast.success).toHaveBeenCalledWith(
        "Master password change confirmed on server (version 2). The new password is active.",
      );
      // When confirmed, closes dialog cleanly
      expect(onOpenChangeMock).toHaveBeenCalledWith(false);
    });
  });

  it("allows user to safely verify Vault status and keeps dialog open when server metadata is unchanged", async () => {
    const onOpenChangeMock = vi.fn();
    mockChangeMasterPassword.mockRejectedValueOnce(
      new Error(
        "The connection was interrupted. We couldn't confirm whether your master password changed. Reconnect and verify your Vault status before trying again.",
      ),
    );
    mockVerifyDelayedPasswordChange.mockResolvedValueOnce({
      status: "unchanged",
      version: 1,
      message:
        "Vault metadata is unchanged (version 1). Your previous master password remains active.",
    });

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
      expect(screen.getByRole("button", { name: /Verify Vault Status/i })).toBeDefined();
    });

    // Click "Verify Vault Status"
    const verifyBtn = screen.getByRole("button", { name: /Verify Vault Status/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(mockVerifyDelayedPasswordChange).toHaveBeenCalledWith("NewMaster123!");
      expect(toast.info).toHaveBeenCalledWith(
        "Vault metadata is unchanged (version 1). Your previous master password remains active.",
      );
      // Does NOT close modal
      expect(onOpenChangeMock).not.toHaveBeenCalledWith(false);
      // Inputs remain intact
      expect(currentInput.value).toBe("OldMaster123!");
      expect(newInput.value).toBe("NewMaster123!");
    });
  });
});
