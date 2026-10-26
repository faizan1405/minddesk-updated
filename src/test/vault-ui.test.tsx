import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VaultProvider, useVault } from "@/components/vault/VaultContext";
import * as vaultClient from "@/lib/vault-client";

// Mock auth hook
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "test-user-ui", email: "tester@minddesk.com" },
  }),
}));

function VaultTestHarness() {
  const { status, setupVault, unlockVault, lockVault, passwords, savePassword } = useVault();

  return (
    <div>
      <div data-testid="vault-status">{status}</div>
      <div data-testid="passwords-count">{passwords.length}</div>
      <button onClick={() => setupVault("MasterPass123!")}>Setup Vault</button>
      <button onClick={() => unlockVault("MasterPass123!")}>Unlock Vault</button>
      <button onClick={() => lockVault()}>Lock Vault</button>
      <button
        onClick={() =>
          savePassword({
            name: "Test Account",
            url: "https://example.com",
            username: "user1",
            password: "SecretPassword123!",
            notes: "Private multiline note\nLine 2",
          })
        }
      >
        Add Password
      </button>
    </div>
  );
}

describe("Vault UI State & Lifecycle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in uninitialized state when vault has no metadata", async () => {
    vi.spyOn(vaultClient, "fetchVaultMeta").mockResolvedValue({
      initialized: false,
      salt: null,
      wrapped_key: null,
      wrapped_key_iv: null,
      iterations: 3,
      memory_cost: 19456,
      parallelism: 1,
      version: 1,
    });

    render(
      <VaultProvider>
        <VaultTestHarness />
      </VaultProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vault-status").textContent).toBe("uninitialized");
    });
  });

  it("initializes and unlocks vault on setup", async () => {
    vi.spyOn(vaultClient, "fetchVaultMeta").mockResolvedValue({
      initialized: false,
      salt: null,
      wrapped_key: null,
      wrapped_key_iv: null,
      iterations: 3,
      memory_cost: 19456,
      parallelism: 1,
      version: 1,
    });

    vi.spyOn(vaultClient, "initializeVaultApi").mockResolvedValue({
      initialized: true,
      salt: "0123456789abcdef",
      wrapped_key: "wrappedKey",
      wrapped_key_iv: "wrappedKeyIv",
      iterations: 3,
      memory_cost: 19456,
      parallelism: 1,
      version: 1,
    });

    render(
      <VaultProvider>
        <VaultTestHarness />
      </VaultProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("vault-status").textContent).toBe("uninitialized");
    });

    fireEvent.click(screen.getByText("Setup Vault"));

    await waitFor(() => {
      expect(screen.getByTestId("vault-status").textContent).toBe("unlocked");
    });

    // Test lock button clears in-memory state
    fireEvent.click(screen.getByText("Lock Vault"));

    await waitFor(() => {
      expect(screen.getByTestId("vault-status").textContent).toBe("locked");
      expect(screen.getByTestId("passwords-count").textContent).toBe("0");
    });
  });
});
