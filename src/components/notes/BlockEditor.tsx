import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  Code2,
  Copy,
  CopyPlus,
  FileDown,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  Lightbulb,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { newBlockId, type Block, type BlockType, type CalloutType } from "@/lib/page-content";
import { uploadNoteImage, validateImageFile } from "@/lib/images-client";
import type { FocusTarget } from "@/lib/notes-history";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type { FocusTarget };

interface SlashCommand {
  type: BlockType;
  title: string;
  description: string;
  icon: typeof List;
  keywords: string[];
}

/**
 * Simplified block creation palette:
 * Only Plain Text, Bulleted List, Numbered List, Checklist, Divider, Image.
 */
const SLASH_COMMANDS: SlashCommand[] = [
  {
    type: "p",
    title: "Text",
    description: "Just start writing with plain text.",
    icon: Pilcrow,
    keywords: ["text", "paragraph", "plain", "p"],
  },
  {
    type: "bullet",
    title: "Bulleted List",
    description: "Create a simple bulleted list.",
    icon: List,
    keywords: ["bullet", "list", "unordered", "-", "*"],
  },
  {
    type: "number",
    title: "Numbered List",
    description: "Create a list with sequential numbers.",
    icon: ListOrdered,
    keywords: ["numbered", "number", "ordered", "1.", "count"],
  },
  {
    type: "check",
    title: "Checklist",
    description: "Track tasks with a to-do checkbox.",
    icon: ListChecks,
    keywords: ["todo", "task", "check", "checklist", "box", "[]"],
  },
  {
    type: "divider",
    title: "Divider",
    description: "Visually separate sections with a line.",
    icon: Minus,
    keywords: ["divider", "line", "separator", "hr", "rule", "---"],
  },
  {
    type: "image",
    title: "Image",
    description: "Insert photos or screenshots.",
    icon: ImageIcon,
    keywords: ["image", "photo", "picture", "screenshot", "img", "upload"],
  },
];

const CODE_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "html",
  "css",
  "json",
  "sql",
  "bash",
  "markdown",
  "plain",
] as const;

