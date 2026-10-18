// Client-side loader for pdfmake with bundled Roboto virtual file system fonts.
// Dynamically imported to ensure zero SSR side effects.

let pdfMakeInstance: typeof import("pdfmake/build/pdfmake") | null = null;

export async function getPdfMake() {
  if (pdfMakeInstance) return pdfMakeInstance;

  const [pdfMakeModule, pdfFontsModule] = await Promise.all([
    import("pdfmake/build/pdfmake.js"),
    import("pdfmake/build/vfs_fonts.js"),
  ]);

  const pdfMake = (pdfMakeModule.default ||
    pdfMakeModule) as typeof import("pdfmake/build/pdfmake");
  const fonts = (pdfFontsModule.default || pdfFontsModule) as {
    pdfMake?: { vfs: Record<string, string> };
    vfs?: Record<string, string>;
    [key: string]: unknown;
  };

  const vfs = fonts.pdfMake?.vfs || fonts.vfs || (fonts as unknown as Record<string, string>);
  (pdfMake as unknown as { vfs: Record<string, string> }).vfs = vfs;

  pdfMakeInstance = pdfMake;
  return pdfMake;
}

/**
 * Universal helper to trigger a file download from a Blob across desktop and mobile browsers.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Sanitize a string to be safely used as a filename across Windows, macOS, and Linux.
 */
export function sanitizeFilename(name: string, fallback = "download"): string {
  const cleaned = name
    .trim()
    .replace(/[/\\?%*:|"<>]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 100);
  return cleaned || fallback;
}
