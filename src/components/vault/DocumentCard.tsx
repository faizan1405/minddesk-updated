import React, { useState } from "react";
import {
  FileText,
  FileCheck2,
  Download,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Calendar,
  Layers,
  Copy,
  Check,
  Shield,
  File,
  Sparkles,
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
import { type DecryptedDocumentItem, useVault } from "./VaultContext";
import { format, differenceInDays } from "date-fns";

interface DocumentCardProps {
  item: DecryptedDocumentItem;
  onView: (item: DecryptedDocumentItem) => void;
  onEdit: (item: DecryptedDocumentItem) => void;
}

export function DocumentCard({ item, onView, onEdit }: DocumentCardProps) {
  const { deleteDocument } = useVault();
  const [revealNumber, setRevealNumber] = useState(false);
  const [copiedNotes, setCopiedNotes] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const copyNotes = async () => {
    if (!item.data.notes) return;
    try {
      await navigator.clipboard.writeText(item.data.notes);
      setCopiedNotes(true);
      toast.success("Document notes copied to clipboard.");
      setTimeout(() => setCopiedNotes(false), 2000);
    } catch {
      toast.error("Failed to copy notes.");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteDocument(item.id);
      setDeleteConfirmOpen(false);
    } catch {
      toast.error("Failed to delete document.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Mask document number (e.g. DL, PAN, Aadhaar) by default: show last 4 chars
  const maskedDocNumber = item.data.documentNumber
    ? revealNumber
      ? item.data.documentNumber
      : item.data.documentNumber.length > 4
        ? `••••${item.data.documentNumber.slice(-4)}`
        : "••••"
    : null;

  // Expiry check
  let expiryStatus: { label: string; badgeCls: string } | null = null;
  if (item.data.expiryDate) {
    const days = differenceInDays(new Date(item.data.expiryDate), new Date());
    if (days < 0) {
      expiryStatus = { label: "Expired", badgeCls: "bg-destructive text-destructive-foreground" };
    } else if (days <= 30) {
      expiryStatus = {
        label: `Expires in ${days} days`,
        badgeCls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/30",
      };
    } else {
      expiryStatus = {
        label: `Expires ${format(new Date(item.data.expiryDate), "MMM yyyy")}`,
        badgeCls: "bg-muted text-muted-foreground",
      };
    }
  }

  const attachmentCount = item.data.attachments.length;

  return (
    <>
      <Card className="group relative flex flex-col justify-between overflow-hidden border border-border/70 bg-card transition-all duration-200 hover:border-primary/40 hover:shadow-md">
        <div>
          {/* Card Header */}
          <CardHeader className="flex flex-row items-start justify-between gap-3 p-4 pb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
                <FileCheck2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {item.data.title}
                </h3>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground truncate">
                    {item.data.category}
                  </span>
                  {expiryStatus && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${expiryStatus.badgeCls}`}>
                      {expiryStatus.label}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => onEdit(item)}
                title="Edit document details"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                title="Delete document"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>

          {/* Document Content */}
          <CardContent className="space-y-3 p-4 pt-1 text-xs">
            {/* Document Number & Attachments Count */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <span className="block text-[10px] text-muted-foreground font-medium mb-0.5">
                  Document Number
                </span>
                <div className="flex items-center justify-between font-mono font-medium">
                  <span className="truncate">{maskedDocNumber || "—"}</span>
                  {item.data.documentNumber && (
                    <button
                      type="button"
                      onClick={() => setRevealNumber((prev) => !prev)}
                      className="text-muted-foreground hover:text-foreground"
                      title={revealNumber ? "Mask number" : "Reveal number"}
                    >
                      {revealNumber ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-2.5">
                <span className="block text-[10px] text-muted-foreground font-medium mb-0.5">
                  Attachments
                </span>
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>
                    {attachmentCount > 0 ? `${attachmentCount} file${attachmentCount > 1 ? "s" : ""}` : "No files"}
                  </span>
                </div>
              </div>
            </div>

            {/* Private Notes Section (Dedicated on every document card) */}
            <div className="rounded-lg border bg-accent/20 p-2.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1 font-medium">
                <span className="flex items-center gap-1 font-semibold text-foreground/80">
                  <FileText className="h-3 w-3 text-primary" />
                  Private Notes
                </span>
                {item.data.notes && (
                  <button
                    type="button"
                    onClick={copyNotes}
                    className="flex items-center gap-1 text-primary hover:underline font-semibold"
                  >
                    {copiedNotes ? (
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
                <p className="whitespace-pre-wrap text-muted-foreground text-[11.5px] leading-relaxed max-h-24 overflow-y-auto">
                  {item.data.notes}
                </p>
              ) : (
                <p className="italic text-muted-foreground/60 text-[11px]">No private notes saved.</p>
              )}
            </div>
          </CardContent>
        </div>

        {/* Footer Actions */}
        <CardFooter className="flex items-center justify-between border-t bg-muted/10 px-4 py-2 text-xs">
          <Button
            size="sm"
            variant="default"
            className="h-8 gap-1.5 px-3 text-xs font-medium"
            onClick={() => onView(item)}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>View Document</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 px-3 text-xs font-medium"
            onClick={() => onView(item)}
            title="Download decrypted document"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download</span>
          </Button>
        </CardFooter>
      </Card>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong className="text-foreground">{item.data.title}</strong> and all its encrypted
              attachments? This action is permanent and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Document"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
