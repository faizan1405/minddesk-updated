import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VaultSettingsModal } from "@/components/vault/VaultSettingsModal";
import type { PendingPasswordChangeAttempt } from "@/components/vault/VaultContext";
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
let mockPendingPasswordChange: PendingPasswordChangeAttempt | null = null;
const mockClearPendingPasswordChange = vi.fn(() => {
  mockPendingPasswordChange = null;
});

vi.mock("@/components/vault/VaultContext", () => ({
  useVault: () => ({
    timeoutMinutes: 5,
    setTimeoutMinutes: mockSetTimeoutMinutes,
    changeMasterPassword: mockChangeMasterPassword,
    refreshVaultMeta: mockRefreshVaultMeta,
    verifyDelayedPasswordChange: mockVerifyDelayedPasswordChange,
    pendingPasswordChange: mockPendingPasswordChange,
    clearPendingPasswordChange: mockClearPendingPasswordChange,
  }),
}));

describe("VaultSettingsModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPendingPasswordChange = null;
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
    expect(submitBtn.hasAttribute("disabled")).toBe(true);

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
      expect(onOpenChangeMock).not.toHaveBeenCalledWith(false);
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByRole("alert").textContent).toContain(
        "couldn't confirm whether your master password changed",
      );
      expect(screen.getByRole("alert").textContent).not.toContain("has NOT been changed");
      expect(currentInput.value).toBe("OldMaster123!");
      expect(newInput.value).toBe("NewMaster123!");
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

    const verifyBtn = screen.getByRole("button", { name: /Verify Vault Status/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(mockVerifyDelayedPasswordChange).toHaveBeenCalledWith("NewMaster123!");
      expect(toast.success).toHaveBeenCalledWith(
        "Master password change confirmed on server (version 2). The new password is active.",
      );
      expect(onOpenChangeMock).toHaveBeenCalledWith(false);
    });
  });

  it("allows user to safely verify Vault status and keeps dialog open when server metadata is unconfirmed (delayed commit not finished)", async () => {
    const onOpenChangeMock = vi.fn();
    mockChangeMasterPassword.mockRejectedValueOnce(
      new Error(
        "The connection was interrupted. We couldn't confirm whether your master password changed. Reconnect and verify your Vault status before trying again.",
      ),
    );
    mockVerifyDelayedPasswordChange.mockResolvedValueOnce({
      status: "unconfirmed",
      version: 1,
      message:
        "Server metadata has not updated yet (version 1). The delayed change may still be processing on the server or the request was dropped. You may re-check, or lock the vault and test unlocking with your previous or new password.",
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

    const verifyBtn = screen.getByRole("button", { name: /Verify Vault Status/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(mockVerifyDelayedPasswordChange).toHaveBeenCalledWith("NewMaster123!");
      expect(toast.info).toHaveBeenCalledWith(
        "Server metadata has not updated yet (version 1). The delayed change may still be processing on the server or the request was dropped. You may re-check, or lock the vault and test unlocking with your previous or new password.",
      );
      expect(onOpenChangeMock).not.toHaveBeenCalledWith(false);
      expect(currentInput.value).toBe("OldMaster123!");
      expect(newInput.value).toBe("NewMaster123!");
    });
  });

  it("displays recovery alert upon reopening dialog when pendingPasswordChange is active in context", async () => {
    const onOpenChangeMock = vi.fn();
    mockPendingPasswordChange = {
      candidateWrappedKey: "candidate_wrapped_key_test",
      candidateSaltHex: "salt_test",
      candidateWrappedKeyIv: "iv_test",
      baseVersion: 1,
      targetVersion: 2,
      timestamp: Date.now(),
    };
    mockVerifyDelayedPasswordChange.mockResolvedValueOnce({
      status: "confirmed",
      version: 2,
      message:
        "Master password change confirmed on server (version 2). The new password is active.",
    });

    render(<VaultSettingsModal open={true} onOpenChange={onOpenChangeMock} />);

    // When modal reopens with pendingPasswordChange, recovery alert is rendered immediately
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain(
      "A previous master password change could not be confirmed",
    );
    expect(screen.getByRole("button", { name: /Verify Vault Status/i })).toBeDefined();

    // User types new password and verifies status
    const newInput = screen.getByLabelText(/^New Master Password/i) as HTMLInputElement;
    fireEvent.change(newInput, { target: { value: "ConfirmedNewPass123!" } });

    const verifyBtn = screen.getByRole("button", { name: /Verify Vault Status/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(mockVerifyDelayedPasswordChange).toHaveBeenCalledWith("ConfirmedNewPass123!");
      expect(toast.success).toHaveBeenCalledWith(
        "Master password change confirmed on server (version 2). The new password is active.",
      );
      expect(onOpenChangeMock).toHaveBeenCalledWith(false);
    });
  });
});
