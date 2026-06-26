/** Client helpers for uploading portfolio images via the editor. */

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the selected file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an image and returns a stable serving URL (`/api/photos/{id}`).
 * Throws an Error with a user-friendly message on failure.
 */
export async function uploadPortfolioImage(
  file: File,
  category: 'avatar' | 'project'
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Image is too large. Please use an image under 5MB.');
  }

  const dataUrl = await fileToDataUrl(file);

  const res = await fetch('/api/portfolio/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, category }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(data?.error?.message ?? 'Upload failed. Please try again.');
  }

  const data = (await res.json()) as { url: string };
  return data.url;
}
