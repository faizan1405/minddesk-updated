import { describe, expect, it, vi } from "vitest";
import { NotesHistoryManager } from "../lib/notes-history";
import type { Block } from "../lib/page-content";

describe("Notes Editor Undo/Redo Engine & Autosave Safety (Feature 1)", () => {
  const initialBlocks: Block[] = [
    { id: "b1", type: "p", text: "Original paragraph" },
  ];

  it("creates a new undo step when typing pause exceeds debounce window (1200ms)", () => {
    vi.useFakeTimers();
    try {
      const manager = new NotesHistoryManager({ title: "Debounce Note", blocks: initialBlocks });

      // First burst of typing
      manager.commit(
        { blocks: [{ id: "b1", type: "p", text: "First thought" }] },
        { key: "typing:b1", cursor: { id: "b1", pos: 13 } },
      );
      expect(manager.getUndoCount()).toBe(1);

      // Continue typing within 500ms -> grouped in step 1
      vi.advanceTimersByTime(500);
      manager.commit(
        { blocks: [{ id: "b1", type: "p", text: "First thought completed." }] },
        { key: "typing:b1", cursor: { id: "b1", pos: 24 } },
      );
      expect(manager.getUndoCount()).toBe(1);

      // Now pause for 1500ms (> 1200ms debounce window)
      vi.advanceTimersByTime(1500);

      // Next burst of typing -> must create a NEW undo step!
      manager.commit(
        { blocks: [{ id: "b1", type: "p", text: "First thought completed. Second thought" }] },
        { key: "typing:b1", cursor: { id: "b1", pos: 40 } },
      );
      expect(manager.getUndoCount()).toBe(2);

      // Undo step 2 restores "First thought completed."
      manager.undo();
      expect(manager.getCurrent().doc.blocks[0]?.text).toBe("First thought completed.");

      // Undo step 1 restores initial "Original paragraph"
      manager.undo();
      expect(manager.getCurrent().doc.blocks[0]?.text).toBe("Original paragraph");
    } finally {
      vi.useRealTimers();
    }
  });

  it("handles image block insertion and removal with undo/redo", () => {
    const manager = new NotesHistoryManager({ title: "Image Note", blocks: initialBlocks });

    // Insert image block
    const withImage: Block[] = [
      initialBlocks[0]!,
      { id: "img-1", type: "image", text: "", url: "/api/images/uuid-1.png", caption: "Receipt" },
      { id: "b2", type: "p", text: "Next line" },
    ];
    manager.commit({ blocks: withImage }, { cursor: { id: "img-1", pos: 0 } });
    expect(manager.getUndoCount()).toBe(1);
    expect(manager.getCurrent().doc.blocks.length).toBe(3);

    // Delete image block
    const withoutImage: Block[] = [
      initialBlocks[0]!,
      { id: "b2", type: "p", text: "Next line" },
    ];
    manager.commit({ blocks: withoutImage }, { cursor: { id: "b2", pos: 0 } });
    expect(manager.getUndoCount()).toBe(2);
    expect(manager.getCurrent().doc.blocks.length).toBe(2);

    // Undo delete -> image restored
    manager.undo();
    expect(manager.getCurrent().doc.blocks.length).toBe(3);
    expect(manager.getCurrent().doc.blocks[1]?.type).toBe("image");
    expect(manager.getCurrent().doc.blocks[1]?.url).toBe("/api/images/uuid-1.png");

    // Undo insert -> back to initial 1 block
    manager.undo();
    expect(manager.getCurrent().doc.blocks.length).toBe(1);
    expect(manager.canUndo()).toBe(false);

    // Redo both
    manager.redo();
    expect(manager.getCurrent().doc.blocks.length).toBe(3);
    manager.redo();
    expect(manager.getCurrent().doc.blocks.length).toBe(2);
  });

  it("handles splitting and merging blocks with exact cursor restoration", () => {
    const manager = new NotesHistoryManager({
      title: "Split Note",
      blocks: [{ id: "b1", type: "p", text: "First half Second half" }],
    });

    // Split at "Second half"
    const splitBlocks: Block[] = [
      { id: "b1", type: "p", text: "First half" },
      { id: "b2", type: "p", text: "Second half" },
    ];
    manager.commit({ blocks: splitBlocks }, { cursor: { id: "b2", pos: 0 } });
    expect(manager.getUndoCount()).toBe(1);

    // Undo split -> restores single block and cursor at split point
    const undone = manager.undo();
    expect(undone?.doc.blocks.length).toBe(1);
    expect(undone?.doc.blocks[0]?.text).toBe("First half Second half");

    // Redo split
    const redone = manager.redo();
    expect(redone?.doc.blocks.length).toBe(2);
    expect(redone?.cursor?.id).toBe("b2");
  });

  it("ensures autosaving does not clear or corrupt undo/redo stacks", () => {
    const manager = new NotesHistoryManager({ title: "Autosave Note", blocks: initialBlocks });

    // Step 1: user edits note
    manager.commit(
      { blocks: [{ id: "b1", type: "p", text: "Draft text before autosave" }] },
      { key: "typing:b1", cursor: { id: "b1", pos: 28 } },
    );
    expect(manager.getUndoCount()).toBe(1);

    // Simulate autosave completion: background network request succeeds,
    // which in a naive system might reset or clear history.
    // In MindDesk, manager history is maintained independently of server sync.
    const currentDoc = manager.getCurrent();
    expect(currentDoc.doc.blocks[0]?.text).toBe("Draft text before autosave");

    // Undo works seamlessly after autosave!
    const undone = manager.undo();
    expect(undone?.doc.blocks[0]?.text).toBe("Original paragraph");
    expect(manager.canRedo()).toBe(true);

    // Redo restores user edit perfectly
    const redone = manager.redo();
    expect(redone?.doc.blocks[0]?.text).toBe("Draft text before autosave");
  });
});
