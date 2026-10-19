import { describe, expect, it } from "vitest";
import { NotesHistoryManager } from "../lib/notes-history";
import type { Block } from "../lib/page-content";

describe("NotesHistoryManager — Reliable Undo/Redo Engine", () => {
  const initialBlocks: Block[] = [
    { id: "b1", type: "p", text: "Hello" },
  ];

  it("initializes with empty history and cannot undo or redo", () => {
    const manager = new NotesHistoryManager({ title: "My Note", blocks: initialBlocks });
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(false);
    expect(manager.getUndoCount()).toBe(0);
    expect(manager.getRedoCount()).toBe(0);
    expect(manager.getCurrent().doc.title).toBe("My Note");
    expect(manager.getCurrent().doc.blocks[0]?.text).toBe("Hello");
  });

  it("groups continuous typing into a single undo step when sharing a key within debounce window", () => {
    const manager = new NotesHistoryManager({ title: "Note", blocks: initialBlocks });

    // Step 1: type " "
    manager.commit(
      { blocks: [{ id: "b1", type: "p", text: "Hello " }] },
      { key: "typing:b1", cursor: { id: "b1", pos: 6 } },
    );

    // Step 2: type "W" immediately
    manager.commit(
      { blocks: [{ id: "b1", type: "p", text: "Hello W" }] },
      { key: "typing:b1", cursor: { id: "b1", pos: 7 } },
    );

    // Step 3: type "orld" immediately
    manager.commit(
      { blocks: [{ id: "b1", type: "p", text: "Hello World" }] },
      { key: "typing:b1", cursor: { id: "b1", pos: 11 } },
    );

    // Because all keystrokes shared key "typing:b1" and occurred synchronously,
    // they should be grouped into a single undo step.
    expect(manager.getUndoCount()).toBe(1);
    expect(manager.canUndo()).toBe(true);

    // Performing undo should restore initial state "Hello"
    const undone = manager.undo();
    expect(undone).not.toBeNull();
    expect(undone?.doc.blocks[0]?.text).toBe("Hello");
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(true);

    // Performing redo should restore "Hello World"
    const redone = manager.redo();
    expect(redone).not.toBeNull();
    expect(redone?.doc.blocks[0]?.text).toBe("Hello World");
    expect(redone?.cursor?.pos).toBe(11);
    expect(manager.canRedo()).toBe(false);
  });

  it("creates discrete undo steps for distinct operations like adding, deleting, and formatting blocks", () => {
    const manager = new NotesHistoryManager({ title: "Sprint Note", blocks: initialBlocks });

    // Action 1: Add a checklist block
    const newBlocks1: Block[] = [
      ...initialBlocks,
      { id: "b2", type: "check", text: "Ship feature", checked: false },
    ];
    manager.commit({ blocks: newBlocks1 }, { cursor: { id: "b2", pos: 12 } });
    expect(manager.getUndoCount()).toBe(1);

    // Action 2: Check the checklist item
    const newBlocks2: Block[] = [
      initialBlocks[0]!,
      { id: "b2", type: "check", text: "Ship feature", checked: true },
    ];
    manager.commit({ blocks: newBlocks2 }, { cursor: { id: "b2", pos: 12 } });
    expect(manager.getUndoCount()).toBe(2);

    // Action 3: Convert b1 to divider
    const newBlocks3: Block[] = [
      { id: "b1", type: "divider", text: "" },
      newBlocks2[1]!,
    ];
    manager.commit({ blocks: newBlocks3 }, { cursor: { id: "b1", pos: 0 } });
    expect(manager.getUndoCount()).toBe(3);

    // Undo Action 3 (restores b1 to "Hello" paragraph)
    manager.undo();
    expect(manager.getCurrent().doc.blocks[0]?.type).toBe("p");
    expect(manager.getCurrent().doc.blocks[0]?.text).toBe("Hello");
    expect(manager.getCurrent().doc.blocks[1]?.checked).toBe(true);

    // Undo Action 2 (unchecks the item)
    manager.undo();
    expect(manager.getCurrent().doc.blocks[1]?.checked).toBe(false);

    // Undo Action 1 (removes checklist item)
    manager.undo();
    expect(manager.getCurrent().doc.blocks.length).toBe(1);
    expect(manager.canUndo()).toBe(false);
  });

  it("tracks note title changes in undo/redo history and restores title cursor", () => {
    const manager = new NotesHistoryManager({ title: "Draft", blocks: initialBlocks });

    // Edit title
    manager.commit(
      { title: "Final Version" },
      { key: "typing:title", cursor: { isTitle: true, pos: 13 } },
    );
    expect(manager.canUndo()).toBe(true);
    expect(manager.getCurrent().doc.title).toBe("Final Version");

    // Undo restores title to "Draft"
    const undone = manager.undo();
    expect(undone?.doc.title).toBe("Draft");
    expect(manager.getCurrent().doc.title).toBe("Draft");

    // Redo restores title to "Final Version"
    const redone = manager.redo();
    expect(redone?.doc.title).toBe("Final Version");
    expect(redone?.cursor?.isTitle).toBe(true);
    expect(redone?.cursor?.pos).toBe(13);
  });

  it("clears the redo history when a new edit occurs after undoing", () => {
    const manager = new NotesHistoryManager({ title: "Note", blocks: initialBlocks });

    manager.commit({ blocks: [{ id: "b1", type: "p", text: "Edit 1" }] });
    manager.commit({ blocks: [{ id: "b1", type: "p", text: "Edit 2" }] });
    expect(manager.getUndoCount()).toBe(2);

    // Undo to Edit 1
    manager.undo();
    expect(manager.getCurrent().doc.blocks[0]?.text).toBe("Edit 1");
    expect(manager.canRedo()).toBe(true);

    // Make a brand new edit after undo
    manager.commit({ blocks: [{ id: "b1", type: "p", text: "Branch edit" }] });
    // Redo history must be cleared!
    expect(manager.canRedo()).toBe(false);
    expect(manager.getRedoCount()).toBe(0);
    expect(manager.getCurrent().doc.blocks[0]?.text).toBe("Branch edit");
  });

  it("keeps at least 100 undo steps per editing session (capacity limit >= 100)", () => {
    const manager = new NotesHistoryManager({ title: "Large Session", blocks: initialBlocks }, 150);

    for (let i = 1; i <= 120; i++) {
      manager.commit({ blocks: [{ id: "b1", type: "p", text: `Step ${i}` }] });
    }

    expect(manager.getUndoCount()).toBe(120);
    expect(manager.canUndo()).toBe(true);

    // Undo 120 times back to initial state
    for (let i = 0; i < 120; i++) {
      manager.undo();
    }
    expect(manager.getCurrent().doc.blocks[0]?.text).toBe("Hello");
    expect(manager.canUndo()).toBe(false);
    expect(manager.getRedoCount()).toBe(120);
  });

  it("ignores no-op commits without polluting undo history", () => {
    const manager = new NotesHistoryManager({ title: "Same", blocks: initialBlocks });

    // Same title and same blocks reference
    const changed = manager.commit({ title: "Same", blocks: initialBlocks });
    expect(changed).toBe(false);
    expect(manager.canUndo()).toBe(false);
  });
});
