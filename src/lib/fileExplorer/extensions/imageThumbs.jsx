/**
 * Thumbnail provider for image/* entries.
 * Uses canvas to generate resized previews for the extension registry.
 */

const THUMB_SIZE = 128;

/**
 * Generate a thumbnail Blob from an image entry's data URL.
 * @param {string} dataUrl — the image data (from readEntryContent)
 * @param {number} size — target thumbnail dimension
 * @returns {Promise<Blob|null>}
 */
export async function generateThumbnail(dataUrl, size = THUMB_SIZE) {
  if (!dataUrl) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      // Center-crop to square
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      canvas.toBlob(blob => resolve(blob), 'image/webp', 0.85);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Extension descriptor for the registry.
 */
export const imageThumbnailExtension = {
  id: 'image-thumbnails',
  name: 'Image Thumbnails',

  /** Check if this entry is an image. */
  canHandle(entry) {
    return entry?.type === 'image';
  },

  /** Generate a thumbnail for the entry. */
  async getThumbnail(entry, { readContent, size } = {}) {
    if (!readContent) return null;
    const dataUrl = await readContent(entry);
    return generateThumbnail(dataUrl, size);
  },
};
