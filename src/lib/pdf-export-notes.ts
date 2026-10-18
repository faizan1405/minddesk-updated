import type { Block } from "./page-content";
import { getPdfMake, downloadBlob, sanitizeFilename } from "./pdfmake-client";

// Inline text fragment for pdfmake
type TextFragment = {
  text: string;
  bold?: boolean | undefined;
  italics?: boolean | undefined;
  decoration?: "lineThrough" | "underline" | undefined;
  color?: string | undefined;
  background?: string | undefined;
  font?: string | undefined;
  fontSize?: number | undefined;
};

/**
 * Parses markdown inline text formatting (**bold**, *italic*, ~~strikethrough~~, `code`)
 * into styled pdfmake text fragments.
 */
export function parseInlineFormatting(
  rawText: string,
  options: { defaultColor?: string; strikethrough?: boolean } = {},
): TextFragment[] {
  const { defaultColor = "#1e293b", strikethrough = false } = options;

  if (!rawText) {
    return [{ text: "", color: strikethrough ? "#94a3b8" : defaultColor }];
  }

  // Tokenize regex matching bold-italic (*** or ___), bold (** or __), italic (* or _), strikethrough (~~), and code (`)
  const regex =
    /(\*\*\*[\s\S]+?\*\*\*|___[\s\S]+?___|\*\*[\s\S]+?\*\*|__[\s\S]+?__|\*[\s\S]+?\*|_[\s\S]+?_|~~[\s\S]+?~~|`[^`]+`)/g;

  const fragments: TextFragment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    // Plain text before match
    if (match.index > lastIndex) {
      fragments.push({
        text: rawText.slice(lastIndex, match.index),
        color: strikethrough ? "#94a3b8" : defaultColor,
        decoration: strikethrough ? "lineThrough" : undefined,
      });
    }

    const token = match[0];
    if (token.startsWith("***") && token.endsWith("***") && token.length > 6) {
      fragments.push({
        text: token.slice(3, -3),
        bold: true,
        italics: true,
        color: strikethrough ? "#94a3b8" : defaultColor,
        decoration: strikethrough ? "lineThrough" : undefined,
      });
    } else if (token.startsWith("___") && token.endsWith("___") && token.length > 6) {
      fragments.push({
        text: token.slice(3, -3),
        bold: true,
        italics: true,
        color: strikethrough ? "#94a3b8" : defaultColor,
        decoration: strikethrough ? "lineThrough" : undefined,
      });
    } else if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      fragments.push({
        text: token.slice(2, -2),
        bold: true,
        color: strikethrough ? "#94a3b8" : "#0f172a",
        decoration: strikethrough ? "lineThrough" : undefined,
      });
    } else if (token.startsWith("__") && token.endsWith("__") && token.length > 4) {
      fragments.push({
        text: token.slice(2, -2),
        bold: true,
        color: strikethrough ? "#94a3b8" : "#0f172a",
        decoration: strikethrough ? "lineThrough" : undefined,
      });
    } else if (token.startsWith("*") && token.endsWith("*") && token.length > 2) {
      fragments.push({
        text: token.slice(1, -1),
        italics: true,
        color: strikethrough ? "#94a3b8" : defaultColor,
        decoration: strikethrough ? "lineThrough" : undefined,
      });
    } else if (token.startsWith("_") && token.endsWith("_") && token.length > 2) {
      fragments.push({
        text: token.slice(1, -1),
        italics: true,
        color: strikethrough ? "#94a3b8" : defaultColor,
        decoration: strikethrough ? "lineThrough" : undefined,
      });
    } else if (token.startsWith("~~") && token.endsWith("~~") && token.length > 4) {
      fragments.push({
        text: token.slice(2, -2),
        decoration: "lineThrough",
        color: "#94a3b8",
      });
    } else if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      fragments.push({
        text: token.slice(1, -1),
        background: "#f1f5f9",
        color: "#0f172a",
        decoration: strikethrough ? "lineThrough" : undefined,
      });
    } else {
      fragments.push({
        text: token,
        color: strikethrough ? "#94a3b8" : defaultColor,
        decoration: strikethrough ? "lineThrough" : undefined,
      });
    }

    lastIndex = match.index + token.length;
  }

  // Trailing text
  if (lastIndex < rawText.length) {
    fragments.push({
      text: rawText.slice(lastIndex),
      color: strikethrough ? "#94a3b8" : defaultColor,
      decoration: strikethrough ? "lineThrough" : undefined,
    });
  }

  return fragments.length > 0 ? fragments : [{ text: "" }];
}

// Crisp SVGs for checkboxes
const CHECKED_BOX_SVG = `<svg viewBox="0 0 16 16" width="13" height="13">
  <rect width="16" height="16" rx="4" fill="#2563eb" />
  <path d="M4 8.2l2.8 2.8 5.2-5.5" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
</svg>`;

const UNCHECKED_BOX_SVG = `<svg viewBox="0 0 16 16" width="13" height="13">
  <rect x="0.75" y="0.75" width="14.5" height="14.5" rx="3.5" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5" />
</svg>`;

/**
 * Builds the complete pdfmake document definition for a Note.
 */
export function buildNotePdfDocDefinition(note: { title: string; blocks: Block[] }) {
  const noteTitle = note.title.trim() || "Untitled Note";

  const content: unknown[] = [
    // Main Document Title
    {
      text: noteTitle,
      fontSize: 24,
      bold: true,
      color: "#0f172a",
      margin: [0, 0, 0, 8],
    },
    // Decorative subtle divider rule
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 487, // 595 - 2*54
          y2: 0,
          lineWidth: 1,
          lineColor: "#e2e8f0",
        },
      ],
      margin: [0, 0, 0, 16],
    },
  ];

  let listCounter = 0;

  for (let i = 0; i < note.blocks.length; i++) {
    const block = note.blocks[i]!;
    const rawText = block.text || "";

    // Track sequential numbering
    if (block.type === "number") {
      listCounter += 1;
    } else {
      listCounter = 0;
    }

    if (block.type === "p") {
      // Check for Markdown headings in paragraph blocks
      if (rawText.startsWith("# ") && rawText.length > 2) {
        content.push({
          text: parseInlineFormatting(rawText.slice(2).trim(), { defaultColor: "#0f172a" }),
          fontSize: 18,
          bold: true,
          color: "#0f172a",
          margin: [0, 14, 0, 4],
          keepWithNext: true,
        });
      } else if (rawText.startsWith("## ") && rawText.length > 3) {
        content.push({
          text: parseInlineFormatting(rawText.slice(3).trim(), { defaultColor: "#1e293b" }),
          fontSize: 15,
          bold: true,
          color: "#1e293b",
          margin: [0, 12, 0, 3],
          keepWithNext: true,
        });
      } else if (rawText.startsWith("### ") && rawText.length > 4) {
        content.push({
          text: parseInlineFormatting(rawText.slice(4).trim(), { defaultColor: "#334155" }),
          fontSize: 13,
          bold: true,
          color: "#334155",
          margin: [0, 10, 0, 2],
          keepWithNext: true,
        });
      } else if (rawText.startsWith("#### ") && rawText.length > 5) {
        content.push({
          text: parseInlineFormatting(rawText.slice(5).trim(), { defaultColor: "#475569" }),
          fontSize: 11.5,
          bold: true,
          color: "#475569",
          margin: [0, 8, 0, 2],
          keepWithNext: true,
        });
      } else {
        // Standard paragraph
        content.push({
          text: parseInlineFormatting(rawText),
          fontSize: 11,
          lineHeight: 1.45,
          margin: [0, 2, 0, 4],
        });
      }
    } else if (block.type === "check") {
      const isChecked = Boolean(block.checked);
      content.push({
        table: {
          widths: [18, "*"],
          body: [
            [
              {
                svg: isChecked ? CHECKED_BOX_SVG : UNCHECKED_BOX_SVG,
                margin: [0, 2, 0, 0],
              },
              {
                text: parseInlineFormatting(rawText, {
                  defaultColor: isChecked ? "#94a3b8" : "#1e293b",
                  strikethrough: isChecked,
                }),
                fontSize: 11,
                lineHeight: 1.45,
              },
            ],
          ],
        },
        layout: "noBorders",
        margin: [0, 2, 0, 3],
      });
    } else if (block.type === "number") {
      content.push({
        table: {
          widths: [20, "*"],
          body: [
            [
              {
                text: `${listCounter}.`,
                fontSize: 11,
                bold: true,
                color: "#64748b",
                alignment: "right",
              },
              {
                text: parseInlineFormatting(rawText),
                fontSize: 11,
                lineHeight: 1.45,
              },
            ],
          ],
        },
        layout: "noBorders",
        margin: [0, 2, 0, 3],
      });
    } else if (block.type === "bullet") {
      content.push({
        table: {
          widths: [16, "*"],
          body: [
            [
              {
                text: "•",
                fontSize: 14,
                bold: true,
                color: "#3b82f6",
                alignment: "center",
              },
              {
                text: parseInlineFormatting(rawText),
                fontSize: 11,
                lineHeight: 1.45,
              },
            ],
          ],
        },
        layout: "noBorders",
        margin: [0, 2, 0, 3],
      });
    }
  }

  // Fallback for empty note
  if (note.blocks.length === 0 || (note.blocks.length === 1 && !note.blocks[0]!.text.trim())) {
    content.push({
      text: "This note is empty.",
      italics: true,
      color: "#94a3b8",
      fontSize: 11,
      margin: [0, 10, 0, 0],
    });
  }

  return {
    pageSize: "A4" as const,
    pageOrientation: "portrait" as const,
    pageMargins: [54, 54, 54, 54] as [number, number, number, number],
    background: () => ({
      canvas: [
        {
          type: "rect" as const,
          x: 0,
          y: 0,
          w: 595.28,
          h: 841.89,
          color: "#ffffff",
        },
      ],
    }),
    header: (currentPage: number) => {
      if (currentPage === 1) return null;
      return {
        columns: [
          { text: noteTitle, fontSize: 8.5, color: "#94a3b8", bold: true },
          { text: "MindDesk Notes", alignment: "right" as const, fontSize: 8.5, color: "#cbd5e1" },
        ],
        margin: [54, 24, 54, 0] as [number, number, number, number],
      };
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: "Exported from MindDesk", fontSize: 8, color: "#94a3b8" },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          alignment: "right" as const,
          fontSize: 8,
          color: "#94a3b8",
        },
      ],
      margin: [54, 0, 54, 24] as [number, number, number, number],
    }),
    defaultStyle: {
      font: "Roboto",
      fontSize: 11,
      color: "#1e293b",
    },
    content,
  };
}

/**
 * Exports a note to professional PDF and triggers immediate download.
 */
export async function exportNoteToPdf(note: { title: string; blocks: Block[] }): Promise<void> {
  const pdfMake = await getPdfMake();
  const docDefinition = buildNotePdfDocDefinition(note);

  return new Promise((resolve, reject) => {
    try {
      const pdfDocGenerator = (
        pdfMake as unknown as {
          createPdf: (doc: unknown) => { getBlob: (cb: (b: Blob) => void) => void };
        }
      ).createPdf(docDefinition);
      pdfDocGenerator.getBlob((blob: Blob) => {
        try {
          const filename = `${sanitizeFilename(note.title || "Untitled Note")}.pdf`;
          downloadBlob(blob, filename);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