export function BlockEditor({
  blocks,
  onChange,
  focusFirstSignal,
  onExportPdf,
  isExporting,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  pendingFocusExternal,
}: {
  blocks: Block[];
  onChange: (
    b: Block[] | ((prev: Block[]) => Block[]),
    isTyping?: boolean,
    cursor?: FocusTarget | null,
  ) => void;
  focusFirstSignal?: number;
  onExportPdf?: () => void;
  isExporting?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  pendingFocusExternal?: FocusTarget | null;
}) {
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);

  const [pendingFocus, setPendingFocus] = useState<FocusTarget | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [slashMenu, setSlashMenu] = useState<{
    blockId: string;
    index: number;
    query: string;
    selectedIndex: number;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Image block states
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<{
    url: string;
    caption?: string | undefined;
    alt?: string | undefined;
  } | null>(null);

  // Focus management
  useLayoutEffect(() => {
    if (!pendingFocus || !pendingFocus.id) return;
    const el = refs.current.get(pendingFocus.id);
    if (el) {
      el.focus();
      const pos = Math.min(pendingFocus.pos, el.value.length);
      const end =
        pendingFocus.endPos !== undefined ? Math.min(pendingFocus.endPos, el.value.length) : pos;
      el.setSelectionRange(pos, end);
    }
    setPendingFocus(null);
  }, [pendingFocus, blocks]);

  useLayoutEffect(() => {
    if (!pendingFocusExternal || !pendingFocusExternal.id) return;
    const el = refs.current.get(pendingFocusExternal.id);
    if (el) {
      el.focus();
      const pos = Math.min(pendingFocusExternal.pos, el.value.length);
      const end =
        pendingFocusExternal.endPos !== undefined
          ? Math.min(pendingFocusExternal.endPos, el.value.length)
          : pos;
      el.setSelectionRange(pos, end);
    }
  }, [pendingFocusExternal]);

  useLayoutEffect(() => {
    if (focusFirstSignal && blocks[0]) {
      setPendingFocus({ id: blocks[0].id, pos: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFirstSignal]);

  const update = useCallback(
    (id: string, patch: Partial<Block>, isTyping = false, cursorOverride?: FocusTarget | null) => {
      const el = refs.current.get(id);
      const cursor: FocusTarget | null =
        cursorOverride !== undefined
          ? cursorOverride
          : {
              id,
              pos: el?.selectionStart ?? 0,
              endPos: el?.selectionEnd ?? 0,
            };
      onChange(
        (prevBlocks) => prevBlocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        isTyping,
        cursor,
      );
    },
    [onChange],
  );

  function setType(id: string, type: BlockType) {
    const cur = blocks.find((b) => b.id === id);
    if (!cur) return;
    const nextType: BlockType = cur.type === type && type !== "p" ? "p" : type;

    if (nextType === "image") {
      update(
        id,
        {
          type: "image",
          checked: undefined,
          language: undefined,
          calloutType: undefined,
          text: "",
        },
        false,
      );
      setSlashMenu(null);
      replaceTargetRef.current = id;
      fileInputRef.current?.click();
      return;
    }

    update(
      id,
      {
        type: nextType,
        checked: nextType === "check" ? (cur.checked ?? false) : undefined,
        language: nextType === "code" ? (cur.language ?? "typescript") : undefined,
        calloutType: nextType === "callout" ? (cur.calloutType ?? "info") : undefined,
        text: nextType === "divider" ? "" : cur.text,
      },
      false,
    );
    setSlashMenu(null);
    const el = refs.current.get(id);
    setPendingFocus({ id, pos: el?.selectionStart ?? cur.text.length });
  }

  function insertBlockAfter(index: number, type: BlockType = "p") {
    const nb: Block = {
      id: newBlockId(),
      type,
      text: "",
      ...(type === "check" ? { checked: false } : {}),
      ...(type === "code" ? { language: "typescript" } : {}),
      ...(type === "callout" ? { calloutType: "info" } : {}),
    };
    const next = [...blocksRef.current];
    next.splice(index + 1, 0, nb);
    const cursor: FocusTarget = { id: nb.id, pos: 0, endPos: 0 };
    onChange(next, false, cursor);
    setPendingFocus({ id: nb.id, pos: 0 });
    setSlashMenu(null);
  }

  function duplicateBlock(id: string) {
    const current = blocksRef.current;
    const index = current.findIndex((b) => b.id === id);
    if (index === -1) return;
    const source = current[index]!;
    const nb: Block = {
      ...source,
      id: newBlockId(),
    };
    const next = [...current];
    next.splice(index + 1, 0, nb);
    const cursor: FocusTarget = {
      id: nb.id,
      pos: source.text.length,
      endPos: source.text.length,
    };
    onChange(next, false, cursor);
    setPendingFocus({ id: nb.id, pos: source.text.length });
  }

  function deleteBlock(id: string) {
    const current = blocksRef.current;
    if (current.length <= 1) {
      // Keep at least one empty paragraph block
      const emptyBlock: Block = { id: newBlockId(), type: "p", text: "" };
      onChange([emptyBlock], false, { id: emptyBlock.id, pos: 0, endPos: 0 });
      return;
    }
    const index = current.findIndex((b) => b.id === id);
    const next = current.filter((b) => b.id !== id);
    const targetIdx = Math.max(0, index - 1);
    const target = next[targetIdx];
    const cursor: FocusTarget | null = target
      ? { id: target.id, pos: target.text.length, endPos: target.text.length }
      : null;
    onChange(next, false, cursor);
    if (target) {
      setPendingFocus({ id: target.id, pos: target.text.length });
    }
  }

  function moveBlock(index: number, direction: "up" | "down") {
    const current = blocksRef.current;
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(index, 1);
    if (moved) {
      next.splice(targetIdx, 0, moved);
      const cursor: FocusTarget = {
        id: moved.id,
        pos: moved.text.length,
        endPos: moved.text.length,
      };
      onChange(next, false, cursor);
      setPendingFocus({ id: moved.id, pos: moved.text.length });
    }
  }

  function copyCode(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur));
    }, 2000);
  }

  function cycleCalloutType(id: string, current?: CalloutType) {
    const order: CalloutType[] = ["info", "tip", "warning", "quote"];
    const curIdx = order.indexOf(current || "info");
    const nextType = order[(curIdx + 1) % order.length]!;
    update(id, { calloutType: nextType }, false);
  }

  // Formatting helper for Bold (**)
  function applyInlineFormat(blockId: string, prefix = "**", suffix = prefix) {
    const el = refs.current.get(blockId);
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;
    const selected = val.slice(start, end);

    if (start !== end) {
      const before = val.slice(0, start);
      const after = val.slice(end);
      if (before.endsWith(prefix) && after.startsWith(suffix)) {
        // Unwrap
        const newText = before.slice(0, -prefix.length) + selected + after.slice(suffix.length);
        const cursor: FocusTarget = {
          id: blockId,
          pos: start - prefix.length,
          endPos: end - prefix.length,
        };
        update(blockId, { text: newText }, false, cursor);
        setPendingFocus({
          id: blockId,
          pos: start - prefix.length,
          endPos: end - prefix.length,
        });
      } else {
        // Wrap
        const newText = before + prefix + selected + suffix + after;
        const cursor: FocusTarget = {
          id: blockId,
          pos: start + prefix.length,
          endPos: end + prefix.length,
        };
        update(blockId, { text: newText }, false, cursor);
        setPendingFocus({
          id: blockId,
          pos: start + prefix.length,
          endPos: end + prefix.length,
        });
      }
    } else {
      // Empty selection: insert tokens
      const newText = val.slice(0, start) + prefix + suffix + val.slice(end);
      const cursor: FocusTarget = {
        id: blockId,
        pos: start + prefix.length,
        endPos: start + prefix.length,
      };
      update(blockId, { text: newText }, false, cursor);
      setPendingFocus({ id: blockId, pos: start + prefix.length });
    }
  }

  // Filtered slash commands based on current query
  const filteredCommands = slashMenu
    ? SLASH_COMMANDS.filter((cmd) => {
        if (!slashMenu.query) return true;
        const q = slashMenu.query.toLowerCase().trim();
        return (
          cmd.title.toLowerCase().includes(q) ||
          cmd.description.toLowerCase().includes(q) ||
          cmd.keywords.some((k) => k.toLowerCase().includes(q))
        );
      })
    : [];

  function executeSlashCommand(cmd: SlashCommand) {
    if (!slashMenu) return;
    const targetBlock = blocks[slashMenu.index];
    if (!targetBlock) return;

    if (cmd.type === "image") {
      update(
        targetBlock.id,
        {
          type: "image",
          text: "",
          caption: "",
        },
        false,
      );
      setSlashMenu(null);
      replaceTargetRef.current = targetBlock.id;
      fileInputRef.current?.click();
      return;
    }

    // Clean up slash command trigger text from block
    const cleanedText = targetBlock.text.replace(/^\/[a-zA-Z0-9#*`_-]*\s?/, "").trimStart();

    update(
      targetBlock.id,
      {
        type: cmd.type,
        text: cmd.type === "divider" ? "" : cleanedText,
        checked: cmd.type === "check" ? false : undefined,
        language: cmd.type === "code" ? "typescript" : undefined,
        calloutType: cmd.type === "callout" ? "info" : undefined,
      },
      false,
    );

    setSlashMenu(null);
    if (cmd.type === "divider") {
      if (slashMenu.index === blocks.length - 1) {
        insertBlockAfter(slashMenu.index, "p");
      }
    } else {
      setPendingFocus({ id: targetBlock.id, pos: 0 });
    }
  }

  // Image Upload handler
  async function handleUploadFile(file: File, targetBlockId?: string, insertAfterIndex?: number) {
    try {
      validateImageFile(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid image file.";
      toast.error(msg);
      return;
    }

    let blockId = targetBlockId;

    if (!blockId) {
      const nb: Block = {
        id: newBlockId(),
        type: "image",
        text: "",
        caption: "",
      };
      blockId = nb.id;
      onChange(
        (prevBlocks) => {
          const next = [...prevBlocks];
          const idx = insertAfterIndex !== undefined ? insertAfterIndex : next.length - 1;
          const activeBlock = next[idx];
          if (activeBlock && activeBlock.type === "p" && !activeBlock.text.trim()) {
            next[idx] = nb;
          } else {
            next.splice(idx + 1, 0, nb);
          }
          return next;
        },
        false,
        { id: nb.id, pos: 0, endPos: 0 },
      );
    }

    setUploadingIds((prev) => new Set([...prev, blockId!]));
    setUploadErrors((prev) => {
      const c = { ...prev };
      delete c[blockId!];
      return c;
    });

    try {
      const uploaded = await uploadNoteImage(file);
      // Functional updater guarantees that any simultaneous notes edits made
      // while the upload was in flight are completely preserved!
      onChange(
        (prevBlocks) =>
          prevBlocks.map((b) =>
            b.id === blockId
              ? {
                  ...b,
                  url: uploaded.url,
                  fileSize: uploaded.fileSize,
                  alt: file.name,
                  text: file.name,
                }
              : b,
          ),
        false,
        null,
      );
      toast.success("Image uploaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to upload image.";
      setUploadErrors((prev) => ({ ...prev, [blockId!]: msg }));
      toast.error(msg);
    } finally {
      setUploadingIds((prev) => {
        const s = new Set(prev);
        s.delete(blockId!);
        return s;
      });
    }
  }

  function triggerAddImage() {
    replaceTargetRef.current = null;
    fileInputRef.current?.click();
  }

  function triggerReplaceImage(blockId: string) {
    replaceTargetRef.current = blockId;
    fileInputRef.current?.click();
  }

  // Keyboard shortcut listener for blocks
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, i: number) {
    const b = blocks[i]!;
    const el = e.currentTarget;
    const start = el.selectionStart;
    const collapsed = start === el.selectionEnd;

    // 1. Intercept Slash Menu navigation
    if (slashMenu && slashMenu.blockId === b.id) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashMenu((prev) =>
          prev
            ? {
                ...prev,
                selectedIndex:
                  filteredCommands.length > 0
                    ? (prev.selectedIndex + 1) % filteredCommands.length
                    : 0,
              }
            : null,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashMenu((prev) =>
          prev
            ? {
                ...prev,
                selectedIndex:
                  filteredCommands.length > 0
                    ? (prev.selectedIndex - 1 + filteredCommands.length) % filteredCommands.length
                    : 0,
              }
            : null,
        );
        return;
      }
      if (e.key === "Enter" && filteredCommands.length > 0) {
        e.preventDefault();
        const selectedCmd = filteredCommands[slashMenu.selectedIndex];
        if (selectedCmd) executeSlashCommand(selectedCmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashMenu(null);
        return;
      }
    }

    // 2. Keyboard shortcuts (Ctrl+B for inline bold)
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        applyInlineFormat(b.id, "**");
        return;
      }
    }

    // 3. Enter key
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      if (b.type === "code") {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          insertBlockAfter(i, "p");
        }
        return;
      }

      e.preventDefault();

      // If in a list (bullet, number, check) and line is completely empty: convert back to standard paragraph
      if ((b.type === "bullet" || b.type === "number" || b.type === "check") && b.text === "") {
        update(b.id, { type: "p", checked: undefined }, false);
        return;
      }

      const before = b.text.slice(0, start);
      const after = b.text.slice(el.selectionEnd);

      const nextType: BlockType =
        b.type === "bullet" || b.type === "number" || b.type === "check" ? b.type : "p";

      const nb: Block = {
        id: newBlockId(),
        type: nextType,
        text: after,
        ...(nextType === "check" ? { checked: false } : {}),
      };

      const next = [...blocks];
      next[i] = { ...b, text: before };
      next.splice(i + 1, 0, nb);
      onChange(next, false, { id: nb.id, pos: 0, endPos: 0 });
      setPendingFocus({ id: nb.id, pos: 0 });
      return;
    }

    // 4. Backspace key at start of line
    if (e.key === "Backspace" && collapsed && start === 0) {
      // If not a paragraph, backspace converts it back to paragraph without losing text!
      if (b.type !== "p") {
        e.preventDefault();
        update(
          b.id,
          {
            type: "p",
            checked: undefined,
            language: undefined,
            calloutType: undefined,
          },
          false,
        );
        return;
      }
      // If already a paragraph and there is a preceding block, merge with previous block
      if (i > 0) {
        e.preventDefault();
        const prev = blocks[i - 1]!;
        const next = blocks.filter((x) => x.id !== b.id);
        const joinPos = prev.text.length;
        next[i - 1] = { ...prev, text: prev.text + b.text };
        onChange(next, false, { id: prev.id, pos: joinPos, endPos: joinPos });
        setPendingFocus({ id: prev.id, pos: joinPos });
      }
      return;
    }

    // 5. Arrow navigation across blocks
    if (e.key === "ArrowUp" && collapsed && !el.value.slice(0, start).includes("\n") && i > 0) {
      e.preventDefault();
      setPendingFocus({ id: blocks[i - 1]!.id, pos: Number.MAX_SAFE_INTEGER });
    } else if (
      e.key === "ArrowDown" &&
      collapsed &&
      !el.value.slice(start).includes("\n") &&
      i < blocks.length - 1
    ) {
      e.preventDefault();
      setPendingFocus({ id: blocks[i + 1]!.id, pos: 0 });
    }
  }

  // Instant Markdown typing shortcuts
  function onText(b: Block, text: string, i: number) {
    // 1. Divider shortcut: '---'
    if (text.startsWith("---") && (text === "---" || text.startsWith("--- "))) {
      const remaining = text.replace(/^---\s?/, "");
      const next = [...blocks];
      next[i] = { ...b, type: "divider", text: "" };
      const nb: Block = { id: newBlockId(), type: "p", text: remaining };
      next.splice(i + 1, 0, nb);
      onChange(next, false, { id: nb.id, pos: 0, endPos: 0 });
      setPendingFocus({ id: nb.id, pos: 0 });
      setSlashMenu(null);
      return;
    }

    // 2. Shortcuts at the start of a paragraph (only for simplified allowed types: bullet, number, check)
    if (b.type === "p") {
      if (text.startsWith("- ") || text.startsWith("* ")) {
        update(b.id, { type: "bullet", text: text.slice(2) }, false);
        setPendingFocus({ id: b.id, pos: 0 });
        setSlashMenu(null);
        return;
      }
      if (text.startsWith("1. ")) {
        update(b.id, { type: "number", text: text.slice(3) }, false);
        setPendingFocus({ id: b.id, pos: 0 });
        setSlashMenu(null);
        return;
      }
      if (text.startsWith("[] ") || text.startsWith("[ ] ")) {
        const len = text.startsWith("[ ] ") ? 4 : 3;
        update(b.id, { type: "check", text: text.slice(len), checked: false }, false);
        setPendingFocus({ id: b.id, pos: 0 });
        setSlashMenu(null);
        return;
      }
    }

    // 3. Slash menu trigger: if text starts with '/'
    if (text.startsWith("/")) {
      setSlashMenu({
        blockId: b.id,
        index: i,
        query: text.slice(1),
        selectedIndex: 0,
      });
    } else if (slashMenu && slashMenu.blockId === b.id) {
      setSlashMenu(null);
    }

    update(b.id, { text }, true);
  }

  // Clipboard Paste listener for screenshots & image files
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const currentIdx = activeId
            ? blocks.findIndex((b) => b.id === activeId)
            : blocks.length - 1;
          void handleUploadFile(file, undefined, currentIdx);
          return;
        }
      }
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;

    const currentIdx = activeId ? blocks.findIndex((b) => b.id === activeId) : blocks.length - 1;
    files.forEach((file, offset) => {
      void handleUploadFile(file, undefined, currentIdx + offset);
    });
  };

  // Close lightbox on Escape key
  useEffect(() => {
    if (!enlargedImage) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setEnlargedImage(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enlargedImage]);

  const active = blocks.find((b) => b.id === activeId);
  let numCounter = 0;

  return (
    <div
      className={cn(
        "relative transition-colors",
        isDraggingOver && "rounded-2xl ring-2 ring-primary/60 ring-dashed",
      )}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="Upload photo or screenshot"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) {
            const targetId = replaceTargetRef.current || undefined;
            replaceTargetRef.current = null;
            const currentIdx = activeId
              ? blocks.findIndex((b) => b.id === activeId)
              : blocks.length - 1;
            void handleUploadFile(file, targetId, currentIdx);
          }
        }}
      />

      {/* Drag & Drop Overlay indicator */}
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl bg-background/90 p-6 text-center backdrop-blur-xs animate-in fade-in">
          <ImageIcon className="mb-2 h-10 w-10 text-primary animate-bounce" />
          <p className="text-sm font-semibold text-foreground">Drop image here</p>
          <p className="text-xs text-muted-foreground">PNG, JPG, or WebP</p>
        </div>
      )}

      {/* Simplified, Sleek sticky toolbar */}
      <div
        role="toolbar"
        aria-label="Formatting"
        className="sticky top-14 z-10 -mx-1 mb-6 flex flex-wrap items-center gap-1 rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-xs backdrop-blur-md"
      >
        {/* Undo Button */}
        <button
          type="button"
          title="Undo (Ctrl+Z / ⌘Z)"
          aria-label="Undo"
          disabled={!canUndo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onUndo}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-35"
        >
          <Undo2 className="h-4 w-4" />
        </button>

        {/* Redo Button */}
        <button
          type="button"
          title="Redo (Ctrl+Shift+Z / Ctrl+Y / ⌘⇧Z)"
          aria-label="Redo"
          disabled={!canRedo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onRedo}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-35"
        >
          <Redo2 className="h-4 w-4" />
        </button>

        <div className="mx-1 h-5 w-px bg-border/60" aria-hidden />

        {/* Simplified Block Type Selector Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95"
            >
              {active?.type === "h1" && <Heading1 className="h-3.5 w-3.5" />}
              {active?.type === "h2" && <Heading2 className="h-3.5 w-3.5" />}
              {active?.type === "h3" && <Heading3 className="h-3.5 w-3.5" />}
              {active?.type === "bullet" && <List className="h-3.5 w-3.5" />}
              {active?.type === "number" && <ListOrdered className="h-3.5 w-3.5" />}
              {active?.type === "check" && <ListChecks className="h-3.5 w-3.5" />}
              {active?.type === "callout" && <Sparkles className="h-3.5 w-3.5" />}
              {active?.type === "code" && <Code2 className="h-3.5 w-3.5" />}
              {active?.type === "divider" && <Minus className="h-3.5 w-3.5" />}
              {active?.type === "image" && <ImageIcon className="h-3.5 w-3.5 text-primary" />}
              {(!active || active.type === "p") && <Pilcrow className="h-3.5 w-3.5" />}
              <span className="capitalize">{active?.type || "Text"}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Turn active block into
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SLASH_COMMANDS.map((cmd) => (
              <DropdownMenuItem
                key={cmd.type}
                onClick={() => activeId && setType(activeId, cmd.type)}
                className="gap-2 text-xs"
              >
                <cmd.icon className="h-4 w-4 text-muted-foreground" />
                <span>{cmd.title}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1 h-5 w-px bg-border/60" aria-hidden />

        {/* Text styling: Bold only */}
        <button
          type="button"
          title="Bold (Ctrl+B / ⌘B)"
          aria-label="Bold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => activeId && applyInlineFormat(activeId, "**")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        >
          <Bold className="h-4 w-4" />
        </button>

        {/* Image upload button */}
        <button
          type="button"
          title="Add Image or Screenshot"
          aria-label="Add Image"
          onClick={triggerAddImage}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        >
          <ImageIcon className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">Image</span>
        </button>

        <div className="mx-1 h-5 w-px bg-border/60" aria-hidden />

        {/* Insert Divider button */}
        <button
          type="button"
          title="Insert Divider"
          aria-label="Insert Divider"
          onClick={() => {
            const idx = activeId ? blocks.findIndex((b) => b.id === activeId) : blocks.length - 1;
            insertBlockAfter(idx, "divider");
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        >
          <Minus className="h-4 w-4" />
        </button>

        {onExportPdf && (
          <>
            <div className="ml-auto hidden h-5 w-px bg-border/60 md:block" aria-hidden />
            <button
              type="button"
              title="Export note as PDF"
              aria-label="Export as PDF"
              disabled={isExporting}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onExportPdf}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <FileDown className="h-3.5 w-3.5 text-primary" />
              )}
              <span className="hidden sm:inline">Export PDF</span>
            </button>
          </>
        )}
      </div>

      {/* Block List */}
      <div className="space-y-1">
        {blocks.map((b, i) => {
          numCounter = b.type === "number" ? numCounter + 1 : 0;
          const isSlashActive = slashMenu?.blockId === b.id;

          return (
            <div
              key={b.id}
              className="group/row relative flex items-start gap-1.5 rounded-lg transition-colors hover:bg-accent/20 md:gap-2"
            >
              {/* Block Action Grip Handle */}
              <div className="mt-1 flex shrink-0 items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Block actions"
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/row:opacity-100 focus:opacity-100"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuItem
                      onClick={() => duplicateBlock(b.id)}
                      className="gap-2 text-xs"
                    >
                      <CopyPlus className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Duplicate</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => moveBlock(i, "up")}
                      disabled={i === 0}
                      className="gap-2 text-xs"
                    >
                      <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Move up</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => moveBlock(i, "down")}
                      disabled={i === blocks.length - 1}
                      className="gap-2 text-xs"
                    >
                      <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Move down</span>
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2 text-xs">
                        <Pilcrow className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Turn into</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-48">
                        {SLASH_COMMANDS.map((cmd) => (
                          <DropdownMenuItem
                            key={cmd.type}
                            onClick={() => setType(b.id, cmd.type)}
                            className="gap-2 text-xs"
                          >
                            <cmd.icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{cmd.title}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => deleteBlock(b.id)}
                      className="gap-2 text-xs text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete block</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Block Content Renderers */}
              <div className="relative min-w-0 flex-1">
                {/* 1. Checklist Block */}
                {b.type === "check" && (
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={!!b.checked}
                      aria-label={b.checked ? "Uncheck item" : "Check item"}
                      onClick={() => update(b.id, { checked: !b.checked }, false)}
                      className={cn(
                        "mt-[5px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-all active:scale-90",
                        b.checked
                          ? "border-primary bg-primary text-primary-foreground shadow-xs"
                          : "border-muted-foreground/50 hover:border-primary",
                      )}
                    >
                      {b.checked && <Check className="h-3 w-3 stroke-[3]" />}
                    </button>
                    <AutoTextarea
                      ref={(el) => {
                        if (el) refs.current.set(b.id, el);
                        else refs.current.delete(b.id);
                      }}
                      value={b.text}
                      placeholder="To-do item…"
                      onChange={(v) => onText(b, v, i)}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      onFocus={() => setActiveId(b.id)}
                      className={cn(
                        b.checked &&
                          "text-muted-foreground line-through opacity-70 decoration-muted-foreground/60 transition-opacity",
                      )}
                    />
                  </div>
                )}

                {/* 2. Numbered List Block */}
                {b.type === "number" && (
                  <div className="flex items-start gap-2">
                    <span className="mt-px min-w-[1.6rem] shrink-0 select-none text-right font-mono text-[16px] leading-7 tabular-nums text-muted-foreground">
                      {numCounter}.
                    </span>
                    <AutoTextarea
                      ref={(el) => {
                        if (el) refs.current.set(b.id, el);
                        else refs.current.delete(b.id);
                      }}
                      value={b.text}
                      placeholder="List item…"
                      onChange={(v) => onText(b, v, i)}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      onFocus={() => setActiveId(b.id)}
                    />
                  </div>
                )}

                {/* 3. Bullet List Block */}
                {b.type === "bullet" && (
                  <div className="flex items-start gap-2">
                    <span className="mt-[11px] flex w-[1.5rem] shrink-0 select-none justify-center">
                      <span className="h-2 w-2 rounded-full bg-primary/70" />
                    </span>
                    <AutoTextarea
                      ref={(el) => {
                        if (el) refs.current.set(b.id, el);
                        else refs.current.delete(b.id);
                      }}
                      value={b.text}
                      placeholder="List item…"
                      onChange={(v) => onText(b, v, i)}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      onFocus={() => setActiveId(b.id)}
                    />
                  </div>
                )}

                {/* 4. Image Block */}
                {b.type === "image" && (
                  <div className="my-2.5 w-full" onClick={() => setActiveId(b.id)}>
                    {uploadingIds.has(b.id) ? (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary/5 p-8 text-center">
                        <Loader2 className="mb-2 h-7 w-7 animate-spin text-primary" />
                        <p className="text-xs font-medium text-foreground">Uploading image…</p>
                        <p className="text-[11px] text-muted-foreground">Processing securely</p>
                      </div>
                    ) : uploadErrors[b.id] ? (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-center">
                        <p className="mb-2 text-xs font-medium text-destructive">
                          {uploadErrors[b.id]}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => triggerReplaceImage(b.id)}
                            className="rounded-lg border bg-background px-3 py-1 text-xs font-medium shadow-xs hover:bg-accent"
                          >
                            Retry upload
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteBlock(b.id)}
                            className="rounded-lg bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : b.url ? (
                      <div className="group/img relative inline-block max-w-full">
                        <div className="relative overflow-hidden rounded-xl border border-border/70 bg-muted/20">
                          <img
                            src={b.url}
                            alt={b.alt || b.caption || "Note attachment"}
                            loading="lazy"
                            onClick={() =>
                              setEnlargedImage({ url: b.url!, caption: b.caption, alt: b.alt })
                            }
                            className="max-h-[500px] w-auto max-w-full cursor-zoom-in object-contain transition-transform duration-150 hover:brightness-95 active:scale-[0.99]"
                          />
                          <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/img:opacity-100 focus-within:opacity-100">
                            <button
                              type="button"
                              onClick={() =>
                                setEnlargedImage({ url: b.url!, caption: b.caption, alt: b.alt })
                              }
                              title="Click to enlarge"
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-foreground shadow-xs backdrop-blur hover:bg-background"
                            >
                              <ZoomIn className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => triggerReplaceImage(b.id)}
                              title="Replace image"
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-foreground shadow-xs backdrop-blur hover:bg-background"
                            >
                              <Upload className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteBlock(b.id)}
                              title="Remove image"
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/90 text-destructive-foreground shadow-xs backdrop-blur hover:bg-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={b.caption || ""}
                          placeholder="Add an optional caption…"
                          onChange={(e) => {
                            const cap = e.target.value;
                            update(b.id, { caption: cap, text: cap }, true);
                          }}
                          className="mt-1.5 block w-full bg-transparent text-center text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40 focus:text-foreground"
                        />
                      </div>
                    ) : (
                      <div
                        onClick={() => triggerReplaceImage(b.id)}
                        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 p-8 text-center transition-colors hover:border-primary/60 hover:bg-accent/40"
                      >
                        <ImageIcon className="mb-2 h-7 w-7 text-muted-foreground" />
                        <p className="text-xs font-medium text-foreground">
                          Click to select an image
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          PNG, JPG, or WebP up to 10 MB
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. Legacy Headings (strictly for viewing/editing legacy content) */}
                {b.type === "h1" && (
                  <AutoTextarea
                    ref={(el) => {
                      if (el) refs.current.set(b.id, el);
                      else refs.current.delete(b.id);
                    }}
                    value={b.text}
                    placeholder="Heading 1"
                    onChange={(v) => onText(b, v, i)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    onFocus={() => setActiveId(b.id)}
                    className="mt-3 min-h-[38px] text-2xl font-bold tracking-tight text-foreground md:text-3xl"
                  />
                )}
                {b.type === "h2" && (
                  <AutoTextarea
                    ref={(el) => {
                      if (el) refs.current.set(b.id, el);
                      else refs.current.delete(b.id);
                    }}
                    value={b.text}
                    placeholder="Heading 2"
                    onChange={(v) => onText(b, v, i)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    onFocus={() => setActiveId(b.id)}
                    className="mt-2 min-h-[32px] text-xl font-semibold tracking-tight text-foreground md:text-2xl"
                  />
                )}
                {b.type === "h3" && (
                  <AutoTextarea
                    ref={(el) => {
                      if (el) refs.current.set(b.id, el);
                      else refs.current.delete(b.id);
                    }}
                    value={b.text}
                    placeholder="Heading 3"
                    onChange={(v) => onText(b, v, i)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    onFocus={() => setActiveId(b.id)}
                    className="mt-1 min-h-[28px] text-lg font-semibold text-foreground md:text-xl"
                  />
                )}

                {/* 6. Legacy Callout Block */}
                {b.type === "callout" && (
                  <div
                    className={cn(
                      "my-1 flex w-full items-start gap-3 rounded-xl border p-3.5 shadow-2xs transition-colors",
                      b.calloutType === "tip" &&
                        "border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20",
                      b.calloutType === "warning" &&
                        "border-rose-500/30 bg-rose-500/10 dark:bg-rose-950/20",
                      b.calloutType === "quote" &&
                        "border-violet-500/30 bg-violet-500/10 dark:bg-violet-950/20",
                      (!b.calloutType || b.calloutType === "info") &&
                        "border-blue-500/30 bg-blue-500/10 dark:bg-blue-950/20",
                    )}
                  >
                    <button
                      type="button"
                      title="Click to cycle style (Info, Tip, Warning, Quote)"
                      aria-label="Callout type"
                      onClick={() => cycleCalloutType(b.id, b.calloutType)}
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/80 shadow-xs transition-transform hover:scale-105 active:scale-95"
                    >
                      {b.calloutType === "tip" && <Lightbulb className="h-4 w-4 text-amber-500" />}
                      {b.calloutType === "warning" && (
                        <AlertTriangle className="h-4 w-4 text-rose-500" />
                      )}
                      {b.calloutType === "quote" && <Quote className="h-4 w-4 text-violet-500" />}
                      {(!b.calloutType || b.calloutType === "info") && (
                        <Info className="h-4 w-4 text-blue-500" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <AutoTextarea
                        ref={(el) => {
                          if (el) refs.current.set(b.id, el);
                          else refs.current.delete(b.id);
                        }}
                        value={b.text}
                        placeholder="Highlight important notes or tips…"
                        onChange={(v) => onText(b, v, i)}
                        onKeyDown={(e) => onKeyDown(e, i)}
                        onFocus={() => setActiveId(b.id)}
                        className="text-[16px] leading-relaxed"
                      />
                    </div>
                  </div>
                )}

                {/* 7. Legacy Code Block */}
                {b.type === "code" && (
                  <div className="my-1.5 w-full overflow-hidden rounded-xl border border-border/80 bg-zinc-950 text-zinc-100 shadow-sm dark:bg-zinc-900/95">
                    <div className="flex h-9 items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-3 text-xs text-zinc-400">
                      <select
                        aria-label="Code language"
                        value={b.language || "typescript"}
                        onChange={(e) => update(b.id, { language: e.target.value }, false)}
                        className="rounded border-0 bg-transparent px-1.5 py-0.5 font-mono text-xs text-zinc-300 hover:text-white focus:outline-none"
                      >
                        {CODE_LANGUAGES.map((lang) => (
                          <option key={lang} value={lang} className="bg-zinc-900 text-zinc-100">
                            {lang}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => copyCode(b.id, b.text)}
                        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 active:scale-95"
                      >
                        {copiedId === b.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="w-full overflow-x-auto p-3.5">
                      <AutoTextarea
                        ref={(el) => {
                          if (el) refs.current.set(b.id, el);
                          else refs.current.delete(b.id);
                        }}
                        value={b.text}
                        placeholder="// Write or paste code here (Ctrl+Enter to exit)..."
                        onChange={(v) => onText(b, v, i)}
                        onKeyDown={(e) => onKeyDown(e, i)}
                        onFocus={() => setActiveId(b.id)}
                        className="font-mono text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                )}

                {/* 8. Divider Block */}
                {b.type === "divider" && (
                  <div
                    role="separator"
                    tabIndex={0}
                    onClick={() => setActiveId(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" || e.key === "Delete") {
                        e.preventDefault();
                        deleteBlock(b.id);
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        insertBlockAfter(i, "p");
                      }
                    }}
                    className="group/divider my-3 flex w-full cursor-pointer items-center py-2 outline-none"
                  >
                    <hr className="w-full border-t border-border/80 transition-colors group-hover/divider:border-primary group-focus/divider:border-primary" />
                  </div>
                )}

                {/* 9. Standard Paragraph Block */}
                {b.type === "p" && (
                  <AutoTextarea
                    ref={(el) => {
                      if (el) refs.current.set(b.id, el);
                      else refs.current.delete(b.id);
                    }}
                    value={b.text}
                    placeholder={
                      blocks.length === 1 && i === 0
                        ? "Type '/' for commands, or start writing…"
                        : ""
                    }
                    onChange={(v) => onText(b, v, i)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    onFocus={() => setActiveId(b.id)}
                  />
                )}

                {/* Interactive Slash Command Menu */}
                {isSlashActive && (
                  <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-72 max-w-[calc(100vw-3rem)] overflow-y-auto rounded-xl border border-border/90 bg-popover/95 p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                      Commands
                    </div>
                    {filteredCommands.length === 0 ? (
                      <div className="px-3 py-3 text-center text-xs text-muted-foreground">
                        No matching blocks
                      </div>
                    ) : (
                      filteredCommands.map((cmd, cmdIdx) => (
                        <button
                          key={cmd.type}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            executeSlashCommand(cmd);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                            cmdIdx === slashMenu.selectedIndex
                              ? "bg-accent text-accent-foreground font-medium"
                              : "text-foreground hover:bg-accent/60",
                          )}
                        >
                          <cmd.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium">{cmd.title}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {cmd.description}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Click-to-enlarge Lightbox modal */}
      {enlargedImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setEnlargedImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close image preview"
              onClick={() => setEnlargedImage(null)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-all hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={enlargedImage.url}
              alt={enlargedImage.alt || enlargedImage.caption || "Preview"}
              className="max-h-[85vh] max-w-[85vw] object-contain"
            />
            {enlargedImage.caption && (
              <div className="border-t bg-background/95 px-4 py-2.5 text-center text-xs text-muted-foreground">
                {enlargedImage.caption}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const AutoTextarea = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    placeholder: string;
    onChange: (v: string) => void;
    onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
    onFocus: () => void;
    className?: string | undefined;
  }
>(function AutoTextarea({ value, placeholder, onChange, onKeyDown, onFocus, className }, ref) {
  const inner = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      spellCheck
      className={cn(
        "block min-h-7 w-full resize-none overflow-hidden bg-transparent py-0 text-[17px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/50",
        className,
      )}
    />
  );
});
