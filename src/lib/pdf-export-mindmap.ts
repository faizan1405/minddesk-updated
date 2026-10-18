import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";
import { toPng } from "html-to-image";
import { getPdfMake, downloadBlob, sanitizeFilename } from "./pdfmake-client";

export type PdfPageSize = "A4" | "A3";
export type PdfFormat = "single" | "multipage";
export type PdfTheme = "light" | "canvas";

export interface MindMapPdfOptions {
  viewportElement: HTMLElement;
  nodes: Node[];
  title: string;
  pageSize?: PdfPageSize | undefined;
  format?: PdfFormat | undefined;
  theme?: PdfTheme | undefined;
  canvasBgColor?: string | undefined;
}

// Page dimensions in PDF points (72 points per inch)
const PAGE_DIMENSIONS: Record<PdfPageSize, { width: number; height: number }> = {
  A4: { width: 841.89, height: 595.28 }, // 297 x 210 mm
  A3: { width: 1190.55, height: 841.89 }, // 420 x 297 mm
};

/**
 * Filter function to exclude UI buttons (like +/- collapse buttons),
 * handles, and editing controls during screenshot capture.
 */
function exportDomFilter(domNode: HTMLElement): boolean {
  if (domNode.tagName === "BUTTON") return false;
  if (domNode.classList?.contains("react-flow__handle")) return false;
  if (domNode.classList?.contains("nodrag")) return false;
  return true;
}

/**
 * Captures a specific bounding box of the ReactFlow viewport into a high-res PNG data URL.
 */
async function captureViewportBounds(
  viewportEl: HTMLElement,
  bounds: { x: number; y: number; width: number; height: number },
  backgroundColor: string,
  targetWidth: number,
  targetHeight: number,
): Promise<string> {
  const vp = getViewportForBounds(bounds, targetWidth, targetHeight, 0.05, 3, 0.05);

  const opts = {
    backgroundColor,
    width: targetWidth,
    height: targetHeight,
    pixelRatio: 2.5, // Crisp retina / print quality
    filter: exportDomFilter,
    style: {
      width: `${targetWidth}px`,
      height: `${targetHeight}px`,
      transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    },
  };

  return await toPng(viewportEl, opts);
}

/**
 * Exports a ReactFlow Mind Map into a professional PDF document.
 */
