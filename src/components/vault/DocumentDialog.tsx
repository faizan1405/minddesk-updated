import React, { useState, useEffect, useRef } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileCheck2,
  Upload,
  X,
  FileIcon,
  ShieldAlert,
  Plus,
  Layers,
  Calendar,
  Lock,
} from "lucide-react";
import { type DecryptedDocumentItem, useVault } from "./VaultContext";
import { toast } from "sonner";

interface DocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem?: DecryptedDocumentItem | null;
}

export const DOCUMENT_PRESET_CATEGORIES = [
  "Identity Documents",
  "Educational Documents",
  "Vehicle Documents",
  "Financial Documents",
  "Property Documents",
  "Insurance",
  "Medical & Health",
  "Work & Career",
  "Other",
] as const;

export const MAX_DOCUMENT_FILE_SIZE = 15 * 1024 * 1024; // 15MB
export const ALLOWED_DOC_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

/**
 * Reads a File or Blob into an ArrayBuffer across all environments (browser, Web Worker, and test runners).
 */
export async function readFileAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") {
    try {
      return await blob.arrayBuffer();
    } catch {
      // Fallback to FileReader if native arrayBuffer rejects
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file buffer"));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Validates document magic bytes client-side before encrypting and staging.
 * Supports PDF (%PDF), PNG (\x89PNG), JPEG (\xFF\xD8\xFF), and WebP (RIFF....WEBP).
 */
export async function validateDocumentFileMagicBytes(file: File): Promise<boolean> {
  try {
    const slice = file.slice(0, 16);
    const arrayBuffer = await readFileAsArrayBuffer(slice);
    const buf = new Uint8Array(arrayBuffer);
    if (buf.length < 4) return false;

    // PDF: %PDF (0x25 0x50 0x44 0x46)
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
      return true;
    }
    // PNG: \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
    if (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return true;
    }
    // JPEG: 0xFF 0xD8 0xFF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return true;
    }
    // WebP: RIFF....WEBP (0x52 0x49 0x46 0x46 .... 0x57 0x45 0x42 0x50)
    if (
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function DocumentDialog({ open, onOpenChange, editingItem }: DocumentDialogProps) {
  const { saveDocument } = useVault();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Identity Documents");
  const [customCategory, setCustomCategory] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  // Existing attachments (for editing)
  const [existingAttachments, setExistingAttachments] = useState(
    editingItem ? editingItem.data.attachments : [],
  );

  // P1: Track removed attachment IDs to invoke authorized deletion workflow on submit
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);

  // New staged attachments
  const [stagedFiles, setStagedFiles] = useState<Array<{ id: string; file: File; label: string }>>(
    [],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingItem) {
      setTitle(editingItem.data.title || "");
      if ((DOCUMENT_PRESET_CATEGORIES as readonly string[]).includes(editingItem.data.category)) {
        setCategory(editingItem.data.category);
        setCustomCategory("");
      } else {
        setCategory("Custom");
        setCustomCategory(editingItem.data.category);
      }
      setDocumentNumber(editingItem.data.documentNumber || "");
      setIssueDate(editingItem.data.issueDate || "");
      setExpiryDate(editingItem.data.expiryDate || "");
      setNotes(editingItem.data.notes || "");
      setTagsInput(editingItem.data.tags ? editingItem.data.tags.join(", ") : "");
      setExistingAttachments(editingItem.data.attachments || []);
    } else {
      setTitle("");
      setCategory("Identity Documents");
      setCustomCategory("");
      setDocumentNumber("");
      setIssueDate("");
      setExpiryDate("");
      setNotes("");
      setTagsInput("");
      setExistingAttachments([]);
    }
    setRemovedAttachmentIds([]);
    setStagedFiles([]);
  }, [editingItem, open]);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validNewFiles: Array<{ id: string; file: File; label: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      if (f.size > MAX_DOCUMENT_FILE_SIZE) {
        toast.error(`"${f.name}" exceeds 15 MB limit and cannot be added.`);
        continue;
      }

      const mime = f.type.toLowerCase();
      const ext = f.name.toLowerCase();
      const isAllowedExtOrMime =
        ALLOWED_DOC_TYPES.includes(mime) || /\.(pdf|png|jpe?g|webp)$/i.test(ext);

      if (!isAllowedExtOrMime) {
        toast.error(`"${f.name}" has unsupported format. Use PDF, PNG, JPG, or WebP.`);
        continue;
      }

      // Client-side magic bytes validation
      const isValidBytes = await validateDocumentFileMagicBytes(f);
      if (!isValidBytes) {
        toast.error(
          `"${f.name}" has invalid or disguised file contents. Only authentic PDF, PNG, JPG, or WebP files are permitted.`,
        );
        continue;
      }

      // Default label heuristic: if 1st file -> "Front Side", 2nd -> "Back Side"
      let defaultLabel = "Document File";
      const totalCount = existingAttachments.length + stagedFiles.length + validNewFiles.length;
      if (totalCount === 0) defaultLabel = "Front Side";
      else if (totalCount === 1) defaultLabel = "Back Side";
      else defaultLabel = `Page ${totalCount + 1}`;

      validNewFiles.push({
        id: crypto.randomUUID(),
        file: f,
        label: defaultLabel,
      });
    }

    setStagedFiles((prev) => [...prev, ...validNewFiles]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilesSelected(e.dataTransfer.files);
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const removeExistingAttachment = (attId: string) => {
    setExistingAttachments((prev) => prev.filter((a) => a.id !== attId));
    setRemovedAttachmentIds((prev) => (prev.includes(attId) ? prev : [...prev, attId]));
  };

  const updateStagedLabel = (id: string, label: string) => {
    setStagedFiles((prev) => prev.map((f) => (f.id === id ? { ...f, label } : f)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Document title is required.");
      return;
    }

    const finalCategory = category === "Custom" ? customCategory.trim() || "Other" : category;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    setIsSubmitting(true);
    try {
      await saveDocument(
        {
          title: title.trim(),
          category: finalCategory,
          documentNumber: documentNumber.trim() || undefined,
          issueDate: issueDate || undefined,
          expiryDate: expiryDate || undefined,
          notes: notes.trim(),
          tags: tags.length > 0 ? tags : undefined,
          attachments: existingAttachments,
        },
        editingItem?.id,
        stagedFiles.map((s) => ({ label: s.label, file: s.file })),
        removedAttachmentIds,
        editingItem?.version,
      );
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save document.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <FileCheck2 className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-semibold">
              {editingItem ? "Edit Vault Document" : "Add Document to Keeper"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Files and metadata are client-side encrypted before storage. Safe for identity cards &
            records.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Document Title & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title" className="text-xs font-medium">
                Document Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="doc-title"
                placeholder="e.g. Aadhaar Card, Driving Licence, Degree"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_PRESET_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat} className="text-xs">
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value="Custom" className="text-xs font-medium text-primary">
                    + Custom Category...
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Custom Category Input (if chosen) */}
          {category === "Custom" && (
            <div className="space-y-1.5">
              <Label htmlFor="custom-category" className="text-xs font-medium">
                Custom Category Name
              </Label>
              <Input
                id="custom-category"
                placeholder="e.g. Tax Records, Membership Cards"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="text-xs"
              />
            </div>
          )}

          {/* Document Number & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-number" className="text-xs font-medium">
                Doc Number <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="doc-number"
                placeholder="e.g. DL-14201100123"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-issue-date" className="text-xs font-medium">
                Issue Date <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="doc-issue-date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-expiry-date" className="text-xs font-medium">
                Expiry Date <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="doc-expiry-date"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          {/* Attachments Section & Drag-Drop Zone */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                Document Attachments{" "}
                <span className="text-muted-foreground font-normal">(PDF, JPG, PNG, WebP)</span>
              </Label>
              <span className="text-[10px] text-muted-foreground">Up to 15 MB / file</span>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-border/80 hover:border-primary/50 hover:bg-muted/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
              <Upload className="h-6 w-6 text-muted-foreground/80" />
              <p className="text-xs font-medium text-foreground">
                Drop files here or click to browse
              </p>
              <p className="text-[11px] text-muted-foreground">
                Attach front & back of identity card, multi-page certificates, or PDFs
              </p>
            </div>

            {/* Attachment List */}
            {(existingAttachments.length > 0 || stagedFiles.length > 0) && (
              <div className="space-y-1.5 pt-1">
                {/* Existing Attachments */}
                {existingAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileIcon className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold text-foreground truncate">{att.label}</span>
                      <span className="text-muted-foreground truncate text-[11px]">
                        ({att.fileName})
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeExistingAttachment(att.id)}
                      title="Remove attachment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                {/* Staged New Files */}
                {stagedFiles.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileIcon className="h-4 w-4 text-primary shrink-0" />
                      <Input
                        value={item.label}
                        onChange={(e) => updateStagedLabel(item.id, e.target.value)}
                        placeholder="Label (e.g. Front Side)"
                        className="h-7 text-xs max-w-[150px]"
                      />
                      <span className="text-muted-foreground text-[11px] truncate">
                        {item.file.name} ({(item.file.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeStagedFile(item.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dedicated Private Notes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="doc-notes" className="text-xs font-medium">
                Private Document Notes{" "}
                <span className="text-muted-foreground font-normal">(multiline)</span>
              </Label>
              <span className="text-[10px] text-muted-foreground">Encrypted with document</span>
            </div>
            <Textarea
              id="doc-notes"
              placeholder="e.g. Renewal instructions, physical document location, policy numbers, or notes for family."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="text-xs leading-relaxed"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-tags" className="text-xs font-medium">
              Tags <span className="text-muted-foreground font-normal">(comma-separated)</span>
            </Label>
            <Input
              id="doc-tags"
              placeholder="e.g. identity, car, renewal, official"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="text-xs"
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
              <Lock className="h-3.5 w-3.5" />
              <span>
                {isSubmitting
                  ? "Encrypting & Uploading..."
                  : editingItem
                    ? "Update Document"
                    : "Save to Vault"}
              </span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
