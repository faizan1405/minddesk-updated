import { api, isPreviewMode } from "@/lib/api-client";

export const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export type UploadedImage = {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

export function validateImageFile(file: File | Blob): void {
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new Error("File exceeds 10 MB maximum allowed size.");
  }

  const type = file.type.toLowerCase();
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (type && !allowed.includes(type)) {
    throw new Error("Unsupported format. Please select a PNG, JPG, or WebP image.");
  }
}

export async function uploadNoteImage(file: File): Promise<UploadedImage> {
  validateImageFile(file);

  const isPreview = await isPreviewMode();

  if (isPreview) {
    // In Preview Mode, convert file to dataUrl for immediate client preview
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });

    return api<UploadedImage>("/api/images", {
      method: "POST",
      body: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "image/png",
        dataUrl,
      },
    });
  }

  // Production / Staging: send multipart FormData
  const formData = new FormData();
  formData.append("file", file, file.name);

  const res = await fetch("/api/images", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!res.ok) {
    let message = "Image upload failed.";
    try {
      const err = await res.json();
      if (err?.error) message = err.error;
    } catch {
      // fallback
    }
    throw new Error(message);
  }

  return (await res.json()) as UploadedImage;
}
