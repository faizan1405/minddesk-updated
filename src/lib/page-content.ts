// Shared (client + server) structured page content format.
import { z } from "zod";

export const BLOCK_TYPES = [
  "p",
  "h1",
  "h2",
  "h3",
  "bullet",
  "number",
  "check",
  "callout",
  "code",
  "divider",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const CALLOUT_TYPES = ["info", "tip", "warning", "quote"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

export const BlockSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(BLOCK_TYPES),
  text: z.string().max(20000),
  checked: z.boolean().optional(),
  language: z.string().max(40).optional(),
  calloutType: z.enum(CALLOUT_TYPES).optional(),
});
export const ContentSchema = z.object({ blocks: z.array(BlockSchema).max(5000) });

export type Block = z.infer<typeof BlockSchema>;
export type PageContent = z.infer<typeof ContentSchema>;

export const newBlockId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const emptyContent = (): PageContent => ({
  blocks: [{ id: newBlockId(), type: "p", text: "" }],
});

/** Parse stored JSON safely; never throws and never loses legacy user data. */
export function parseContent(raw: string | null | undefined): PageContent {
  if (!raw) return emptyContent();
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const r = ContentSchema.safeParse(parsed);
    if (r.success && r.data.blocks.length) return r.data;

    // Resilient fallback: sanitize individual blocks so partial legacy or slightly malformed data is preserved
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { blocks?: unknown[] }).blocks)
    ) {
      const rawBlocks = (parsed as { blocks: unknown[] }).blocks;
      const sanitized: Block[] = [];
      interface LooseBlock {
        id?: unknown;
        type?: unknown;
        text?: unknown;
        checked?: unknown;
        language?: unknown;
        calloutType?: unknown;
      }
      for (const item of rawBlocks) {
        if (item && typeof item === "object") {
          const rawItem = item as LooseBlock;
          const type = (BLOCK_TYPES as readonly string[]).includes(String(rawItem.type))
            ? (rawItem.type as BlockType)
            : "p";
          sanitized.push({
            id:
              typeof rawItem.id === "string" && rawItem.id ? rawItem.id.slice(0, 40) : newBlockId(),
            type,
            text: typeof rawItem.text === "string" ? rawItem.text.slice(0, 20000) : "",
            ...(type === "check" ? { checked: Boolean(rawItem.checked) } : {}),
            ...(type === "code" && typeof rawItem.language === "string"
              ? { language: rawItem.language.slice(0, 40) }
              : {}),
            ...(type === "callout" &&
            (CALLOUT_TYPES as readonly string[]).includes(String(rawItem.calloutType))
              ? { calloutType: rawItem.calloutType as CalloutType }
              : {}),
          });
        }
      }
      if (sanitized.length > 0) return { blocks: sanitized };
    }
  } catch {
    /* fall through */
  }
  return emptyContent();
}
