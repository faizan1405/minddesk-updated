import React, { useState } from "react";
import {
  ShieldCheck,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useVault } from "./VaultContext";
import { toast } from "sonner";

export function VaultUnlockScreen() {
  const { status, setupVault, unlockVault } = useVault();
  const isSetup = status === "uninitialized";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      toast.error("Please enter a master password.");
      return;
    }

    if (isSetup) {
      if (password.length < 8) {
        toast.error("Master password must be at least 8 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("Passwords do not match.");
        return;
      }

      setIsSubmitting(true);
      try {
        await setupVault(password);
      } catch (err: any) {
        toast.error(err?.message || "Failed to set up vault.");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(true);
      try {
        const success = await unlockVault(password);
        if (success) {
          setPassword("");
        }
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md border border-border/80 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {isSetup ? <Sparkles className="h-7 w-7" /> : <ShieldCheck className="h-7 w-7" />}
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">
            {isSetup ? "Create Your Private Vault" : "Unlock My Private Vault"}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground pt-1 leading-relaxed">
            {isSetup
              ? "Protect your passwords, credentials, and personal identity documents with zero-knowledge client-side encryption."
              : "Enter your vault master password to decrypt your saved passwords and personal documents."}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-2">
            {/* Master Password Input */}
            <div className="space-y-1.5">
              <Label htmlFor="master-password" className="text-xs font-semibold">
                {isSetup ? "Create Master Password" : "Vault Master Password"}
              </Label>
              <div className="relative">
                <Input
                  id="master-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={isSetup ? "Choose a strong master password" : "Enter master password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                  className="pr-10 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password (only during setup) */}
            {isSetup && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs font-semibold">
                  Confirm Master Password
                </Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Repeat master password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="text-xs font-mono"
                />
              </div>
            )}

            {/* Security Warning Callout */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-foreground">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-600 dark:text-amber-400">
                    Zero-Knowledge Architecture
                  </p>
                  <p className="text-muted-foreground pt-0.5">
                    MindDesk never sends your master password or unencrypted files to the server. If you
                    forget your master password, your encrypted data cannot be recovered by anyone.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full gap-2 text-xs font-semibold h-9 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{isSetup ? "Deriving Argon2id Keys..." : "Unlocking Vault..."}</span>
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" />
                  <span>{isSetup ? "Set Up Private Vault" : "Unlock Vault"}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
