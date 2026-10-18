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
  Code,
  Code2,
  Copy,
  CopyPlus,
  FileDown,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Info,
  Italic,
  Lightbulb,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Minus,
  Pilcrow,
  Quote,
  Sparkles,
  Strikethrough,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { newBlockId, type Block, type BlockType, type CalloutType } from "@/lib/page-content";
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

type FocusTarget = { id: string; pos: number; endPos?: number } | null;

interface SlashCommand {
  type: BlockType;
  title: string;
  description: string;
  icon: typeof List;
  keywords: string[];
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    type: "p",
    title: "Text",
    description: "Just start writing with plain text.",
    icon: Pilcrow,
    keywords: ["text", "paragraph", "plain", "p"],
  },
  {
    type: "h1",
    title: "Heading 1",
    description: "Large main section heading.",
    icon: Heading1,
    keywords: ["heading 1", "h1", "title", "large", "#"],
  },
  {
    type: "h2",
    title: "Heading 2",
    description: "Medium section heading.",
    icon: Heading2,
    keywords: ["heading 2", "h2", "subtitle", "medium", "##"],
  },
  {
    type: "h3",
    title: "Heading 3",
    description: "Small subsection heading.",
    icon: Heading3,
    keywords: ["heading 3", "h3", "subheading", "small", "###"],
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
    type: "callout",
    title: "Callout",
    description: "Highlight important tips or alerts.",
    icon: Sparkles,
    keywords: ["callout", "tip", "info", "warning", "note", "quote", ">"],
  },
  {
    type: "code",
    title: "Code Block",
    description: "Formatted code snippet with syntax container.",
    icon: Code2,
    keywords: ["code", "snippet", "syntax", "javascript", "python", "```"],
  },
  {
    type: "divider",
    title: "Divider",
    description: "Visually separate sections with a line.",
    icon: Minus,
    keywords: ["divider", "line", "separator", "hr", "rule", "---"],
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
}: {
  blocks: Block[];
  onChange: (b: Block[]) => void;
  focusFirstSignal?: number;
  onExportPdf?: () => void;
  isExporting?: boolean;
}) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const [pendingFocus, setPendingFocus] = useState<FocusTarget>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [slashMenu, setSlashMenu] = useState<{
    blockId: string;
    index: number;
    query: string;
    selectedIndex: number;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Focus management
  useLayoutEffect(() => {
    if (!pendingFocus) return;
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
    if (focusFirstSignal && blocks[0]) {
      setPendingFocus({ id: blocks[0].id, pos: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFirstSignal]);

  const update = useCallback(
    (id: string, patch: Partial<Block>) => {
      onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [blocks, onChange],
  );

  function setType(id: string, type: BlockType) {
    const cur = blocks.find((b) => b.id === id);
    if (!cur) return;
    const next: BlockType = cur.type === type && type !== "p" ? "p" : type;
    update(id, {
      type: next,
      checked: next === "check" ? (cur.checked ?? false) : undefined,
      language: next === "code" ? (cur.language ?? "typescript") : undefined,
      calloutType: next === "callout" ? (cur.calloutType ?? "info") : undefined,
      text: next === "divider" ? "" : cur.text,
    });
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
    const next = [...blocks];
    next.splice(index + 1, 0, nb);
    onChange(next);
    setPendingFocus({ id: nb.id, pos: 0 });
    setSlashMenu(null);
  }

  function duplicateBlock(id: string) {
    const index = blocks.findIndex((b) => b.id === id);
    if (index === -1) return;
    const source = blocks[index]!;
    const nb: Block = {
      ...source,
      id: newBlockId(),
    };
    const next = [...blocks];
    next.splice(index + 1, 0, nb);
    onChange(next);
    setPendingFocus({ id: nb.id, pos: source.text.length });
  }

  function deleteBlock(id: string) {
    if (blocks.length <= 1) {
      // Keep at least one empty paragraph block
      onChange([{ id: newBlockId(), type: "p", text: "" }]);
      return;
    }
    const index = blocks.findIndex((b) => b.id === id);
    const next = blocks.filter((b) => b.id !== id);
    onChange(next);
    const targetIdx = Math.max(0, index - 1);
    const target = next[targetIdx];
    if (target) {
      setPendingFocus({ id: target.id, pos: target.text.length });
    }
  }

  function moveBlock(index: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= blocks.length) return;
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    if (moved) {
      next.splice(targetIdx, 0, moved);
      onChange(next);
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
    update(id, { calloutType: nextType });
  }

  // Formatting helpers for text wrapping: Bold (**), Italic (*), Strike (~~), Code (`)
  function applyInlineFormat(blockId: string, prefix: string, suffix = prefix) {
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
        update(blockId, { text: newText });
        setPendingFocus({
          id: blockId,
          pos: start - prefix.length,
          endPos: end - prefix.length,
        });
      } else {
        // Wrap
        const newText = before + prefix + selected + suffix + after;
        update(blockId, { text: newText });
        setPendingFocus({
          id: blockId,
          pos: start + prefix.length,
          endPos: end + prefix.length,
        });
      }
    } else {
      // Empty selection: insert tokens
      const newText = val.slice(0, start) + prefix + suffix + val.slice(end);
      update(blockId, { text: newText });
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

    // Clean up slash command trigger text from block
    const cleanedText = targetBlock.text.replace(/^\/[a-zA-Z0-9#*`_-]*\s?/, "").trimStart();

    update(targetBlock.id, {
      type: cmd.type,
      text: cmd.type === "divider" ? "" : cleanedText,
      checked: cmd.type === "check" ? false : undefined,
      language: cmd.type === "code" ? "typescript" : undefined,
      calloutType: cmd.type === "callout" ? "info" : undefined,
    });

    setSlashMenu(null);
    if (cmd.type === "divider") {
      // If divider is created, auto-insert an empty text block below if at the end
      if (slashMenu.index === blocks.length - 1) {
        insertBlockAfter(slashMenu.index, "p");
      }
    } else {
      setPendingFocus({ id: targetBlock.id, pos: 0 });
    }
  }

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

    // 2. Inline markdown keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+E, Ctrl+Shift+X)
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        applyInlineFormat(b.id, "**");
        return;
      }
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        applyInlineFormat(b.id, "*");
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        applyInlineFormat(b.id, "`");
        return;
      }
    }
    if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      (e.key === "x" || e.key === "X" || e.key === "S")
    ) {
      e.preventDefault();
      applyInlineFormat(b.id, "~~");
      return;
    }

    // 3. Enter key
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      // In code blocks, Enter inserts a newline for multiline editing!
      if (b.type === "code") {
        // Shift+Enter or Ctrl+Enter exits code block and creates paragraph below
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          insertBlockAfter(i, "p");
        }
        return;
      }

      e.preventDefault();

      // If in a list (bullet, number, check) and line is completely empty: convert back to standard paragraph
      if ((b.type === "bullet" || b.type === "number" || b.type === "check") && b.text === "") {
        update(b.id, { type: "p", checked: undefined });
        return;
      }

      const before = b.text.slice(0, start);
      const after = b.text.slice(el.selectionEnd);

      // If in a list, new block inherits the list type. Headings/callouts create paragraph 'p' below
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
      onChange(next);
      setPendingFocus({ id: nb.id, pos: 0 });
      return;
    }

    // 4. Backspace key at start of line
    if (e.key === "Backspace" && collapsed && start === 0) {
      // If not a paragraph, backspace converts it back to paragraph without losing text!
      if (b.type !== "p") {
        e.preventDefault();
        update(b.id, {
          type: "p",
          checked: undefined,
          language: undefined,
          calloutType: undefined,
        });
        return;
      }
      // If already a paragraph and there is a preceding block, merge with previous block
      if (i > 0) {
        e.preventDefault();
        const prev = blocks[i - 1]!;
        const next = blocks.filter((x) => x.id !== b.id);
        const joinPos = prev.text.length;
        next[i - 1] = { ...prev, text: prev.text + b.text };
        onChange(next);
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
      onChange(next);
      setPendingFocus({ id: nb.id, pos: 0 });
      setSlashMenu(null);
      return;
    }

    // 2. Shortcuts at the start of a paragraph
    if (b.type === "p") {
      // Headings
      if (text.startsWith("# ")) {
        update(b.id, { type: "h1", text: text.slice(2) });
        setPendingFocus({ id: b.id, pos: 0 });
        setSlashMenu(null);
        return;
      }
      if (text.startsWith("## ")) {
        update(b.id, { type: "h2", text: text.slice(3) });
        setPendingFocus({ id: b.id, pos: 0 });
        setSlashMenu(null);
        return;
      }
      if (text.startsWith("### ")) {
        update(b.id, { type: "h3", text: text.slice(4) });
        setPendingFocus({ id: b.id, pos: 0 });
        setSlashMenu(null);
        return;
      }
      // Lists
      if (text.startsWith("- ") || text.startsWith("* ")) {
        update(b.id, { type: "bullet", text: text.slice(2) });
        setPendingFocus({ id: b.id, pos: 0 });
        setSlashMenu(null);
        return;
      }
      if (text.startsWith("1. ")) {
        update(b.id, { type: "number", text: text.slice(3) });
        setPendingFocus({ id: b.id, pos: 0 });
        setSlashMenu(null);
        return;
      }
      if (text.startsWith("[] ") || text.startsWith("[ ] ")) {
        const len = text.startsWith("[ ] ") ? 4 : 3;
        update(b.id, { type: "check", text: text.slice(len), checked: false });
        setPendingFocus({ id: b.id, pos: 0 });
        setSlashMenu(null);
        return;
      }
      // Callout
      if (text.startsWith("> ")) {
        update(b.id, { type: "callout", text: text.slice(2), calloutType: "info" });
        setPendingFocus({ id: b.id, pos: 0 });
        setSlashMenu(null);
        return;
      }
      // Code block
      if (text.startsWith("```") && (text === "```" || text.startsWith("``` "))) {
        update(b.id, {
          type: "code",
          text: text.slice(3).trimStart(),
          language: "typescript",
        });
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

    update(b.id, { text });
  }

  const active = blocks.find((b) => b.id === activeId);
  let numCounter = 0;

  return (
    <div className="relative">
      {/* Sleek sticky toolbar */}
      <div
        role="toolbar"
        aria-label="Formatting"
        className="sticky top-14 z-10 -mx-1 mb-6 flex flex-wrap items-center gap-1 rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-xs backdrop-blur-md"
      >
        {/* Quick Block Type Toggle Dropdown */}
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

        {/* Text styling buttons */}
        <button
          type="button"
          title="Bold (Ctrl+B)"
          aria-label="Bold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => activeId && applyInlineFormat(activeId, "**")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Italic (Ctrl+I)"
          aria-label="Italic"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => activeId && applyInlineFormat(activeId, "*")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Strikethrough (Ctrl+Shift+X)"
          aria-label="Strikethrough"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => activeId && applyInlineFormat(activeId, "~~")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        >
          <Strikethrough className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Inline Code (Ctrl+E)"
          aria-label="Inline Code"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => activeId && applyInlineFormat(activeId, "`")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        >
          <Code className="h-4 w-4" />
        </button>

        <div className="mx-1 h-5 w-px bg-border/60" aria-hidden />

        {/* Insert block buttons */}
        <button
          type="button"
          title="Insert Callout"
          aria-label="Insert Callout"
          onClick={() => {
            const idx = activeId ? blocks.findIndex((b) => b.id === activeId) : blocks.length - 1;
            insertBlockAfter(idx, "callout");
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        >
          <Sparkles className="h-4 w-4 text-amber-500/80" />
        </button>
        <button
          type="button"
          title="Insert Code Block"
          aria-label="Insert Code Block"
          onClick={() => {
            const idx = activeId ? blocks.findIndex((b) => b.id === activeId) : blocks.length - 1;
            insertBlockAfter(idx, "code");
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        >
          <Code2 className="h-4 w-4 text-blue-500/80" />
        </button>
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
                      onClick={() => update(b.id, { checked: !b.checked })}
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
                      className={cn(b.checked && "text-muted-foreground line-through opacity-75")}
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

                {/* 4. Headings */}
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

                {/* 5. Callout Block */}
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

                {/* 6. Code Block */}
                {b.type === "code" && (
                  <div className="my-1.5 w-full overflow-hidden rounded-xl border border-border/80 bg-zinc-950 text-zinc-100 shadow-sm dark:bg-zinc-900/95">
                    <div className="flex h-9 items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-3 text-xs text-zinc-400">
                      <select
                        aria-label="Code language"
                        value={b.language || "typescript"}
                        onChange={(e) => update(b.id, { language: e.target.value })}
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

                {/* 7. Divider Block */}
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

                {/* 8. Standard Paragraph Block */}
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
