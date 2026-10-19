import type { Block } from "./page-content";

export type FocusTarget = {
  id?: string | undefined;
  isTitle?: boolean | undefined;
  pos: number;
  endPos?: number | undefined;
};

export type NoteDoc = {
  title: string;
  blocks: Block[];
};

export type HistorySnapshot = {
  doc: NoteDoc;
  cursor?: FocusTarget | null | undefined;
};

export class NotesHistoryManager {
  private past: HistorySnapshot[] = [];
  private future: HistorySnapshot[] = [];
  private current: HistorySnapshot;
  private lastKey: { key: string; time: number } | null = null;
  private limit: number;

  constructor(initial: NoteDoc, limit = 150) {
    this.current = {
      doc: {
        title: initial.title,
        blocks: initial.blocks,
      },
      cursor: null,
    };
    this.limit = limit;
  }

  getCurrent(): HistorySnapshot {
    return this.current;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  getUndoCount(): number {
    return this.past.length;
  }

  getRedoCount(): number {
    return this.future.length;
  }

  setCursor(cursor: FocusTarget | null | undefined): void {
    this.current.cursor = cursor ?? null;
  }

  commit(
    next: Partial<NoteDoc>,
    options?: {
      key?: string | undefined;
      cursor?: FocusTarget | null | undefined;
      debounceMs?: number | undefined;
    },
  ): boolean {
    const nextTitle = next.title !== undefined ? next.title : this.current.doc.title;
    const nextBlocks = next.blocks !== undefined ? next.blocks : this.current.doc.blocks;

    const titleChanged = nextTitle !== this.current.doc.title;
    const blocksChanged = nextBlocks !== this.current.doc.blocks;

    if (!titleChanged && !blocksChanged) {
      if (options?.cursor !== undefined) {
        this.current.cursor = options.cursor;
      }
      return false;
    }

    const now = Date.now();
    const debounceMs = options?.debounceMs ?? 1200;
    const isMerge =
      options?.key &&
      this.lastKey?.key === options.key &&
      now - this.lastKey.time < debounceMs;

    if (!isMerge) {
      this.past.push({
        doc: {
          title: this.current.doc.title,
          blocks: this.current.doc.blocks,
        },
        cursor: this.current.cursor ?? null,
      });
      if (this.past.length > this.limit) {
        this.past.shift();
      }
      this.future = [];
    }

    this.lastKey = options?.key ? { key: options.key, time: now } : null;
    this.current = {
      doc: {
        title: nextTitle,
        blocks: nextBlocks,
      },
      cursor: options?.cursor !== undefined ? options.cursor : (this.current.cursor ?? null),
    };

    return true;
  }

  undo(): HistorySnapshot | null {
    if (this.past.length === 0) return null;
    const prev = this.past.pop()!;
    this.future.push({
      doc: {
        title: this.current.doc.title,
        blocks: this.current.doc.blocks,
      },
      cursor: this.current.cursor ?? null,
    });
    this.lastKey = null;
    this.current = prev;
    return this.current;
  }

  redo(): HistorySnapshot | null {
    if (this.future.length === 0) return null;
    const next = this.future.pop()!;
    this.past.push({
      doc: {
        title: this.current.doc.title,
        blocks: this.current.doc.blocks,
      },
      cursor: this.current.cursor ?? null,
    });
    this.lastKey = null;
    this.current = next;
    return this.current;
  }
}