export async function exportMindMapToPdf(options: MindMapPdfOptions): Promise<void> {
  const {
    viewportEl,
    nodes,
    title,
    pageSize = "A4",
    format = "single",
    theme = "light",
    canvasBgColor = "#111827",
  } = { ...options, viewportEl: options.viewportElement };

  if (!viewportEl) {
    throw new Error("Canvas viewport element not found");
  }

  const mapTitle = title.trim() || "Mind Map";
  const dim = PAGE_DIMENSIONS[pageSize];
  const marginH = 36;
  const marginV = 36;
  const usableWidth = dim.width - marginH * 2;
  const usableHeight = dim.height - marginV * 2;

  // Background color for PDF & rendered canvas
  const isLight = theme === "light";
  const pdfBgColor = isLight ? "#ffffff" : canvasBgColor;
  const textColor = isLight ? "#0f172a" : "#f8fafc";
  const subtextColor = isLight ? "#64748b" : "#94a3b8";

  // Calculate bounding box of all currently visible nodes
  const rawBounds = getNodesBounds(nodes);
  const padding = 80;
  const bounds = {
    x: rawBounds.x - padding,
    y: rawBounds.y - padding,
    width: Math.max(400, rawBounds.width + padding * 2),
    height: Math.max(300, rawBounds.height + padding * 2),
  };

  // Dimensions for capturing the viewport
  const captureW = Math.min(3600, Math.max(800, bounds.width));
  const captureH = Math.min(2600, Math.max(600, bounds.height));

  const pdfMake = await getPdfMake();
  const pdfContent: unknown[] = [];

  if (format === "single") {
    // 1. Single Page Export: Fit complete map proportionally
    const fullImageDataUrl = await captureViewportBounds(
      viewportEl,
      bounds,
      pdfBgColor,
      captureW,
      captureH,
    );

    pdfContent.push({
      image: fullImageDataUrl,
      fit: [usableWidth, usableHeight],
      alignment: "center",
    });
  } else {
    // 2. Multipage Export: Overview page + Detailed sectional grid pages
    // Overview page first
    const overviewDataUrl = await captureViewportBounds(
      viewportEl,
      bounds,
      pdfBgColor,
      captureW,
      captureH,
    );

    pdfContent.push({
      text: `${mapTitle} — Overview`,
      fontSize: 12,
      bold: true,
      color: textColor,
      margin: [0, 0, 0, 6],
    });
    pdfContent.push({
      image: overviewDataUrl,
      fit: [usableWidth, usableHeight - 24],
      alignment: "center",
    });

    // Determine grid based on aspect ratio
    const aspect = bounds.width / bounds.height;
    let cols = 2;
    let rows = 2;
    if (aspect > 2.0) {
      cols = 2;
      rows = 1;
    } else if (aspect < 0.6) {
      cols = 1;
      rows = 2;
    }

    const tileW = bounds.width / cols;
    const tileH = bounds.height / rows;
    const overlap = 40; // overlap in canvas px so nodes on borders are never sliced

    let tileNum = 1;
    const totalTiles = cols * rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const xStart = bounds.x + c * tileW - (c > 0 ? overlap : 0);
        const yStart = bounds.y + r * tileH - (r > 0 ? overlap : 0);
        const tileBox = {
          x: xStart,
          y: yStart,
          width: tileW + (c > 0 ? overlap : 0) + (c < cols - 1 ? overlap : 0),
          height: tileH + (r > 0 ? overlap : 0) + (r < rows - 1 ? overlap : 0),
        };

        const tileImageDataUrl = await captureViewportBounds(
          viewportEl,
          tileBox,
          pdfBgColor,
          Math.min(2400, Math.max(800, tileBox.width * 1.5)),
          Math.min(1800, Math.max(600, tileBox.height * 1.5)),
        );

        const positionLabel =
          totalTiles === 2
            ? c === 0
              ? "Left"
              : "Right"
            : `Quadrant ${r === 0 ? "Top" : "Bottom"}-${c === 0 ? "Left" : "Right"}`;

        pdfContent.push({
          text: `Section ${tileNum} of ${totalTiles} (${positionLabel})`,
          fontSize: 11,
          bold: true,
          color: textColor,
          pageBreak: "before",
          margin: [0, 0, 0, 6],
        });
        pdfContent.push({
          image: tileImageDataUrl,
          fit: [usableWidth, usableHeight - 24],
          alignment: "center",
        });

        tileNum++;
      }
    }
  }

  // Construct PDF Document Definition
  const docDefinition = {
    pageSize: pageSize as "A4" | "A3",
    pageOrientation: "landscape" as const,
    pageMargins: [marginH, marginV, marginH, marginV] as [number, number, number, number],
    background: () => ({
      canvas: [
        {
          type: "rect" as const,
          x: 0,
          y: 0,
          w: dim.width,
          h: dim.height,
          color: pdfBgColor,
        },
      ],
    }),
    header: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: mapTitle,
          bold: true,
          fontSize: 10,
          color: textColor,
        },
        {
          text: pageCount > 1 ? `Page ${currentPage} of ${pageCount}` : "",
          alignment: "right" as const,
          fontSize: 8.5,
          color: subtextColor,
        },
      ],
      margin: [marginH, 16, marginH, 0] as [number, number, number, number],
    }),
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: `${mapTitle} • Exported from MindDesk`,
          fontSize: 8,
          color: subtextColor,
        },
        {
          text: pageSize,
          alignment: "right" as const,
          fontSize: 8,
          color: subtextColor,
        },
      ],
      margin: [marginH, 0, marginH, 14] as [number, number, number, number],
    }),
    content: pdfContent,
  };

  return new Promise((resolve, reject) => {
    try {
      const pdfDocGenerator = (
        pdfMake as unknown as {
          createPdf: (doc: unknown) => { getBlob: (cb: (b: Blob) => void) => void };
        }
      ).createPdf(docDefinition);

      pdfDocGenerator.getBlob((blob: Blob) => {
        try {
          const filename = `${sanitizeFilename(mapTitle)}.pdf`;
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
