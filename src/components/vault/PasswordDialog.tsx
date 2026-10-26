import React, { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Eye, EyeOff, KeyRound, Sparkles, ShieldCheck } from "lucide-react";
import { PasswordGenerator } from "./PasswordGenerator";
import { type DecryptedPasswordItem, useVault } from "./VaultContext";
import { toast } from "sonner";

interface PasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem?: DecryptedPasswordItem | null;
}

export function PasswordDialog({ open, onOpenChange, editingItem }: PasswordDialogProps) {
  const { savePassword } = useVault();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.data.name || "");
      setUrl(editingItem.data.url || "");
      setUsername(editingItem.data.username || "");
      setPassword(editingItem.data.password || "");
      setNotes(editingItem.data.notes || "");
    } else {
      setName("");
      setUrl("");
      setUsername("");
      setPassword("");
      setNotes("");
    }
    setShowPassword(false);
    setShowGenerator(false);
  }, [editingItem, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Account name is required.");
      return;
    }
    if (!password) {
      toast.error("Password is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await savePassword(
        {
          name: name.trim(),
          url: url.trim() || undefined,
          username: username.trim(),
          password,
          notes: notes.trim(),
        },
        editingItem?.id,
        editingItem?.version,
      );
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-semibold">
              {editingItem ? "Edit Password Entry" : "Add Password to Vault"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Credentials and private notes are client-side encrypted with AES-256-GCM before saving.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Account / Website Name */}
          <div className="space-y-1.5">
            <Label htmlFor="account-name" className="text-xs font-medium">
              Account / Service Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="account-name"
              placeholder="e.g. Instagram, Hostinger, GitHub, Work Email"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="text-xs"
            />
          </div>

          {/* Website URL */}
          <div className="space-y-1.5">
            <Label htmlFor="website-url" className="text-xs font-medium">
              Website URL <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="website-url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          {/* Username / Email */}
          <div className="space-y-1.5">
            <Label htmlFor="account-username" className="text-xs font-medium">
              Username or Email
            </Label>
            <Input
              id="account-username"
              placeholder="name@example.com or @handle"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          {/* Password with Show/Hide and Generator toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="account-password" className="text-xs font-medium">
                Password <span className="text-destructive">*</span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] font-semibold text-primary"
                onClick={() => setShowGenerator((prev) => !prev)}
              >
                <Sparkles className="h-3 w-3" />
                <span>{showGenerator ? "Hide Generator" : "Generate Password"}</span>
              </Button>
            </div>

            <div className="relative">
              <Input
                id="account-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

          {/* Collapsible Built-in Password Generator */}
          {showGenerator && (
            <PasswordGenerator
              onUsePassword={(generated) => {
                setPassword(generated);
                setShowGenerator(false);
                setShowPassword(true);
              }}
            />
          )}

          {/* Dedicated Private Notes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="account-notes" className="text-xs font-medium">
                Private Notes <span className="text-muted-foreground font-normal">(multiline)</span>
              </Label>
              <span className="text-[10px] text-muted-foreground">Encrypted with credentials</span>
            </div>
            <Textarea
              id="account-notes"
              placeholder="Save 2FA recovery codes, security questions, renewal notes, or backup instructions. Line breaks are preserved."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="text-xs leading-relaxed"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Saving..." : editingItem ? "Update Entry" : "Save to Vault"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
