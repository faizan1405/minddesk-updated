import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Copy,
  Check,
  FileText,
  FileIcon,
  Shield,
  Loader2,
  Calendar,
  Tag,
  Hash,
} from "lucide-react";
import { toast } from "sonner";
import { type DecryptedDocumentItem, useVault } from "./VaultContext";
import { downloadVaultAttachmentApi } from "@/lib/vault-client";
import { decryptDocumentFile } from "@/lib/vault-crypto";
import { format, differenceInDays } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

interface DocumentViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DecryptedDocumentItem | null;
}

export function DocumentViewerModal({ open, onOpenChange, document: doc }: DocumentViewerModalProps) {
  const { user } = useAuth();
  const { getAttachmentCryptoKey } = useVault();

  const [activeAttachmentIndex, setActiveAttachmentIndex] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [copiedNotes, setCopiedNotes] = useState(false);
  const activeBlobUrlRef = useRef<string | null>(null);

  const activeAttachment = doc?.data.attachments[activeAttachmentIndex] || null;

  // Clean up blob URL safely
  const revokeActiveBlob = () => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    setBlobUrl(null);
  };

  useEffect(() => {
    return () => {
      revokeActiveBlob();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      revokeActiveBlob();
      setActiveAttachmentIndex(0);
      setZoomLevel(1);
    }
  }, [open]);

  // Load and decrypt attachment when active attachment changes
  useEffect(() => {
    let cancelled = false;

    async function loadAttachment() {
      if (!open || !doc || !activeAttachment || !user) {
        revokeActiveBlob();
        return;
      }

      setLoading(true);
      revokeActiveBlob();
      setZoomLevel(1);

      try {
        const key = await getAttachmentCryptoKey(activeAttachment.id);
        if (!key) throw new Error("Vault is locked or key unavailable.");

        const { buffer, iv } = await downloadVaultAttachmentApi(activeAttachment.id);
        if (cancelled) return;

        const decryptedBuffer = await decryptDocumentFile(
          buffer,
          key,
          doc.id,
          activeAttachment.id,
          user.id,
          iv || activeAttachment.iv,
        );

        if (cancelled) return;

        const blob = new Blob([decryptedBuffer], {
          type: activeAttachment.mimeType || "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);
        activeBlobUrlRef.current = url;
        setBlobUrl(url);
      } catch (err: any) {
        console.error("[vault-viewer] Decryption failed:", err);
        if (!cancelled) {
          toast.error("Failed to decrypt document attachment.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAttachment();

    return () => {
      cancelled = true;
    };
  }, [open, doc, activeAttachment, user, getAttachmentCryptoKey]);

  if (!doc) return null;

  const handleDownload = () => {
    if (!blobUrl || !activeAttachment) return;
    const a = window.document.createElement("a");
    a.href = blobUrl;
    a.download = activeAttachment.fileName || `${doc.data.title}.bin`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    toast.success("Download started.");
  };

  const copyNotes = async () => {
    if (!doc.data.notes) return;
    try {
      await navigator.clipboard.writeText(doc.data.notes);
      setCopiedNotes(true);
      toast.success("Private notes copied.");
      setTimeout(() => setCopiedNotes(false), 2000);
    } catch {
      toast.error("Failed to copy notes.");
    }
  };

  const isPdf = activeAttachment?.mimeType?.toLowerCase().includes("pdf");
  const isImage =
    activeAttachment?.mimeType?.toLowerCase().includes("image") ||
    /\.(png|jpe?g|webp)$/i.test(activeAttachment?.fileName || "");

  // Expiry check
  let expiryStatus: { label: string; color: string } | null = null;
  if (doc.data.expiryDate) {
    const days = differenceInDays(new Date(doc.data.expiryDate), new Date());
    if (days < 0) {
      expiryStatus = { label: "Expired", color: "bg-red-500 text-white" };
    } else if (days <= 30) {
      expiryStatus = { label: `Expires in ${days} days`, color: "bg-amber-500 text-white" };
    } else {
      expiryStatus = { label: "Valid", color: "bg-emerald-600/90 text-white" };
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] w-[95vw] max-w-5xl flex flex-col p-4 sm:p-6 overflow-hidden">
        {/* Header */}
        <DialogHeader className="border-b pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-semibold tracking-tight text-foreground">
                  {doc.data.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {doc.data.category} • Client-side decrypted in browser sandbox
                </DialogDescription>
              </div>
            </div>

            {expiryStatus && (
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${expiryStatus.color}`}>
                {expiryStatus.label}
              </span>
            )}
          </div>

          {/* Attachment Selector Tabs (if multiple attachments like Front & Back) */}
          {doc.data.attachments.length > 1 && (
            <div className="flex gap-1.5 pt-3 overflow-x-auto">
              {doc.data.attachments.map((att, idx) => (
                <Button
                  key={att.id}
                  type="button"
                  size="sm"
                  variant={idx === activeAttachmentIndex ? "default" : "outline"}
                  onClick={() => setActiveAttachmentIndex(idx)}
                  className="h-8 gap-1.5 px-3 text-xs"
                >
                  <FileIcon className="h-3.5 w-3.5" />
                  <span>{att.label || `Attachment ${idx + 1}`}</span>
                </Button>
              ))}
            </div>
          )}
        </DialogHeader>

        {/* Viewer Content Area */}
        <div className="relative flex-1 min-h-[350px] max-h-[60vh] rounded-xl border bg-muted/20 overflow-hidden my-3 flex flex-col items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs font-medium">Decrypting attachment from vault...</p>
            </div>
          ) : !blobUrl ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <FileIcon className="h-8 w-8 text-muted-foreground/60" />
              <p className="text-xs">No attachment available to preview.</p>
            </div>
          ) : isPdf ? (
            <iframe
              src={blobUrl}
              title={doc.data.title}
              className="h-full w-full rounded-lg border-0"
            />
          ) : isImage ? (
            <div className="h-full w-full overflow-auto flex items-center justify-center p-4">
              <img
                src={blobUrl}
                alt={activeAttachment?.label || doc.data.title}
                style={{ transform: `scale(${zoomLevel})` }}
                className="max-h-full max-w-full object-contain rounded transition-transform duration-150"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center p-6">
              <FileIcon className="h-10 w-10 text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {activeAttachment?.fileName || "Encrypted File"}
                </p>
                <p className="text-xs text-muted-foreground">
                  File type: {activeAttachment?.mimeType || "Binary"}
                </p>
              </div>
              <Button size="sm" onClick={handleDownload} className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                Download Decrypted File
              </Button>
            </div>
          )}

          {/* Floating Image Zoom Controls */}
          {isImage && blobUrl && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow backdrop-blur">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setZoomLevel(1)}
                title="Reset Zoom"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Document Details & Private Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs border-t pt-3">
          <div className="space-y-1.5">
            {doc.data.documentNumber && (
              <div className="flex items-center gap-1.5 text-foreground font-mono">
                <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-semibold">Document No:</span>
                <span>{doc.data.documentNumber}</span>
              </div>
            )}
            {doc.data.expiryDate && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>Expiry Date: {format(new Date(doc.data.expiryDate), "PPP")}</span>
              </div>
            )}
            {doc.data.tags && doc.data.tags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {doc.data.tags.map((t) => (
                  <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Private Notes Section */}
          <div className="rounded-lg border bg-accent/20 p-2.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-foreground/80 mb-1">
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5 text-primary" />
                Private Notes
              </span>
              {doc.data.notes && (
                <button
                  type="button"
                  onClick={copyNotes}
                  className="flex items-center gap-1 text-primary hover:underline text-[10px]"
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
            {doc.data.notes ? (
              <p className="whitespace-pre-wrap text-muted-foreground text-[11.5px] leading-relaxed max-h-24 overflow-y-auto">
                {doc.data.notes}
              </p>
            ) : (
              <p className="italic text-muted-foreground/60 text-[11px]">No notes saved for this document.</p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t mt-3">
          <p className="text-[11px] text-muted-foreground">
            Temporary memory URLs are revoked immediately upon closing.
          </p>
          <div className="flex items-center gap-2">
            {blobUrl && (
              <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                Download Decrypted
              </Button>
            )}
            <Button size="sm" onClick={() => onOpenChange(false)} className="text-xs">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
