import { describe, expect, it } from "vitest";
import { getPdfMake } from "../lib/pdfmake-client";

describe("Mind Map PDF Export", () => {
  it("generates a valid A4 Landscape PDF buffer", async () => {
    const pdfMake = await getPdfMake();

    const sample1x1Png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const docDef = {
      pageSize: "A4" as const,
      pageOrientation: "landscape" as const,
      pageMargins: [36, 36, 36, 36] as [number, number, number, number],
      header: {
        columns: [
          { text: "Architecture Map", bold: true, fontSize: 10, color: "#0f172a" },
          { text: "Page 1 of 1", alignment: "right" as const, fontSize: 8.5, color: "#94a3b8" },
        ],
        margin: [36, 16, 36, 0] as [number, number, number, number],
      },
      content: [
        {
          image: sample1x1Png,
          fit: [769.89, 523.28],
          alignment: "center",
        },
      ],
    };

    const generator = (
      pdfMake as unknown as {
        createPdf: (d: unknown) => { getBuffer: (cb: (b: Uint8Array) => void) => void };
      }
    ).createPdf(docDef);
    const buffer = await new Promise<Uint8Array>((resolve, reject) => {
      generator.getBuffer((buf: Uint8Array) => {
        if (buf && buf.length > 0) resolve(buf);
        else reject(new Error("Buffer empty"));
      });
    });

    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(500);
    const header = String.fromCharCode(...buffer.slice(0, 4));
    expect(header).toBe("%PDF");
  });

  it("generates a valid A3 Landscape multipage PDF buffer", async () => {
    const pdfMake = await getPdfMake();

    const sample1x1Png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const docDef = {
      pageSize: "A3" as const,
      pageOrientation: "landscape" as const,
      pageMargins: [36, 36, 36, 36] as [number, number, number, number],
      content: [
        { text: "Overview Page", fontSize: 12, bold: true },
        { image: sample1x1Png, fit: [1118.55, 769.89] },
        { text: "Section 1", fontSize: 12, bold: true, pageBreak: "before" as const },
        { image: sample1x1Png, fit: [1118.55, 769.89] },
      ],
    };

    const generator = (
      pdfMake as unknown as {
        createPdf: (d: unknown) => { getBuffer: (cb: (b: Uint8Array) => void) => void };
      }
    ).createPdf(docDef);
    const buffer = await new Promise<Uint8Array>((resolve, reject) => {
      generator.getBuffer((buf: Uint8Array) => {
        if (buf && buf.length > 0) resolve(buf);
        else reject(new Error("Buffer empty"));
      });
    });

    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(1000);
    const header = String.fromCharCode(...buffer.slice(0, 4));
    expect(header).toBe("%PDF");
  });
});
