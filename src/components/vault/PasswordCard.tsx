import React, { useState, useEffect } from "react";
import {
  ExternalLink,
  Copy,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  FileText,
  Clock,
  Shield,
  KeyRound,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { type DecryptedPasswordItem, useVault } from "./VaultContext";
import { formatDistanceToNow, format } from "date-fns";

interface PasswordCardProps {
  item: DecryptedPasswordItem;
  onEdit: (item: DecryptedPasswordItem) => void;
}

export function PasswordCard({ item, onEdit }: PasswordCardProps) {
  const { deletePassword, isWindowBlurred } = useVault();
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<"username" | "password" | "notes" | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Mask revealed passwords automatically when window loses focus
  useEffect(() => {
    if (isWindowBlurred && showPassword) {
      setShowPassword(false);
    }
  }, [isWindowBlurred, showPassword]);

  const copyToClipboard = async (text: string, field: "username" | "password" | "notes") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      const labels = { username: "Username", password: "Password", notes: "Private Notes" };
      toast.success(`${labels[field]} copied to clipboard.`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deletePassword(item.id);
      setDeleteConfirmOpen(false);
    } catch (err) {
      toast.error("Failed to delete password entry.");
    } finally {
      setIsDeleting(false);
    }
  };

  const urlDisplay = item.data.url
    ? item.data.url.replace(/^https?:\/\//i, "").replace(/\/$/, "")
    : null;

  return (
    <>
      <Card className="group relative flex flex-col justify-between overflow-hidden border border-border/70 bg-card transition-all duration-200 hover:border-primary/40 hover:shadow-md">
        <div>
          {/* Card Header */}
          <CardHeader className="flex flex-row items-start justify-between gap-3 p-4 pb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {item.data.name}
                </h3>
                {urlDisplay && (
                  <a
                    href={item.data.url?.startsWith("http") ? item.data.url : `https://${item.data.url}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors truncate max-w-[200px]"
                  >
                    <span className="truncate">{urlDisplay}</span>
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => onEdit(item)}
                title="Edit entry"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                title="Delete entry"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>

          {/* Credentials Body */}
          <CardContent className="space-y-3 p-4 pt-1 text-xs">
            {/* Username / Email Row */}
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1 font-medium">
                <span className="flex items-center gap-1">
                  <UserRound className="h-3 w-3" />
                  Email / Username
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(item.data.username, "username")}
                  className="flex items-center gap-1 text-primary hover:underline font-semibold"
                >
                  {copiedField === "username" ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      <span className="text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="select-all font-mono font-medium text-foreground truncate">
                {item.data.username || "—"}
              </p>
            </div>

            {/* Password Row */}
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1 font-medium">
                <span className="flex items-center gap-1">
                  <KeyRound className="h-3 w-3" />
                  Password
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="flex items-center gap-1 hover:text-foreground font-medium"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <>
                        <EyeOff className="h-3 w-3" />
                        <span>Hide</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" />
                        <span>Show</span>
                      </>
                    )}
                  </button>
                  <span className="text-muted-foreground/40">•</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(item.data.password, "password")}
                    className="flex items-center gap-1 text-primary hover:underline font-semibold"
                  >
                    {copiedField === "password" ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span className="text-emerald-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <p className="font-mono font-medium text-foreground tracking-wider select-all break-all">
                {showPassword ? item.data.password : "••••••••••••••••"}
              </p>
            </div>

            {/* Private Notes Section (Mandatory on every password card) */}
            <div className="rounded-lg border bg-accent/20 p-2.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1 font-medium">
                <span className="flex items-center gap-1 font-semibold text-foreground/80">
                  <FileText className="h-3 w-3 text-primary" />
                  Private Notes
                </span>
                {item.data.notes && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(item.data.notes, "notes")}
                    className="flex items-center gap-1 text-primary hover:underline font-semibold"
                  >
                    {copiedField === "notes" ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span className="text-emerald-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              {item.data.notes ? (
                <p className="whitespace-pre-wrap text-muted-foreground text-[11.5px] leading-relaxed max-h-32 overflow-y-auto">
                  {item.data.notes}
                </p>
              ) : (
                <p className="italic text-muted-foreground/60 text-[11px]">No private notes saved.</p>
              )}
            </div>
          </CardContent>
        </div>

        {/* Footer / Timestamps */}
        <CardFooter className="flex items-center justify-between border-t bg-muted/10 px-4 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            <span>Updated {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}</span>
          </div>
          <span title={format(new Date(item.createdAt), "PPpp")}>
            Created {format(new Date(item.createdAt), "MMM d, yyyy")}
          </span>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved password?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the credentials for{" "}
              <strong className="text-foreground">{item.data.name}</strong>? This action is permanent
              and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Password"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
