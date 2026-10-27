import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, KeyRound, Clock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useVault } from "./VaultContext";
import { toast } from "sonner";

interface VaultSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VaultSettingsModal({ open, onOpenChange }: VaultSettingsModalProps) {
  const { timeoutMinutes, setTimeoutMinutes, changeMasterPassword } = useVault();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Please enter your current master password.");
      return;
    }
    if (!newPassword) {
      toast.error("Please enter a new master password.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New master password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (!accountPassword) {
      toast.error("Please enter your MindDesk account password.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changeMasterPassword(currentPassword, newPassword, accountPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setAccountPassword("");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to change master password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-semibold">Vault Security Settings</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Manage your master password, account re-authentication, and auto-lock security
            preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Auto-Lock Inactivity Timeout */}
          <div className="space-y-1.5 rounded-xl border bg-muted/30 p-3.5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <Label className="text-xs font-semibold">Auto-Lock Inactivity Timeout</Label>
            </div>
            <p className="text-[11px] text-muted-foreground pb-2">
              Automatically locks the vault and purges memory keys when idle.
            </p>
            <Select
              value={timeoutMinutes.toString()}
              onValueChange={(val) => setTimeoutMinutes(parseInt(val, 10))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select timeout" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1" className="text-xs">
                  1 Minute (Strict)
                </SelectItem>
                <SelectItem value="5" className="text-xs">
                  5 Minutes (Recommended)
                </SelectItem>
                <SelectItem value="15" className="text-xs">
                  15 Minutes
                </SelectItem>
                <SelectItem value="30" className="text-xs">
                  30 Minutes
                </SelectItem>
                <SelectItem value="60" className="text-xs">
                  1 Hour
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Change Master Password Form */}
          <form onSubmit={handleChangePassword} className="space-y-3 rounded-xl border p-3.5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <h4 className="text-xs font-semibold">Change Master Password</h4>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Rewraps your vault data encryption key with a new master password. Existing entries
              and documents remain securely encrypted without re-encryption.
            </p>

            {/* Current Master Password */}
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="current-master-pw" className="text-xs">
                Current Master Password
              </Label>
              <div className="relative">
                <Input
                  id="current-master-pw"
                  type={showCurrentPassword ? "text" : "password"}
                  placeholder="Enter current master password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pr-10 text-xs font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* New Master Password */}
            <div className="space-y-1.5">
              <Label htmlFor="new-master-pw" className="text-xs">
                New Master Password
              </Label>
              <div className="relative">
                <Input
                  id="new-master-pw"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Enter new master password (min 8 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10 text-xs font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm New Master Password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-new-master-pw" className="text-xs">
                Confirm New Password
              </Label>
              <Input
                id="confirm-new-master-pw"
                type={showNewPassword ? "text" : "password"}
                placeholder="Repeat new master password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="text-xs font-mono"
                required
              />
            </div>

            {/* MindDesk Account Password (Identity Re-Authentication) */}
            <div className="space-y-1.5 pt-1 border-t border-border/50">
              <Label
                htmlFor="account-password"
                className="text-xs flex items-center justify-between"
              >
                <span>MindDesk Account Password</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  Re-authentication
                </span>
              </Label>
              <div className="relative">
                <Input
                  id="account-password"
                  type={showAccountPassword ? "text" : "password"}
                  placeholder="Enter your MindDesk login password"
                  value={accountPassword}
                  onChange={(e) => setAccountPassword(e.target.value)}
                  className="pr-10 text-xs"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowAccountPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showAccountPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={
                isChangingPassword ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                !accountPassword
              }
              className="w-full text-xs gap-1.5 h-8 mt-2"
            >
              {isChangingPassword ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verifying & Rewrapping...
                </>
              ) : (
                "Update Master Password"
              )}
            </Button>
          </form>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
