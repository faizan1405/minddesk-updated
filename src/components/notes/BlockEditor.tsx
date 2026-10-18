import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, FileDown, List, ListChecks, ListOrdered, Loader2, Pilcrow } from "lucide-react";
import { cn } from "@/lib/utils";
import { newBlockId, type Block, type BlockType } from "@/lib/page-content";

const TOOLBAR: { type: BlockType; label: string; icon: typeof List }[] = [
  { type: "p", label: "Text", icon: Pilcrow },
  { type: "check", label: "Checklist", icon: ListChecks },
  { type: "number", label: "Numbered list", icon: ListOrdered },
  { type: "bullet", label: "Bullet list", icon: List },
];

type Focus = { id: string; pos: number } | null;

export function BlockEditor({
  blocks, onChange, focusFirstSignal, onExportPdf, isExporting,
}: {
  blocks: Block[];
  onChange: (b: Block[]) => void;
  focusFirstSignal?: number;
  onExportPdf?: () => void;
  isExporting?: boolean;
}) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const [pendingFocus, setPendingFocus] = useState<Focus>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!pendingFocus) return;
    const el = refs.current.get(pendingFocus.id);
    if (el) {
      el.focus();
      const pos = Math.min(pendingFocus.pos, el.value.length);
      el.setSelectionRange(pos, pos);
    }
    setPendingFocus(null);
  }, [pendingFocus, blocks]);

  useLayoutEffect(() => {
    if (focusFirstSignal && blocks[0]) setPendingFocus({ id: blocks[0].id, pos: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFirstSignal]);

  const update = useCallback(
    (id: string, patch: Partial<Block>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b))),
    [blocks, onChange],
  );

  function setType(type: BlockType) {
    const id = activeId ?? blocks[blocks.length - 1]?.id;
    if (!id) return;
    const cur = blocks.find((b) => b.id === id);
    if (!cur) return;
    const next: BlockType = cur.type === type && type !== "p" ? "p" : type;
    update(id, { type: next, checked: next === "check" ? (cur.checked ?? false) : undefined });
    const el = refs.current.get(id);
    setPendingFocus({ id, pos: el?.selectionStart ?? cur.text.length });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, i: number) {
    const b = blocks[i]!;
    const el = e.currentTarget;
    const start = el.selectionStart;
    const collapsed = start === el.selectionEnd;

    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (b.type !== "p" && b.text === "") {
        update(b.id, { type: "p", checked: undefined });
        return;
      }
      const before = b.text.slice(0, start);
      const after = b.text.slice(el.selectionEnd);
      const nb: Block = { id: newBlockId(), type: b.type, text: after, ...(b.type === "check" ? { checked: false } : {}) };
      const next = [...blocks];
      next[i] = { ...b, text: before };
      next.splice(i + 1, 0, nb);
      onChange(next);
      setPendingFocus({ id: nb.id, pos: 0 });
      return;
    }

    if (e.key === "Backspace" && collapsed && start === 0) {
      if (b.type !== "p") {
        e.preventDefault();
        update(b.id, { type: "p", checked: undefined });
        return;
      }
      if (i > 0) {
        e.preventDefault();
        const prev = blocks[i - 1]!;
        const next = blocks.filter((x) => x.id !== b.id);
        next[i - 1] = { ...prev, text: prev.text + b.text };
        onChange(next);
        setPendingFocus({ id: prev.id, pos: prev.text.length });
      }
      return;
    }

    if (e.key === "ArrowUp" && collapsed && !el.value.slice(0, start).includes("\n") && i > 0) {
      e.preventDefault();
      setPendingFocus({ id: blocks[i - 1]!.id, pos: Number.MAX_SAFE_INTEGER });
    } else if (e.key === "ArrowDown" && collapsed && !el.value.slice(start).includes("\n") && i < blocks.length - 1) {
      e.preventDefault();
      setPendingFocus({ id: blocks[i + 1]!.id, pos: 0 });
    }
  }

  function onText(b: Block, text: string) {
    // Lightweight shortcuts at the start of a plain text line.
    if (b.type === "p") {
      const m = /^(- |\* |1\. |\[ ?\] )/.exec(text);
      if (m) {
        const t: BlockType = m[1]!.startsWith("1") ? "number" : m[1]!.startsWith("[") ? "check" : "bullet";
        update(b.id, { type: t, text: text.slice(m[1]!.length), ...(t === "check" ? { checked: false } : {}) });
        setPendingFocus({ id: b.id, pos: 0 });
        return;
      }
    }
    update(b.id, { text });
  }

  const active = blocks.find((b) => b.id === activeId);
  let num = 0;

  return (
    <div>
      <div
        role="toolbar"
        aria-label="Formatting"
        className="sticky top-14 z-10 -mx-1 mb-4 flex w-fit gap-1 rounded-full border bg-popover/95 p-1 shadow-sm backdrop-blur"
      >
        {TOOLBAR.map((t) => (
          <button
            key={t.type}
            type="button"
            title={t.label}
            aria-label={t.label}
            aria-pressed={active?.type === t.type}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setType(t.type)}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 md:h-9 md:w-9",
              active?.type === t.type && "bg-accent text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}
        {onExportPdf && (
          <>
            <div className="mx-0.5 my-1.5 w-px self-stretch bg-border/60" aria-hidden />
            <button
              type="button"
              title="Export as PDF"
              aria-label="Export as PDF"
              disabled={isExporting}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onExportPdf}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 disabled:opacity-50 md:h-9 md:w-9"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <FileDown className="h-4 w-4 text-primary" />
              )}
            </button>
          </>
        )}
      </div>

      <div className="space-y-0.5">
        {blocks.map((b, i) => {
          num = b.type === "number" ? num + 1 : 0;
          return (
            <div key={b.id} className="group flex items-start gap-2.5">
              {b.type === "check" && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!b.checked}
                  aria-label={b.checked ? "Uncheck item" : "Check item"}
                  onClick={() => update(b.id, { checked: !b.checked })}
                  className={cn(
                    "mt-[5px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors",
                    b.checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 hover:border-primary",
                  )}
                >
                  {b.checked && <Check className="h-3 w-3" strokeWidth={3} />}
                </button>
              )}
              {b.type === "number" && (
                <span className="mt-px min-w-[1.5rem] shrink-0 select-none text-right text-[17px] leading-7 tabular-nums text-muted-foreground">
                  {num}.
                </span>
              )}
              {b.type === "bullet" && (
                <span className="mt-[11px] flex w-[1.5rem] shrink-0 select-none justify-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                </span>
              )}
              <AutoTextarea
                ref={(el) => {
                  if (el) refs.current.set(b.id, el);
                  else refs.current.delete(b.id);
                }}
                value={b.text}
                placeholder={blocks.length === 1 && i === 0 ? "Start writing…" : b.type !== "p" ? "List item" : ""}
                onChange={(v) => onText(b, v)}
                onKeyDown={(e) => onKeyDown(e, i)}
                onFocus={() => setActiveId(b.id)}
                className={cn(b.type === "check" && b.checked && "text-muted-foreground line-through")}
              />
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
        "block min-h-7 w-full resize-none overflow-hidden bg-transparent py-0 text-[17px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/60",
        className,
      )}
    />
  );
});
