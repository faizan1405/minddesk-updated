// Shared (client + server) structured page content format.
import { z } from "zod";

export const BLOCK_TYPES = ["p", "check", "number", "bullet"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BlockSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(BLOCK_TYPES),
  text: z.string().max(20000),
  checked: z.boolean().optional(),
});
export const ContentSchema = z.object({ blocks: z.array(BlockSchema).max(5000) });

export type Block = z.infer<typeof BlockSchema>;
export type PageContent = z.infer<typeof ContentSchema>;

export const newBlockId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const emptyContent = (): PageContent => ({ blocks: [{ id: newBlockId(), type: "p", text: "" }] });

/** Parse stored JSON safely; never throws. */
export function parseContent(raw: string | null | undefined): PageContent {
  if (!raw) return emptyContent();
  try {
    const r = ContentSchema.safeParse(JSON.parse(raw));
    if (r.success && r.data.blocks.length) return r.data;
  } catch {
    /* fall through */
  }
  return emptyContent();
}
